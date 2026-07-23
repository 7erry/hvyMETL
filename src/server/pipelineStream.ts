/**
 * Server-Sent Events helpers for streaming pipeline progress to the web UI.
 */

import type { Response } from 'express';
import { runFullPipeline, type PipelineRunRequest, type PipelineRunResult } from './runPipeline.js';
import type { PipelineProgressEvent } from './pipelineProgress.js';

export type PipelineStreamCompletePayload = {
  type: 'complete';
  ok: boolean;
  errors: string[];
  paths: PipelineRunResult['paths'];
  csvSource: PipelineRunResult['csvSource'];
  imports: PipelineRunResult['imports'];
  csvSourcePath: string;
  retrievalStrategy: string;
  migrationPlanJson: PipelineRunResult['design']['plan'];
  designReportMarkdown: string;
  modelTokenUsage?: PipelineRunResult['design']['modelTokenUsage'];
  feedback: PipelineRunResult['feedback'];
  execution: PipelineRunResult['execution'];
};

/** Write one SSE data frame to the response. */
export function writePipelineSse(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  (res as Response & { flush?: () => void }).flush?.();
}

/** Map a finished pipeline result to the same JSON shape as POST /api/pipeline/run. */
export function pipelineResultToStreamPayload(result: PipelineRunResult): PipelineStreamCompletePayload {
  return {
    type: 'complete',
    ok: result.ok,
    errors: result.errors,
    paths: result.paths,
    csvSource: result.csvSource,
    imports: result.imports,
    csvSourcePath: result.csvSource.path,
    retrievalStrategy: result.design.retrievalStrategy,
    migrationPlanJson: result.design.plan,
    designReportMarkdown: result.design.designReport,
    modelTokenUsage: result.design.modelTokenUsage,
    feedback: result.feedback,
    execution: result.execution,
  };
}

/** Run the pipeline and stream progress events, then a final complete payload. */
export async function runFullPipelineWithStream(
  res: Response,
  request: PipelineRunRequest,
  formatComplete: (result: PipelineRunResult) => PipelineStreamCompletePayload = pipelineResultToStreamPayload,
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const onProgress = (event: PipelineProgressEvent) => {
    writePipelineSse(res, { type: 'progress', ...event });
  };

  try {
    const result = await runFullPipeline({ ...request, onProgress });
    writePipelineSse(res, formatComplete(result));
  } catch (error) {
    writePipelineSse(res, { type: 'error', error: String(error) });
  } finally {
    res.end();
  }
}
