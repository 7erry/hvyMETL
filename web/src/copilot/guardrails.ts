import type { SqlStructuralModel } from '../types';
import type { GuardrailIssue } from './types';

const FIREHOSE_NAME_PATTERN = /telemetry|reading|event|log|metric|audit|line|stop/i;
const ESTIMATED_BYTES_PER_ROW = 280;
const DOCUMENT_SIZE_WARN_BYTES = 12 * 1024 * 1024;
const DOCUMENT_SIZE_CRITICAL_BYTES = 16 * 1024 * 1024;

/** Analyze the SQL schema graph for common MongoDB migration risks. */
export function analyzeMigrationRisks(model: SqlStructuralModel | null): GuardrailIssue[] {
  if (!model?.tables.length) return [];

  const issues: GuardrailIssue[] = [];
  const tableNames = new Set(model.tables.map((table) => table.name));

  for (const table of model.tables) {
    if (table.primaryKey.length === 0) {
      issues.push({
        id: `missing-pk:${table.name}`,
        tableName: table.name,
        kind: 'missing-pk',
        severity: 'critical',
        label: 'Missing PK',
        detail: `Table "${table.name}" has no primary key columns detected.`,
        suggestedPrompt: `How should I optimize ${table.name} to resolve missing primary key detection?`,
      });
    }

    for (const fk of table.foreignKeys) {
      if (!tableNames.has(fk.referencesTable)) {
        issues.push({
          id: `orphan-fk:${table.name}:${fk.column}`,
          tableName: table.name,
          kind: 'orphan-fk',
          severity: 'warning',
          label: 'Orphan FK',
          detail: `${table.name}.${fk.column} references missing table ${fk.referencesTable}.`,
          suggestedPrompt: `How should I optimize ${table.name} to resolve the orphaned foreign key on ${fk.column}?`,
        });
      }
    }

    const incoming = model.relationships.filter((rel) => rel.childTable === table.name);
    const isHighVolumeChild =
      FIREHOSE_NAME_PATTERN.test(table.name) ||
      table.rowCount >= 10_000 ||
      (table.rowCount === 0 && FIREHOSE_NAME_PATTERN.test(table.name));

    for (const rel of incoming) {
      const unbounded = !rel.isBounded || rel.maxChildrenPerParent === 0;
      if (unbounded && (isHighVolumeChild || rel.maxChildrenPerParent === 0)) {
        issues.push({
          id: `unbounded:${rel.parentTable}->${table.name}`,
          tableName: table.name,
          kind: 'unbounded-array',
          severity: 'warning',
          label: 'Unbounded Array',
          detail: `Embedding ${table.name} into ${rel.parentTable} may create unbounded arrays (${rel.maxChildrenPerParent || 'unknown'} max children).`,
          suggestedPrompt: `How should I optimize ${table.name} to resolve this unbounded array risk?`,
        });
      }
    }

    const estimatedChildRows = incoming.reduce(
      (sum, rel) => sum + (rel.maxChildrenPerParent || rel.avgChildrenPerParent || 0),
      0,
    );
    const columnEstimate = table.columns.length * 48;
    const estimatedDocBytes = columnEstimate + estimatedChildRows * ESTIMATED_BYTES_PER_ROW;

    if (estimatedDocBytes >= DOCUMENT_SIZE_WARN_BYTES) {
      issues.push({
        id: `doc-size:${table.name}`,
        tableName: table.name,
        kind: 'document-size',
        severity: estimatedDocBytes >= DOCUMENT_SIZE_CRITICAL_BYTES ? 'critical' : 'warning',
        label: estimatedDocBytes >= DOCUMENT_SIZE_CRITICAL_BYTES ? '16MB Risk' : 'Large Document',
        detail: `Estimated BSON size for ${table.name} with embedded children ~${Math.round(estimatedDocBytes / 1024)}KB.`,
        suggestedPrompt: `How should I optimize ${table.name} to avoid exceeding MongoDB's 16MB document limit?`,
      });
    }
  }

  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });
}

/** Map guardrail issues to a table for canvas badge lookup. */
export function guardrailsByTable(issues: GuardrailIssue[]): Map<string, GuardrailIssue[]> {
  const map = new Map<string, GuardrailIssue[]>();
  for (const issue of issues) {
    const list = map.get(issue.tableName) ?? [];
    list.push(issue);
    map.set(issue.tableName, list);
  }
  return map;
}
