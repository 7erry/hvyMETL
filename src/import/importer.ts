/**
 * The csvToAtlas import engine.
 *
 * Builds MongoDB documents from parsed CSV files (honoring the modeling
 * rules in coerce.ts) and writes them to Atlas with concurrency-safe
 * semantics: any row carrying a deterministic _id is upserted with
 * replaceOne, so the same row imported twice — or by two parallel chunk
 * imports — always lands on the same document exactly once.
 *
 * Supported shapes:
 *   - single CSV               -> one document per row
 *   - partitioned CSVs         -> identical headers, concatenated (ETL chunks)
 *   - related CSVs + --join    -> rows merged into one document per join value
 *   - --parent + --embed       -> child rows embedded as arrays on the parent
 */

import { MongoClient, type AnyBulkWriteOperation, type Document } from 'mongodb';
import { basename } from 'node:path';
import type { WriteConcernSetting } from '../types.js';
import { rowToDocument, type CsvDocument } from './coerce.js';
import type { ParsedCsvFile } from './analyze.js';

/** How many bulk operations to send to Atlas per batch. */
const BULK_BATCH_SIZE = 1000;
/** How many documents the schema summary samples. */
const SCHEMA_SAMPLE_SIZE = 200;

/** One embed instruction: which file's rows become which array field. */
export type EmbedSpec = {
  /** CSV file (matched by basename) whose rows get embedded. */
  file: string;
  /** Array field name created on the parent document. */
  field: string;
};

/** Everything one import run needs. */
export type ImportOptions = {
  files: ParsedCsvFile[];
  collectionName: string;
  /** Field linking related CSVs (or null for single/partitioned imports). */
  joinField: string | null;
  /** Basename of the parent CSV in embed mode (null otherwise). */
  parentFile: string | null;
  embeds: EmbedSpec[];
  /** True drops the existing collection first (explicit opt-in only). */
  drop: boolean;
  mongoUri: string;
  dbName: string;
  writeConcern: WriteConcernSetting;
  /** True when files share identical headers (chunked partitions). */
  arePartitions: boolean;
};

/** Result JSON matching the csvToAtlas skill's documented fields. */
export type ImportResult = {
  collectionName: string;
  insertedCount: number;
  upsertedCount: number;
  modifiedCount: number;
  indexesCreated: string[];
  recommendedIndexes: { field: string; reason: string }[];
  schemaSummary: Record<string, string[]>;
  merge: {
    mode: 'single' | 'partitions' | 'join' | 'embed';
    skippedMissingJoinKey: number;
    skippedMissingParent: number;
    mergedDocuments: number;
  };
};

/** Convert every row of a file into documents. */
function fileToDocuments(file: ParsedCsvFile): CsvDocument[] {
  return file.rows.map((cells) => rowToDocument(file.headers, cells));
}

/** Read a join value off a document, tolerating nested paths. */
function joinValueOf(document: CsvDocument, joinField: string): unknown {
  return joinField.split('.').reduce<unknown>((cursor, segment) => {
    if (cursor && typeof cursor === 'object') return (cursor as Record<string, unknown>)[segment];
    return undefined;
  }, document);
}

/**
 * Build the final document list according to the requested merge mode.
 * Returns the documents plus the merge statistics for the result report.
 */
export function buildDocuments(options: ImportOptions): { documents: CsvDocument[]; merge: ImportResult['merge'] } {
  const { files, joinField, parentFile, embeds } = options;

  // Embed mode: child rows become arrays on their parent documents.
  if (parentFile && embeds.length > 0 && joinField) {
    const parent = files.find((file) => basename(file.path) === parentFile);
    if (!parent) throw new Error(`--parent file "${parentFile}" was not among the input CSVs.`);

    const parents = fileToDocuments(parent);
    const parentByJoin = new Map<string, CsvDocument>();
    let skippedMissingJoinKey = 0;
    for (const document of parents) {
      const joinValue = joinValueOf(document, joinField);
      if (joinValue === null || joinValue === undefined) {
        skippedMissingJoinKey += 1;
        continue;
      }
      if (document._id === undefined || document._id === null) document._id = String(joinValue);
      parentByJoin.set(String(joinValue), document);
    }

    let skippedMissingParent = 0;
    for (const embed of embeds) {
      const childFile = files.find((file) => basename(file.path) === embed.file);
      if (!childFile) throw new Error(`--embed file "${embed.file}" was not among the input CSVs.`);
      for (const childDocument of fileToDocuments(childFile)) {
        const joinValue = joinValueOf(childDocument, joinField);
        if (joinValue === null || joinValue === undefined) {
          skippedMissingJoinKey += 1;
          continue;
        }
        const parentDocument = parentByJoin.get(String(joinValue));
        if (!parentDocument) {
          skippedMissingParent += 1;
          continue;
        }
        const existing = parentDocument[embed.field];
        if (Array.isArray(existing)) existing.push(childDocument);
        else parentDocument[embed.field] = [childDocument];
      }
    }

    return {
      documents: [...parentByJoin.values()],
      merge: { mode: 'embed', skippedMissingJoinKey, skippedMissingParent, mergedDocuments: parentByJoin.size },
    };
  }

  // Join mode: one document per join value, fields merged across files.
  if (files.length > 1 && joinField && !options.arePartitions) {
    const mergedByJoin = new Map<string, CsvDocument>();
    let skippedMissingJoinKey = 0;
    for (const file of files) {
      for (const document of fileToDocuments(file)) {
        const joinValue = joinValueOf(document, joinField);
        if (joinValue === null || joinValue === undefined) {
          skippedMissingJoinKey += 1;
          continue;
        }
        const key = String(joinValue);
        const existing = mergedByJoin.get(key);
        if (existing) {
          // Later files enrich the document; null cells never overwrite data.
          for (const [field, value] of Object.entries(document)) {
            if (value !== null || existing[field] === undefined) existing[field] = value;
          }
        } else {
          if (document._id === undefined || document._id === null) document._id = key;
          mergedByJoin.set(key, document);
        }
      }
    }
    return {
      documents: [...mergedByJoin.values()],
      merge: { mode: 'join', skippedMissingJoinKey, skippedMissingParent: 0, mergedDocuments: mergedByJoin.size },
    };
  }

  // Partitions or single file: straight concatenation.
  const documents = files.flatMap(fileToDocuments);
  return {
    documents,
    merge: {
      mode: files.length > 1 ? 'partitions' : 'single',
      skippedMissingJoinKey: 0,
      skippedMissingParent: 0,
      mergedDocuments: documents.length,
    },
  };
}

