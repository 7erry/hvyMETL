import { describe, expect, it } from 'vitest';
import {
  createPipelineStreamConsumer,
  parsePipelineStreamDataLine,
  parsePipelineStreamFrame,
  splitPipelineSseBuffer,
} from './pipelineStream';

describe('pipelineStream', () => {
  it('parses progress and complete frames', () => {
    const progress = parsePipelineStreamFrame('data: {"type":"progress","stage":"designing","message":"Designing…"}\n');
    expect(progress?.kind).toBe('progress');

    const complete = parsePipelineStreamDataLine('{"type":"complete","ok":true,"errors":[],"imports":[]}');
    expect(complete?.kind).toBe('complete');
    if (complete?.kind === 'complete') {
      expect(complete.result.ok).toBe(true);
    }
  });

  it('keeps a trailing partial frame in the buffer until flush', () => {
    const partial = splitPipelineSseBuffer('data: {"type":"complete","ok":true}');
    expect(partial.frames).toEqual([]);
    expect(partial.remainder).toBe('data: {"type":"complete","ok":true}');

    const flushed = splitPipelineSseBuffer('data: {"type":"complete","ok":true}', true);
    expect(flushed.frames).toHaveLength(1);
    expect(flushed.remainder).toBe('');
  });

  it('returns the complete payload when the stream ends without a trailing blank line', () => {
    const events: string[] = [];
    const consumer = createPipelineStreamConsumer((event) => {
      events.push(event.stage);
    });

    const payload =
      'data: {"type":"progress","stage":"validating","message":"Starting"}\n\n' +
      'data: {"type":"complete","ok":true,"errors":[],"imports":[{"collection":"accounts","ok":true,"insertedCount":10}]}';

    const bytes = new TextEncoder().encode(payload);
    expect(consumer.pushChunk(bytes.slice(0, 40), false)).toBeNull();
    const result = consumer.pushChunk(bytes.slice(40), true);
    expect(events).toEqual(['validating']);
    expect(result?.ok).toBe(true);
    expect(result?.imports).toEqual([{ collection: 'accounts', ok: true, insertedCount: 10 }]);
  });

  it('throws on error frames', () => {
    const consumer = createPipelineStreamConsumer(() => {});
    expect(() =>
      consumer.pushChunk(new TextEncoder().encode('data: {"type":"error","error":"boom"}\n\n'), true),
    ).toThrow('boom');
  });
});
