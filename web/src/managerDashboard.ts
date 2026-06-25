import type { MigrationArtifacts } from './sessionState';
import type { CollectionPlan, MigrationPlan } from './migrationPlanTypes';
import type { TransformationSummary } from './transformationSummaryTypes';
import type { SqlStructuralModel } from './types';
import { PIPELINE_PROGRESS_STAGES } from './pipelineStages';

/** Migration readiness for a single table or collection in the manager view. */
export type EntityReadiness = 'ready' | 'review' | 'blocked' | 'pending';

export type ManagerEntity = {
  id: string;
  name: string;
  kind: 'sql-table' | 'mongo-collection';
  status: EntityReadiness;
  statusLabel: string;
};

export type BusinessDomain = {
  id: string;
  label: string;
  entities: ManagerEntity[];
};

export type MigrationProgress = {
  mappedCount: number;
  totalCount: number;
  percent: number;
  readyCount: number;
  reviewCount: number;
  blockedCount: number;
  pendingCount: number;
};

export type ManagerMilestone = {
  step: number;
  totalSteps: number;
  phaseLabel: string;
  detail: string;
  etaHint?: string;
};

export type ActivityFeedItem = {
  id: string;
  message: string;
  timestamp: string;
  tone: 'success' | 'warn' | 'info' | 'error';
};

/** Real Atlas import and workload metrics (no estimates). */
export type CloudResourceSummary = {
  hasImportData: boolean;
  documentsImported: number | null;
  collectionsSucceeded: number;
  collectionsFailed: number;
  pipelineRunsRecorded: number;
  targetDatabase: string | null;
  lastPipelineAt: string | null;
  profileLabel: string | null;
  readWriteRatio: string | null;
  retrievalStrategy: string | null;
};

function sumInsertedCounts(imports: Array<{ ok: boolean; insertedCount?: number }>): number | null {
  let sum = 0;
  let hasAny = false;
  for (const imp of imports) {
    if (imp.ok && typeof imp.insertedCount === 'number') {
      sum += imp.insertedCount;
      hasAny = true;
    }
  }
  return hasAny ? sum : null;
}

function countImportOutcomes(imports: Array<{ ok: boolean }>): { succeeded: number; failed: number } {
  return {
    succeeded: imports.filter((imp) => imp.ok).length,
    failed: imports.filter((imp) => !imp.ok).length,
  };
}

/** Build cloud/workload summary from session pipeline results and stored execution history. */
export function buildCloudResourceSummary(
  artifacts: MigrationArtifacts | null,
  executions: import('./transformationSummaryTypes').PipelineExecutionListItem[],
  profileInfo: { label: string; readPercent: number; writePercent: number } | null,
): CloudResourceSummary {
  const sessionImports = artifacts?.pipelineResult?.imports ?? [];
  const sessionOutcomes = countImportOutcomes(sessionImports);
  const sessionDocs = sumInsertedCounts(sessionImports);

  const latestExecution = executions[0];
  const historyImports = latestExecution?.imports ?? [];
  const historyOutcomes = countImportOutcomes(historyImports);
  const historyDocs = sumInsertedCounts(historyImports);

  const useSession = sessionImports.length > 0;
  const documentsImported = useSession ? sessionDocs : historyDocs;
  const collectionsSucceeded = useSession ? sessionOutcomes.succeeded : historyOutcomes.succeeded;
  const collectionsFailed = useSession ? sessionOutcomes.failed : historyOutcomes.failed;
  const hasImportData =
    documentsImported !== null || collectionsSucceeded > 0 || collectionsFailed > 0;

  const lastPipelineAt = artifacts?.pipelineResult
    ? artifacts.generatedAt
    : latestExecution?.completedAt ?? null;

  return {
    hasImportData,
    documentsImported,
    collectionsSucceeded,
    collectionsFailed,
    pipelineRunsRecorded: executions.length,
    targetDatabase: latestExecution?.targetDb ?? null,
    lastPipelineAt,
    profileLabel: profileInfo?.label ?? null,
    readWriteRatio: profileInfo
      ? `${profileInfo.readPercent}:${profileInfo.writePercent} read:write`
      : null,
    retrievalStrategy: artifacts?.retrievalStrategy ?? null,
  };
}

const COMPLEX_PATTERNS = new Set(['embed', 'bucket', 'subset', 'archive', 'extended-reference', 'polymorphic', 'tree']);

