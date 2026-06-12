/** Pipeline stage ids emitted during runFullPipeline for UI progress. */
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

/** One progress update for the web UI (SSE or in-process callback). */
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
