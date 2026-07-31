import { describe, expect, it } from 'vitest';
import { COPILOT_OPENAI_TOOLS } from './agentToolSchemas.js';

describe('mongoVectorIndexToolSchemas', () => {
  it('registers createMongoAutoEmbedVectorIndex on the copilot tool list', () => {
    const names = COPILOT_OPENAI_TOOLS.map((tool) => tool.function.name);
    expect(names).toContain('createMongoAutoEmbedVectorIndex');
  });
});
