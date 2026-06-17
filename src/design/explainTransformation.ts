/**
 * Human-readable explanation of why MongoDB patterns and embeds were (or were not)
 * applied for a SQL → migration-plan transformation.
 */

import type {
  CollectionPlan,
  MigrationPlan,
  RelationshipModel,
  SqlStructuralModel,
  WorkloadProfile,
} from '../types.js';
import { isPolymorphicTable } from './patternSelector.js';

const READ_HEAVY_PERCENT = 70;
const WRITE_HEAVY_PERCENT = 60;
const FIREHOSE_MIN_ROWS = 10_000;
const ARCHIVE_MIN_ROWS = 5_000;

export type TransformationInsightSeverity = 'info' | 'warn' | 'success';

export type TransformationInsight = {
  severity: TransformationInsightSeverity;
  title: string;
  body: string;
};

export type CollectionTransformationNote = {
  name: string;
  sourceTable: string;
  patterns: string[];
  embeddedFieldCount: number;
  embeddedFields: string[];
  mergedTables: string[];
  notes: string[];
};

export type TransformationSummary = {
  headline: string;
  profileId: string;
  profileLabel: string;
  readWriteRatio: string;
  sqlTableCount: number;
  collectionCount: number;
  foldedTableCount: number;
  foldedTables: string[];
  hasRowStats: boolean;
  csvEnriched: boolean;
  readHeavyEligible: boolean;
  writeHeavy: boolean;
  subsetCollectionCount: number;
  overflowCollectionCount: number;
  insights: TransformationInsight[];
  collections: CollectionTransformationNote[];
  markdown: string;
};

function isHubTable(tableName: string, model: SqlStructuralModel): boolean {
  return model.relationships.some(
    (relationship) => relationship.parentTable === tableName && relationship.childTable !== tableName,
  );
}

function childRelationshipsAsParent(tableName: string, model: SqlStructuralModel): RelationshipModel[] {
  return model.relationships.filter(
    (relationship) => relationship.parentTable === tableName && relationship.childTable !== tableName,
  );
}

function formatTransformHeadline(sqlTables: number, collections: number, folded: number): string {
  if (folded > 0) {
    return `${sqlTables} SQL tables → ${collections} MongoDB collections (${folded} folded into parents)`;
  }
  if (collections < sqlTables) {
    return `${sqlTables} SQL tables → ${collections} MongoDB collections`;
  }
  return `${sqlTables} SQL tables → ${collections} MongoDB collections (no tables fully absorbed)`;
}

function buildDataStatsInsights(
  originalModel: SqlStructuralModel,
  enrichedModel: SqlStructuralModel,
  csvEnriched: boolean,
): TransformationInsight[] {
  const insights: TransformationInsight[] = [];
  const hasRowStats = enrichedModel.tables.some((table) => table.rowCount > 0);

  if (!hasRowStats) {
    insights.push({
      severity: 'warn',
      title: 'DDL-only import — no row counts or cardinality',
      body:
        'Pasted DDL sets every table to rowCount 0 and every FK to avg/max children 0 (unbounded). Full embed, bucket, and archive patterns need CSV exports or a SQLite .db upload so the engine can measure volume and children-per-parent.',
    });
  } else if (csvEnriched) {
    insights.push({
      severity: 'success',
      title: 'CSV-enriched stats applied',
      body: 'Row counts and relationship cardinality from CSV exports were used for embed, subset, and bucket decisions.',
    });
  } else {
    insights.push({
      severity: 'success',
      title: 'Live introspection stats available',
      body: 'Row counts and relationship cardinality came from the database adapter (e.g. SQLite introspection).',
    });
  }

  const firehoseWithoutStats = originalModel.tables.filter(
    (table) =>
      table.rowCount === 0 &&
      enrichedModel.tables.find((entry) => entry.name === table.name)?.rowCount === 0 &&
      table.columns.some((column) => /date|time|timestamp/i.test(column.sqlType) || /_at$|_time$/i.test(column.name)),
  );
  if (firehoseWithoutStats.length > 0 && !hasRowStats) {
    insights.push({
      severity: 'info',
      title: 'Time-series tables need volume data for bucketing',
      body: `Tables such as ${firehoseWithoutStats
        .slice(0, 3)
        .map((table) => table.name)
        .join(', ')} have timestamps but rowCount is unknown — bucket pattern requires ≥${FIREHOSE_MIN_ROWS.toLocaleString('en-US')} rows.`,
    });
  }

  return insights;
}

