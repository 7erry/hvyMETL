import type { PipelineProgressEvent, PipelineProgressStage } from './pipelineStages.js';

export type PipelineStreamFrame =
  | { kind: 'progress'; event: PipelineProgressEvent }
  | { kind: 'complete'; result: Record<string, unknown> }
  | { kind: 'error'; message: string };

type PipelineStreamPayload = {
  type: string;
  error?: string;
  stage?: PipelineProgressStage;
  message?: string;
  current?: number;
  total?: number;
  collection?: string;
  ok?: boolean;
};

/** Parse one SSE `data:` line from a pipeline progress stream. */
export function parsePipelineStreamDataLine(json: string): PipelineStreamFrame | null {
  let payload: PipelineStreamPayload;
  try {
    payload = JSON.parse(json) as PipelineStreamPayload;
  } catch {
    return null;
  }

  if (payload.type === 'progress' && payload.stage && payload.message) {
    return {
      kind: 'progress',
      event: {
        stage: payload.stage,
        message: payload.message,
        current: payload.current,
        total: payload.total,
        collection: payload.collection,
      },
    };
  }

  if (payload.type === 'complete') {
    const { type: _type, ...result } = payload;
    return { kind: 'complete', result };
  }

  if (payload.type === 'error') {
    return { kind: 'error', message: payload.error ?? 'Pipeline failed' };
  }

  return null;
}

/** Extract the `data:` JSON payload from one SSE frame (with or without trailing blank line). */
export function parsePipelineStreamFrame(frame: string): PipelineStreamFrame | null {
  const dataLine = frame
    .split('\n')
    .map((line) => line.trimEnd())
    .find((line) => line.startsWith('data: '));
  if (!dataLine) return null;
  return parsePipelineStreamDataLine(dataLine.slice(6));
}

/**
 * Process buffered SSE text. Returns any complete frames and the trailing partial frame
 * (content after the last `\n\n` delimiter, or the full buffer when `flush` is true).
 */
export function splitPipelineSseBuffer(
  buffer: string,
  flush = false,
): { frames: string[]; remainder: string } {
  if (!flush) {
    const frames = buffer.split('\n\n');
    return { frames: frames.slice(0, -1), remainder: frames.at(-1) ?? '' };
  }

  const trimmed = buffer.trim();
  if (!trimmed) {
    return { frames: [], remainder: '' };
  }

  const frames = buffer.split('\n\n').filter((frame) => frame.trim().length > 0);
  return { frames, remainder: '' };
}

export type PipelineStreamConsumer = {
  pushChunk(value: Uint8Array | undefined, done: boolean): Record<string, unknown> | null;
};

/** Incrementally consume an SSE pipeline stream, including a final chunk without `\n\n`. */
export function createPipelineStreamConsumer(
  onProgress: (event: PipelineProgressEvent) => void,
): PipelineStreamConsumer {
  const decoder = new TextDecoder();
  let buffer = '';

  const handleFrame = (frame: string): Record<string, unknown> | null => {
    const parsed = parsePipelineStreamFrame(frame);
    if (!parsed) return null;
    if (parsed.kind === 'progress') {
      onProgress(parsed.event);
      return null;
    }
    if (parsed.kind === 'error') {
      throw new Error(parsed.message);
    }
    return parsed.result;
  };

  return {
    pushChunk(value: Uint8Array | undefined, done: boolean): Record<string, unknown> | null {
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
      }
      if (done) {
        buffer += decoder.decode();
      }

      const { frames, remainder } = splitPipelineSseBuffer(buffer, done);
      buffer = remainder;

      for (const frame of frames) {
        const result = handleFrame(frame);
        if (result) return result;
      }

      if (done && buffer.trim()) {
        return handleFrame(buffer);
      }

      return null;
    },
  };
}