function capitalize(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Derive a business-domain key from a table or collection name. */
export function domainKeyForName(name: string): string {
  const lower = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const withoutSuffix = lower.replace(
    /(_?(meta|status|type|types|log|logs|history|settings|config|data|info|detail|details))$/,
    '',
  );
  const segment = withoutSuffix.split('_').filter(Boolean)[0] ?? lower;
  if (segment.endsWith('ies') && segment.length > 4) return segment.slice(0, -3) + 'y';
  if (segment.endsWith('s') && segment.length > 3) return segment.slice(0, -1);
  return segment;
}

function domainLabelForKey(key: string): string {
  return `${capitalize(key)} Module`;
}

function collectionNeedsReview(collection: CollectionPlan, summary?: TransformationSummary): boolean {
  const patternIds = collection.patterns.map((p) => p.pattern);
  if (patternIds.some((id) => COMPLEX_PATTERNS.has(id))) return true;
  if (collection.embeddedArrays.length > 0 || collection.extendedReferences.length > 0) return true;
  if (collection.mergedTables.length > 1) return true;
  if (collection.archive) return true;
  const note = summary?.collections.find((c) => c.name === collection.name);
  if (note && note.notes.length > 0) return true;
  return false;
}

function importStatusForCollection(
  name: string,
  artifacts?: MigrationArtifacts | null,
): 'ok' | 'failed' | 'none' {
  const imports = artifacts?.pipelineResult?.imports;
  if (!imports?.length) return 'none';
  const entry = imports.find((i) => i.collection === name);
  if (!entry) return 'none';
  return entry.ok ? 'ok' : 'failed';
}

function statusForCollection(
  collection: CollectionPlan,
  artifacts?: MigrationArtifacts | null,
  summary?: TransformationSummary,
): { status: EntityReadiness; statusLabel: string } {
  const importStatus = importStatusForCollection(collection.name, artifacts);
  if (importStatus === 'failed') {
    return { status: 'blocked', statusLabel: 'Import failed' };
  }
  if (importStatus === 'ok') {
    return { status: 'ready', statusLabel: 'Validated & imported' };
  }
  if (collectionNeedsReview(collection, summary)) {
    return { status: 'review', statusLabel: 'Needs review' };
  }
  return { status: 'ready', statusLabel: 'Mapped & validated' };
}

function statusForTable(
  tableName: string,
  plan: MigrationPlan | null,
  artifacts?: MigrationArtifacts | null,
): { status: EntityReadiness; statusLabel: string } {
  if (!plan) {
    return { status: 'pending', statusLabel: 'Not mapped yet' };
  }
  const asSource = plan.collections.some((c) => c.sourceTable === tableName);
  const foldedInto = plan.collections.find((c) => c.mergedTables.includes(tableName) && c.sourceTable !== tableName);
  const asCollection = plan.collections.find((c) => c.name === tableName);

  const importStatus = asCollection ? importStatusForCollection(asCollection.name, artifacts) : 'none';
  if (importStatus === 'failed') {
    return { status: 'blocked', statusLabel: 'Import failed' };
  }
  if (importStatus === 'ok') {
    return { status: 'ready', statusLabel: 'Validated & imported' };
  }
  if (foldedInto) {
    return { status: 'review', statusLabel: `Folded into ${foldedInto.sourceTable}` };
  }
  if (asSource || asCollection) {
    const collection = asCollection ?? plan.collections.find((c) => c.sourceTable === tableName);
    if (collection && collectionNeedsReview(collection)) {
      return { status: 'review', statusLabel: 'Complex mapping' };
    }
    return { status: 'ready', statusLabel: 'Mapped' };
  }
  return { status: 'blocked', statusLabel: 'No target collection' };
}

export function buildBusinessDomains(
  model: SqlStructuralModel | null,
  plan: MigrationPlan | null,
  phase: 'before' | 'after',
  artifacts?: MigrationArtifacts | null,
  summary?: TransformationSummary,
): BusinessDomain[] {
  const domainMap = new Map<string, ManagerEntity[]>();

  if (phase === 'after' && plan) {
    for (const collection of plan.collections) {
      const key = domainKeyForName(collection.sourceTable || collection.name);
      const { status, statusLabel } = statusForCollection(collection, artifacts, summary);
      const entity: ManagerEntity = {
        id: collection.name,
        name: collection.name,
        kind: 'mongo-collection',
        status,
        statusLabel,
      };
      const list = domainMap.get(key) ?? [];
      list.push(entity);
      domainMap.set(key, list);
    }
  } else if (model) {
    for (const table of model.tables) {
      const key = domainKeyForName(table.name);
      const { status, statusLabel } = statusForTable(table.name, plan, artifacts);
      const entity: ManagerEntity = {
        id: table.name,
        name: table.name,
        kind: 'sql-table',
        status,
        statusLabel,
      };
      const list = domainMap.get(key) ?? [];
      list.push(entity);
      domainMap.set(key, list);
    }
  }

  return [...domainMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entities]) => ({
      id: key,
      label: domainLabelForKey(key),
      entities: entities.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

export function computeMigrationProgress(domains: BusinessDomain[]): MigrationProgress {
  const entities = domains.flatMap((d) => d.entities);
  const totalCount = entities.length;
  let readyCount = 0;
  let reviewCount = 0;
  let blockedCount = 0;
  let pendingCount = 0;
  for (const entity of entities) {
    if (entity.status === 'ready') readyCount += 1;
    else if (entity.status === 'review') reviewCount += 1;
    else if (entity.status === 'blocked') blockedCount += 1;
    else pendingCount += 1;
  }
  const mappedCount = readyCount + reviewCount;
  const percent = totalCount === 0 ? 0 : Math.round((mappedCount / totalCount) * 100);
  return { mappedCount, totalCount, percent, readyCount, reviewCount, blockedCount, pendingCount };
}

const MILESTONE_LABELS = [
  'Import source schema',
  'Map SQL to MongoDB',
  'Review & optimize document design',
  'Import to Atlas & sign off',
];

export function computeManagerMilestone(
  model: SqlStructuralModel | null,
  plan: MigrationPlan | null,
  artifacts?: MigrationArtifacts | null,
  pipelineRunning?: boolean,
): ManagerMilestone {
  if (!model) {
    return {
      step: 1,
      totalSteps: 4,
      phaseLabel: MILESTONE_LABELS[0],
      detail: 'Upload or paste your source database schema to begin.',
    };
  }
  if (!plan) {
    return {
      step: 2,
      totalSteps: 4,
      phaseLabel: MILESTONE_LABELS[1],
      detail: 'Run design to translate SQL tables into MongoDB collections.',
      etaHint: pipelineRunning ? 'Design in progress…' : 'Typically 1–3 minutes',
    };
  }
  const progress = computeMigrationProgress(buildBusinessDomains(model, plan, 'after', artifacts));
  if (!artifacts?.pipelineResult) {
    return {
      step: 3,
      totalSteps: 4,
      phaseLabel: MILESTONE_LABELS[2],
      detail: `${progress.readyCount} of ${progress.totalCount} collections ready · ${progress.reviewCount} need review`,
      etaHint: pipelineRunning ? 'Pipeline running…' : undefined,
    };
  }
  const pipelineOk = artifacts.pipelineResult.ok;
  return {
    step: 4,
    totalSteps: 4,
    phaseLabel: pipelineOk ? 'Migration complete' : MILESTONE_LABELS[3],
    detail: pipelineOk
      ? 'All pipeline stages finished. Ready to export the migration blueprint.'
      : `Pipeline finished with errors — ${progress.blockedCount} blocked item(s).`,
  };
}

export function humanPipelineStageLabel(stage: string): string {
  const entry = PIPELINE_PROGRESS_STAGES.find((s) => s.stage === stage);
  if (!entry) return stage;
  return entry.label
    .replace('ML-enhanced design', 'AI schema mapping')
    .replace('csvToAtlas', 'cloud import')
    .replace('BM25', 'search')
    .replace('mock CSV', 'sample data');
}

export function buildActivityFeed(
  artifacts: MigrationArtifacts | null,
  executions: { executionId: string; completedAt: string; ok: boolean; profileId: string }[],
): ActivityFeedItem[] {
  const items: ActivityFeedItem[] = [];

  if (artifacts?.generatedAt) {
    items.push({
      id: `design-${artifacts.generatedAt}`,
      message: 'Migration plan generated',
      timestamp: artifacts.generatedAt,
      tone: 'success',
    });
  }
  if (artifacts?.pipelineResult) {
    items.push({
      id: `pipeline-${artifacts.generatedAt}`,
      message: artifacts.pipelineResult.ok
        ? 'Full pipeline completed successfully'
        : 'Pipeline completed with errors',
      timestamp: artifacts.generatedAt,
      tone: artifacts.pipelineResult.ok ? 'success' : 'error',
    });
  }
  if (artifacts?.repositories?.generatedAt) {
    items.push({
      id: `repos-${artifacts.repositories.generatedAt}`,
      message: `Repository code generated (${artifacts.repositories.languageLabel})`,
      timestamp: artifacts.repositories.generatedAt,
      tone: 'info',
    });
  }
  for (const execution of executions) {
    items.push({
      id: execution.executionId,
      message: `${execution.ok ? 'Pipeline run succeeded' : 'Pipeline run failed'} · profile ${execution.profileId}`,
      timestamp: execution.completedAt,
      tone: execution.ok ? 'success' : 'error',
    });
  }

  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 12);
}