/** Summarize the document shape from a sample (field -> observed types). */
export function summarizeSchema(documents: CsvDocument[]): Record<string, string[]> {
  const typesByField = new Map<string, Set<string>>();
  for (const document of documents.slice(0, SCHEMA_SAMPLE_SIZE)) {
    for (const [field, value] of Object.entries(document)) {
      const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      const set = typesByField.get(field) ?? new Set<string>();
      set.add(type);
      typesByField.set(field, set);
    }
  }
  return Object.fromEntries([...typesByField.entries()].map(([field, types]) => [field, [...types].sort()]));
}

/** Recommend indexes from the observed document shape. */
export function recommendIndexes(schemaSummary: Record<string, string[]>, joinField: string | null): { field: string; reason: string }[] {
  const recommendations: { field: string; reason: string }[] = [];
  for (const field of Object.keys(schemaSummary)) {
    if (field === '_id') continue;
    if (field === joinField) continue; // already created during import
    if (/Id$|_id$/.test(field)) {
      recommendations.push({ field, reason: 'Looks like a foreign reference; equality lookups will need an index.' });
    } else if (/(At$|_at$|date|Date|windowStart)/.test(field)) {
      recommendations.push({ field, reason: 'Timestamp field; range queries and sorts will need an index.' });
    }
  }
  return recommendations;
}

/** Run the import against Atlas and return the result report. */
export async function runImport(options: ImportOptions): Promise<ImportResult> {
  const { documents, merge } = buildDocuments(options);
  const schemaSummary = summarizeSchema(documents);

  const client = new MongoClient(options.mongoUri, {
    writeConcern: { w: options.writeConcern.w, journal: options.writeConcern.journal },
  });

  try {
    await client.connect();
    const collection = client.db(options.dbName).collection(options.collectionName);

    if (options.drop) await collection.drop().catch(() => undefined);

    let insertedCount = 0;
    let upsertedCount = 0;
    let modifiedCount = 0;

    // Batched bulk writes: rows with a deterministic _id become idempotent
    // replaceOne upserts (safe under parallel chunk imports); rows without
    // one are plain inserts.
    for (let offset = 0; offset < documents.length; offset += BULK_BATCH_SIZE) {
      const batch = documents.slice(offset, offset + BULK_BATCH_SIZE);
      const operations: AnyBulkWriteOperation<Document>[] = batch.map((document) => {
        if (document._id !== undefined && document._id !== null) {
          const { _id, ...replacement } = document;
          return { replaceOne: { filter: { _id }, replacement, upsert: true } };
        }
        return { insertOne: { document } };
      });
      const result = await collection.bulkWrite(operations, { ordered: false });
      insertedCount += result.insertedCount;
      upsertedCount += result.upsertedCount;
      modifiedCount += result.modifiedCount;
    }

    // Index the join field so post-import lookups are immediately usable.
    const indexesCreated: string[] = [];
    if (options.joinField && options.joinField !== '_id' && documents.length > 0) {
      const indexName = await collection.createIndex({ [options.joinField]: 1 });
      indexesCreated.push(indexName);
    }

    return {
      collectionName: options.collectionName,
      insertedCount: insertedCount + upsertedCount,
      upsertedCount,
      modifiedCount,
      indexesCreated,
      recommendedIndexes: recommendIndexes(schemaSummary, options.joinField),
      schemaSummary,
      merge,
    };
  } finally {
    await client.close();
  }
}
