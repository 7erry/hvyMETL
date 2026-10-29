/** Context-aware mongosh / MongoDB API completions for the Shell editor. */

export type MongoShellCompletion = {
  label: string;
  insert: string;
  detail?: string;
  /** `member` replaces only the identifier after the last `.`; `token` replaces the partial word at the caret. */
  mode?: 'line' | 'member' | 'token';
};

export type MongoShellSchemaCollection = {
  name: string;
  fields: string[];
};

export type MongoShellSchemaContext = {
  database?: string;
  collections: MongoShellSchemaCollection[];
};

const COLLECTION_METHODS: { name: string; insert: string; signature: string }[] = [
  { name: 'find', insert: 'find(', signature: 'find(query?, projection?)' },
  { name: 'findAndModify', insert: 'findAndModify(', signature: 'findAndModify(document)' },
  { name: 'findOne', insert: 'findOne(', signature: 'findOne(query?, projection?)' },
  { name: 'findOneAndDelete', insert: 'findOneAndDelete(', signature: 'findOneAndDelete(filter, options?)' },
  { name: 'findOneAndReplace', insert: 'findOneAndReplace(', signature: 'findOneAndReplace(filter, replacement, options?)' },
  { name: 'findOneAndUpdate', insert: 'findOneAndUpdate(', signature: 'findOneAndUpdate(filter, update, options?)' },
  { name: 'aggregate', insert: 'aggregate([', signature: 'aggregate(pipeline, options?)' },
  { name: 'countDocuments', insert: 'countDocuments(', signature: 'countDocuments(query?, options?)' },
  { name: 'estimatedDocumentCount', insert: 'estimatedDocumentCount(', signature: 'estimatedDocumentCount(options?)' },
  { name: 'distinct', insert: 'distinct(', signature: 'distinct(field, query?, options?)' },
  { name: 'insertOne', insert: 'insertOne(', signature: 'insertOne(document, options?)' },
  { name: 'insertMany', insert: 'insertMany([', signature: 'insertMany(documents, options?)' },
  { name: 'updateOne', insert: 'updateOne(', signature: 'updateOne(filter, update, options?)' },
  { name: 'updateMany', insert: 'updateMany(', signature: 'updateMany(filter, update, options?)' },
  { name: 'replaceOne', insert: 'replaceOne(', signature: 'replaceOne(filter, replacement, options?)' },
  { name: 'deleteOne', insert: 'deleteOne(', signature: 'deleteOne(filter, options?)' },
  { name: 'deleteMany', insert: 'deleteMany(', signature: 'deleteMany(filter, options?)' },
  { name: 'bulkWrite', insert: 'bulkWrite([', signature: 'bulkWrite(operations, options?)' },
  { name: 'createIndex', insert: 'createIndex(', signature: 'createIndex(keys, options?)' },
  { name: 'getIndexes', insert: 'getIndexes()', signature: 'getIndexes()' },
  { name: 'drop', insert: 'drop()', signature: 'drop()' },
  { name: 'stats', insert: 'stats()', signature: 'stats(scale?)' },
];

/** Query operators for find() / filter documents (MongoDB query language). */
const FIND_QUERY_OPERATORS: { name: string; insert: string; detail: string }[] = [
  // Comparison
  { name: '$eq', insert: '$eq: ', detail: 'comparison · equal' },
  { name: '$gt', insert: '$gt: ', detail: 'comparison · greater than' },
  { name: '$gte', insert: '$gte: ', detail: 'comparison · greater or equal' },
  { name: '$in', insert: '$in: [', detail: 'comparison · in array' },
  { name: '$lt', insert: '$lt: ', detail: 'comparison · less than' },
  { name: '$lte', insert: '$lte: ', detail: 'comparison · less or equal' },
  { name: '$ne', insert: '$ne: ', detail: 'comparison · not equal' },
  { name: '$nin', insert: '$nin: [', detail: 'comparison · not in array' },
  // Logical
  { name: '$and', insert: '$and: [', detail: 'logical · and' },
  { name: '$not', insert: '$not: {', detail: 'logical · not' },
  { name: '$nor', insert: '$nor: [', detail: 'logical · nor' },
  { name: '$or', insert: '$or: [', detail: 'logical · or' },
  // Element
  { name: '$exists', insert: '$exists: ', detail: 'element · field exists' },
  { name: '$type', insert: '$type: ', detail: 'element · BSON type' },
  // Evaluation
  { name: '$expr', insert: '$expr: {', detail: 'evaluation · aggregation expression' },
  { name: '$jsonSchema', insert: '$jsonSchema: {', detail: 'evaluation · JSON schema' },
  { name: '$mod', insert: '$mod: [', detail: 'evaluation · modulo' },
  { name: '$regex', insert: '$regex: ', detail: 'evaluation · regular expression' },
  { name: '$text', insert: '$text: {', detail: 'evaluation · text search' },
  { name: '$where', insert: '$where: ', detail: 'evaluation · JavaScript expression' },
  // Array
  { name: '$all', insert: '$all: [', detail: 'array · contains all' },
  { name: '$elemMatch', insert: '$elemMatch: {', detail: 'array · element match' },
  { name: '$size', insert: '$size: ', detail: 'array · size' },
  // Bitwise
  { name: '$bitsAllClear', insert: '$bitsAllClear: ', detail: 'bitwise · all bits clear' },
  { name: '$bitsAllSet', insert: '$bitsAllSet: ', detail: 'bitwise · all bits set' },
  { name: '$bitsAnyClear', insert: '$bitsAnyClear: ', detail: 'bitwise · any bit clear' },
  { name: '$bitsAnySet', insert: '$bitsAnySet: ', detail: 'bitwise · any bit set' },
];

