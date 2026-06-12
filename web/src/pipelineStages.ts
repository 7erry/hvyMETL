/** Pipeline progress stages (mirrors server pipelineProgress.ts). */
export type PipelineProgressStage =
  | 'validating'
  | 'enriching'
  | 'designing'
  | 'artifacts'
  | 'shaping'
  | 'importing'
  | 'reflection'
  | 'persisting'
  | 'done';

export type PipelineProgressEvent = {
  stage: PipelineProgressStage;
  message: string;
  current?: number;
  total?: number;
  collection?: string;
};

export const PIPELINE_PROGRESS_STAGES: { stage: PipelineProgressStage; label: string }[] = [
  { stage: 'validating', label: 'Validate configuration' },
  { stage: 'enriching', label: 'Enrich schema from CSV' },
  { stage: 'designing', label: 'ML-enhanced design' },
  { stage: 'artifacts', label: 'Write migration artifacts' },
  { stage: 'shaping', label: 'Shape CSV for import' },
  { stage: 'importing', label: 'Import collections to Atlas' },
  { stage: 'reflection', label: 'Schedule ML feedback reflection' },
  { stage: 'persisting', label: 'Persist execution to MongoDB' },
  { stage: 'done', label: 'Complete' },
];

const STAGE_ORDER = new Map(PIPELINE_PROGRESS_STAGES.map((entry, index) => [entry.stage, index]));

export function stageIndex(stage: PipelineProgressStage): number {
  return STAGE_ORDER.get(stage) ?? 0;
}

export function stageStatus(
  stage: PipelineProgressStage,
  activeStage: PipelineProgressStage | null,
): 'pending' | 'active' | 'done' {
  if (!activeStage) return 'pending';
  const active = stageIndex(activeStage);
  const current = stageIndex(stage);
  if (current < active) return 'done';
  if (current === active) return 'active';
  return 'pending';
}