function buildProfileInsights(profile: WorkloadProfile): TransformationInsight[] {
  const insights: TransformationInsight[] = [];
  const readHeavy = profile.telemetry.readPercent >= READ_HEAVY_PERCENT;
  const writeHeavy = profile.telemetry.writePercent >= WRITE_HEAVY_PERCENT;

  insights.push({
    severity: 'info',
    title: `Workload profile: ${profile.label}`,
    body: `${profile.telemetry.readPercent}:${profile.telemetry.writePercent} read:write · ${profile.telemetry.peakRpm.toLocaleString('en-US')} peak RPM · growth ${profile.telemetry.growthRate}.`,
  });

  if (!readHeavy) {
    insights.push({
      severity: 'warn',
      title: 'Embed and subset patterns are gated off',
      body: `Embed and subset apply when reads ≥ ${READ_HEAVY_PERCENT}%. This profile is ${profile.telemetry.readPercent}% read — child tables stay as references (no recent* embedded arrays on parents).`,
    });
  } else if (writeHeavy) {
    insights.push({
      severity: 'info',
      title: 'Write-heavy signals present',
      body: `Writes are ${profile.telemetry.writePercent}% — unbounded children prefer reference over full embed even on read-leaning profiles; firehose children may bucket when row counts support it.`,
    });
  } else {
    insights.push({
      severity: 'success',
      title: 'Read-heavy profile — subset and embed eligible',
      body: `Reads are ${profile.telemetry.readPercent}% — bounded children can fully embed; unbounded children get subset (recent N on parent + overflow collection).`,
    });
  }

  return insights;
}

function explainChildRelationship(
  parentTable: string,
  relationship: RelationshipModel,
  childTableName: string,
  model: SqlStructuralModel,
  readHeavy: boolean,
): string | null {
  if (isHubTable(childTableName, model)) {
    return `${childTableName} is a hub (other tables reference it) — stays its own collection; parent keeps a reference + optional computed counter instead of embedding it.`;
  }

  if (!readHeavy) {
    return `${childTableName} → reference only (profile read ratio below ${READ_HEAVY_PERCENT}%).`;
  }

  if (relationship.isBounded) {
    return `${childTableName} is bounded (max ${relationship.maxChildrenPerParent}/parent) — eligible for full embed on read-heavy workloads.`;
  }

  return `${childTableName} is treated as unbounded (max ${relationship.maxChildrenPerParent}, avg ${relationship.avgChildrenPerParent}) — subset embeds recent rows on parent; full history stays in overflow collection ${childTableName}.`;
}

function buildCollectionNotes(
  plan: MigrationPlan,
  model: SqlStructuralModel,
  readHeavy: boolean,
): CollectionTransformationNote[] {
  const tablesByName = new Map(model.tables.map((table) => [table.name, table]));

  return plan.collections.map((collection) => {
    const notes: string[] = [];
    const patterns = [...new Set(collection.patterns.map((decision) => decision.pattern))];

    if (collection.embeddedArrays.length > 0) {
      const subsetFields = collection.embeddedArrays.filter((embed) => embed.subsetLimit != null);
      if (subsetFields.length > 0) {
        notes.push(
          `Subset embeds: ${subsetFields.map((embed) => embed.field).join(', ')} — canvas still shows overflow collections (${subsetFields.map((embed) => embed.overflowCollection ?? embed.sourceTable).join(', ')}).`,
        );
      }
      const fullEmbeds = collection.embeddedArrays.filter((embed) => embed.subsetLimit == null);
      if (fullEmbeds.length > 0) {
        notes.push(`Full embeds: ${fullEmbeds.map((embed) => embed.field).join(', ')} from ${fullEmbeds.map((embed) => embed.sourceTable).join(', ')}.`);
      }
    }

    const parentTable = tablesByName.get(collection.sourceTable);
    if (parentTable && isPolymorphicTable(parentTable)) {
      notes.push('Polymorphic pattern — discriminator `type` column with nullable variant fields.');
    }

    for (const relationship of childRelationshipsAsParent(collection.sourceTable, model)) {
      const childNote = explainChildRelationship(
        collection.sourceTable,
        relationship,
        relationship.childTable,
        model,
        readHeavy,
      );
      if (childNote) notes.push(childNote);
    }

    if (collection.bucket) {
      notes.push(`Bucket pattern on ${collection.bucket.measurementsField} (${collection.bucket.windowMinutes}m windows).`);
    }
    if (collection.archive) {
      notes.push(`Archive mirror → ${collection.archive.archiveCollection} after ${collection.archive.archiveAfterDays} days.`);
    }

    return {
      name: collection.name,
      sourceTable: collection.sourceTable,
      patterns,
      embeddedFieldCount: collection.embeddedArrays.length,
      embeddedFields: collection.embeddedArrays.map((embed) => embed.field),
      mergedTables: collection.mergedTables,
      notes,
    };
  });
}