/** Aggregation / update operators (shown outside find-filter context). */
const OTHER_MONGO_OPERATORS: { name: string; insert: string; detail: string }[] = [
  { name: '$match', insert: '$match: {', detail: 'aggregation · match' },
  { name: '$group', insert: '$group: {', detail: 'aggregation · group' },
  { name: '$project', insert: '$project: {', detail: 'aggregation · project' },
  { name: '$sort', insert: '$sort: {', detail: 'aggregation · sort' },
  { name: '$limit', insert: '$limit: ', detail: 'aggregation · limit' },
  { name: '$skip', insert: '$skip: ', detail: 'aggregation · skip' },
  { name: '$lookup', insert: '$lookup: {', detail: 'aggregation · lookup' },
  { name: '$unwind', insert: '$unwind: ', detail: 'aggregation · unwind' },
  { name: '$addFields', insert: '$addFields: {', detail: 'aggregation · addFields' },
  { name: '$set', insert: '$set: {', detail: 'update / aggregation · set' },
  { name: '$unset', insert: '$unset: ', detail: 'update · unset' },
  { name: '$inc', insert: '$inc: {', detail: 'update · increment' },
  { name: '$push', insert: '$push: {', detail: 'update · push' },
  { name: '$pull', insert: '$pull: {', detail: 'update · pull' },
  { name: '$sum', insert: '$sum: ', detail: 'accumulator · sum' },
  { name: '$avg', insert: '$avg: ', detail: 'accumulator · avg' },
  { name: '$first', insert: '$first: ', detail: 'accumulator · first' },
  { name: '$last', insert: '$last: ', detail: 'accumulator · last' },
  { name: '$count', insert: '$count: ', detail: 'aggregation · count' },
];

