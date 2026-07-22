import { describe, expect, it } from 'vitest';
import type { OpenAiToolCall } from './types';
import { parseOpenAiToolCall } from './llmTools';

describe('parseOpenAiToolCall', () => {
  it('parses foldTable arguments', () => {
    const toolCall: OpenAiToolCall = {
      id: 'call_1',
      type: 'function',
      function: {
        name: 'foldTable',
        arguments: JSON.stringify({
          sourceTable: 'train_telemetry',
          targetTable: 'trips',
          embedType: 'array',
        }),
      },
    };
    expect(parseOpenAiToolCall(toolCall)).toEqual({
      tool: 'foldTable',
      args: { sourceTable: 'train_telemetry', targetTable: 'trips', embedType: 'array' },
    });
  });
});
