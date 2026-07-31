import { describe, expect, it } from 'vitest';
import {
  isServerMongoInspectToolCall,
  isServerMongoVectorIndexToolCall,
  parseOpenAiToolCall,
} from './llmTools';

describe('llmTools mongo inspect parsing', () => {
  it('routes inspect tool calls to the server-side executor', () => {
    const parsed = parseOpenAiToolCall({
      id: 'call_1',
      type: 'function',
      function: {
        name: 'listMongoCollections',
        arguments: JSON.stringify({ database: 'csv_to_atlas' }),
      },
    });
    expect(parsed).not.toBeNull();
    expect(isServerMongoInspectToolCall(parsed!)).toBe(true);
    if (parsed && isServerMongoInspectToolCall(parsed)) {
      expect(parsed.tool).toBe('listMongoCollections');
      expect(parsed.args.database).toBe('csv_to_atlas');
    }
  });

  it('routes vector index tool calls to the server-side executor', () => {
    const parsed = parseOpenAiToolCall({
      id: 'call_2',
      type: 'function',
      function: {
        name: 'createMongoAutoEmbedVectorIndex',
        arguments: JSON.stringify({ collection: 'customers', path: 'description' }),
      },
    });
    expect(parsed).not.toBeNull();
    expect(isServerMongoVectorIndexToolCall(parsed!)).toBe(true);
    if (parsed && isServerMongoVectorIndexToolCall(parsed)) {
      expect(parsed.tool).toBe('createMongoAutoEmbedVectorIndex');
      expect(parsed.args.collection).toBe('customers');
    }
  });
});