const FIND_FILTER_CALL =
  /\.(?:find|findOne|findOneAnd\w*|countDocuments|delete(?:One|Many)|update(?:One|Many)|replaceOne)\s*\(/;

function operatorsForContext(before: string): { name: string; insert: string; detail: string }[] {
  // Inside find()/filter args: query operators only (comparison, logical, …)
  if (FIND_FILTER_CALL.test(before)) {
    return FIND_QUERY_OPERATORS;
  }
  return [...FIND_QUERY_OPERATORS, ...OTHER_MONGO_OPERATORS];
}

export const MONGO_SHELL_COMPLETIONS: MongoShellCompletion[] = [
  { label: 'show collections', insert: 'show collections' },
  { label: 'show tables', insert: 'show tables' },
  { label: 'show dbs', insert: 'show dbs' },
  { label: 'show databases', insert: 'show databases' },
  { label: 'show users', insert: 'show users' },
  { label: 'show roles', insert: 'show roles' },
  { label: 'show profile', insert: 'show profile' },
  { label: 'use <database>', insert: 'use ' },
  { label: 'db.getCollectionNames()', insert: 'db.getCollectionNames()' },
  { label: 'db.runCommand({ ping: 1 })', insert: 'db.runCommand({ ping: 1 })' },
  { label: 'db.stats()', insert: 'db.stats()' },
  { label: 'db.getSiblingDB()', insert: "db.getSiblingDB('')" },
  { label: 'db.getCollection()', insert: "db.getCollection('" },
  { label: 'db.adminCommand({ listDatabases: 1 })', insert: 'db.adminCommand({ listDatabases: 1 })' },
  { label: 'printjson()', insert: 'printjson(' },
];

/** Parse introspect JSON into a schema context for autocomplete. */
export function schemaContextFromIntrospect(parsed: unknown): MongoShellSchemaContext | null {
  if (Array.isArray(parsed)) {
    const collections = collectionRowsFromUnknownList(parsed);
    return collections.length > 0 ? { collections } : null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const rec = parsed as { database?: unknown; collections?: unknown };
  if (!Array.isArray(rec.collections)) return null;
  const collections = collectionRowsFromUnknownList(rec.collections);
  return {
    database: typeof rec.database === 'string' ? rec.database : undefined,
    collections,
  };
}

function collectionRowsFromUnknownList(items: unknown[]): MongoShellSchemaCollection[] {
  const collections: MongoShellSchemaCollection[] = [];
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      collections.push({ name: item.trim(), fields: [] });
      continue;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as { name?: unknown; fields?: unknown };
    if (typeof row.name !== 'string' || !row.name.trim()) continue;
    const fields = Array.isArray(row.fields)
      ? row.fields.filter((f): f is string => typeof f === 'string' && f.length > 0)
      : [];
    collections.push({ name: row.name, fields });
  }
  return collections;
}

/**
 * Fast names-only list for Shell replicate.
 * Uses getSiblingDB(name) so a database path on the URI cannot override the pick-list selection.
 */
export function mongoShellListCollectionsScript(database: string): string {
  const dbName = database.trim();
  if (!dbName) throw new Error('Database name is required to list collections.');
  return `print(EJSON.stringify({
  database: ${JSON.stringify(dbName)},
  collections: db.getSiblingDB(${JSON.stringify(dbName)}).getCollectionNames().slice(0, 500).map((name) => ({ name: name, fields: [] })),
}, null, 2));`;
}

/** @deprecated Prefer mongoShellListCollectionsScript(database) */
export const MONGO_SHELL_LIST_COLLECTIONS_SCRIPT = `print(EJSON.stringify({
  database: db.getName(),
  collections: db.getCollectionNames().slice(0, 500).map((name) => ({ name: name, fields: [] })),
}, null, 2));`;

/** listDatabases for Shell replicate source DB pick list. */
export const MONGO_SHELL_LIST_DATABASES_SCRIPT = `print(EJSON.stringify({
  databases: db.adminCommand({ listDatabases: 1, nameOnly: true }).databases.map((d) => d.name),
}, null, 2));`;

/** Script mongosh can run to sample collection names + top-level fields. */
export const MONGO_SHELL_INTROSPECT_SCRIPT = `(() => {
  const names = db.getCollectionNames().slice(0, 80);
  const collections = names.map((name) => {
    let fields = [];
    try {
      const doc = db.getCollection(name).findOne();
      if (doc) fields = Object.keys(doc).filter((k) => k !== '__v').slice(0, 40);
    } catch (e) {}
    return { name, fields };
  });
  print(EJSON.stringify({ database: db.getName(), collections }, null, 2));
})();`;

function collectionFromLine(linePrefix: string): string | null {
  const getColl = /db\.getCollection\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(linePrefix);
  if (getColl?.[1]) return getColl[1];
  const dotted = /db\.(\w+)\./.exec(linePrefix);
  return dotted?.[1] ?? null;
}

function tokenPartial(before: string): { partial: string; start: number } {
  const m = /(\$?[\w]*)$/.exec(before);
  const partial = m?.[1] ?? '';
  return { partial, start: before.length - partial.length };
}

/** Completions matching the token/line prefix at the caret. */
export function mongoShellCompletionsFor(
  script: string,
  caret: number,
  schema?: MongoShellSchemaContext | null,
): MongoShellCompletion[] {
  const before = script.slice(0, caret);
  const lineStart = Math.max(before.lastIndexOf('\n') + 1, 0);
  const lineBefore = before.slice(lineStart);
  const linePrefix = lineBefore.trimStart();
  const collections = schema?.collections ?? [];

  if (!linePrefix) {
    return MONGO_SHELL_COMPLETIONS.slice(0, 8);
  }

  // MongoDB operators: …$gt  or after { ,
  const opCtx = /(?:\{|,|\[)\s*(\$[\w]*)$/.exec(lineBefore);
  if (opCtx) {
    const partial = opCtx[1].toLowerCase();
    return operatorsForContext(before)
      .filter((o) => o.name.toLowerCase().startsWith(partial))
      .slice(0, 32)
      .map((o) => ({
        label: o.name,
        insert: o.insert,
        detail: o.detail,
        mode: 'token' as const,
      }));
  }

  // Field names inside object literals after a known collection call
  const fieldCtx = /(?:\{|,)\s*(["']?)([A-Za-z_][\w.]*)?$/.exec(lineBefore);
  if (fieldCtx && !lineBefore.trimEnd().endsWith('.')) {
    const collName = collectionFromLine(linePrefix);
    const coll = collName
      ? collections.find((c) => c.name === collName)
      : undefined;
    if (coll?.fields.length) {
      const quote = fieldCtx[1] ?? '';
      const partial = (fieldCtx[2] ?? '').toLowerCase();
      const fields = coll.fields
        .filter((f) => f.toLowerCase().startsWith(partial))
        .slice(0, 12)
        .map((f) => ({
          label: f,
          insert: quote ? `${f}` : `${f}: `,
          detail: `${coll.name} field`,
          mode: 'token' as const,
        }));
      if (fields.length) return fields;
    }
  }

  // db.accounts.fi  or  db.getCollection("orders").find
  const member = /^(db(?:\.\w+|\.getCollection\s*\(\s*['"][^'"]*['"]\s*\))+)\.(\w*)$/.exec(
    linePrefix.replace(/;?\s*$/, ''),
  );
  if (member) {
    const receiver = member[1];
    const partial = member[2].toLowerCase();
    return COLLECTION_METHODS.filter((m) => m.name.toLowerCase().startsWith(partial))
      .slice(0, 12)
      .map((m) => ({
        label: `${receiver}.${m.name}`,
        insert: m.insert,
        detail: m.signature,
        mode: 'member' as const,
      }));
  }

  // db.acc → collection names from schema + helpers
  if (/^db\.\w*$/i.test(linePrefix) && !linePrefix.includes('(')) {
    const partial = linePrefix.slice(3).toLowerCase();
    const fromSchema = collections
      .filter((c) => !partial || c.name.toLowerCase().startsWith(partial))
      .slice(0, 12)
      .map((c) => ({
        label: `db.${c.name}`,
        insert: `db.${c.name}.`,
        detail: c.fields.length ? `${c.fields.length} fields` : 'collection',
      }));
    const getColl: MongoShellCompletion = {
      label: 'db.getCollection()',
      insert: "db.getCollection('",
      detail: 'getCollection(name)',
    };
    const fromStatic = MONGO_SHELL_COMPLETIONS.filter((c) =>
      c.insert.toLowerCase().startsWith('db.'),
    ).filter((c) => !partial || c.insert.toLowerCase().includes(partial));
    return [...fromSchema, getColl, ...fromStatic].slice(0, 14);
  }

  const needle = linePrefix.toLowerCase();
  return MONGO_SHELL_COMPLETIONS.filter(
    (c) => c.label.toLowerCase().startsWith(needle) || c.insert.toLowerCase().startsWith(needle),
  ).slice(0, 10);
}

/** Replace the current line prefix, member name, or token with the chosen completion. */
export function applyMongoShellCompletion(
  script: string,
  caret: number,
  completion: MongoShellCompletion,
): { script: string; caret: number } {
  const before = script.slice(0, caret);
  const after = script.slice(caret);
  const lineStart = Math.max(before.lastIndexOf('\n') + 1, 0);
  const lineBeforeCaret = before.slice(lineStart);
  const leadingWs = lineBeforeCaret.match(/^\s*/)?.[0] ?? '';

  if (completion.mode === 'member') {
    const lastDot = before.lastIndexOf('.');
    if (lastDot >= lineStart) {
      const nextBefore = before.slice(0, lastDot + 1) + completion.insert;
      return { script: nextBefore + after, caret: nextBefore.length };
    }
  }

  if (completion.mode === 'token') {
    const { start } = tokenPartial(before);
    const nextBefore = before.slice(0, start) + completion.insert;
    return { script: nextBefore + after, caret: nextBefore.length };
  }

  const nextBefore = script.slice(0, lineStart) + leadingWs + completion.insert;
  return { script: nextBefore + after, caret: nextBefore.length };
}