function buildStructuralInsights(
  plan: MigrationPlan,
  model: SqlStructuralModel,
  foldedTables: string[],
): TransformationInsight[] {
  const insights: TransformationInsight[] = [];
  const subsetParents = plan.collections.filter((collection) =>
    collection.embeddedArrays.some((embed) => embed.subsetLimit != null),
  );

  if (plan.collections.length === model.tables.length && subsetParents.length > 0) {
    insights.push({
      severity: 'info',
      title: 'Subset pattern does not reduce collection count',
      body: `Subset keeps ${subsetParents.length} parent collection(s) with recent* embedded arrays but still maintains separate overflow collections for full child history — the After diagram may show the same number of nodes as SQL tables.`,
    });
  }

  if (foldedTables.length > 0) {
    insights.push({
      severity: 'success',
      title: 'Tables fully absorbed into parents',
      body: foldedTables.join(', '),
    });
  }

  const hubTables = model.tables.filter((table) => isHubTable(table.name, model)).map((table) => table.name);
  if (hubTables.length > 0) {
    insights.push({
      severity: 'info',
      title: 'Hub entities stay as collections',
      body: `${hubTables.join(', ')} — referenced by other tables, so they are not embedded into grandparents (e.g. accounts under customers when transactions reference accounts).`,
    });
  }

  return insights;
}

function renderMarkdown(summary: Omit<TransformationSummary, 'markdown'>): string {
  const lines: string[] = [
    '# Transformation Summary',
    '',
    summary.headline,
    '',
    `- Profile: **${summary.profileLabel}** (${summary.readWriteRatio})`,
    `- Row stats: ${summary.hasRowStats ? 'yes' : 'no'}${summary.csvEnriched ? ' (CSV-enriched)' : ''}`,
    `- Subset parents: ${summary.subsetCollectionCount} · overflow collections: ${summary.overflowCollectionCount}`,
    '',
    '## Why patterns were or were not applied',
    '',
  ];

  for (const insight of summary.insights) {
    const label = insight.severity === 'warn' ? '⚠' : insight.severity === 'success' ? '✓' : '·';
    lines.push(`### ${label} ${insight.title}`, '', insight.body, '');
  }

  lines.push('## Per collection', '');
  for (const collection of summary.collections) {
    lines.push(`### ${collection.name}`, '');
    lines.push(`- Source table: \`${collection.sourceTable}\``);
    lines.push(`- Patterns: ${collection.patterns.join(', ') || 'none'}`);
    if (collection.embeddedFields.length > 0) {
      lines.push(`- Embedded fields: ${collection.embeddedFields.join(', ')}`);
    }
    if (collection.notes.length > 0) {
      lines.push('', collection.notes.map((note) => `- ${note}`).join('\n'));
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Build structured + markdown explanation for a model → plan transformation. */
export function explainTransformation(
  originalModel: SqlStructuralModel,
  enrichedModel: SqlStructuralModel,
  plan: MigrationPlan,
  profile: WorkloadProfile,
  options: { csvEnriched?: boolean } = {},
): TransformationSummary {
  const sourceTables = new Set(plan.collections.map((collection) => collection.sourceTable));
  const foldedTables = originalModel.tables.map((table) => table.name).filter((name) => !sourceTables.has(name));
  const hasRowStats = enrichedModel.tables.some((table) => table.rowCount > 0);
  const csvEnriched = options.csvEnriched ?? false;
  const readHeavyEligible = profile.telemetry.readPercent >= READ_HEAVY_PERCENT;
  const writeHeavy = profile.telemetry.writePercent >= WRITE_HEAVY_PERCENT;

  const subsetCollectionCount = plan.collections.filter((collection) =>
    collection.embeddedArrays.some((embed) => embed.subsetLimit != null),
  ).length;
  const overflowCollectionCount = plan.collections.filter((collection) =>
    plan.collections.some((parent) =>
      parent.embeddedArrays.some(
        (embed) => embed.overflowCollection === collection.name || embed.sourceTable === collection.name,
      ),
    ),
  ).length;

  const insights = [
    ...buildDataStatsInsights(originalModel, enrichedModel, csvEnriched),
    ...buildProfileInsights(profile),
    ...buildStructuralInsights(plan, enrichedModel, foldedTables),
  ];

  const collections = buildCollectionNotes(plan, enrichedModel, readHeavyEligible);

  const base: Omit<TransformationSummary, 'markdown'> = {
    headline: formatTransformHeadline(originalModel.tables.length, plan.collections.length, foldedTables.length),
    profileId: profile.id,
    profileLabel: profile.label,
    readWriteRatio: `${profile.telemetry.readPercent}:${profile.telemetry.writePercent}`,
    sqlTableCount: originalModel.tables.length,
    collectionCount: plan.collections.length,
    foldedTableCount: foldedTables.length,
    foldedTables,
    hasRowStats,
    csvEnriched,
    readHeavyEligible,
    writeHeavy,
    subsetCollectionCount,
    overflowCollectionCount,
    insights,
    collections,
  };

  return { ...base, markdown: renderMarkdown(base) };
}
