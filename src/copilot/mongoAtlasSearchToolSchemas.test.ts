import { describe, expect, it } from 'vitest';
import { COPILOT_OPENAI_TOOLS } from './agentToolSchemas.js';
import { isMongoAtlasSearchIndexToolName } from './mongoAtlasSearchToolSchemas.js';

describe('mongoAtlasSearchToolSchemas', () => {
  it('registers createMongoAtlasSearchIndex on the copilot tool list', () => {
    const names = COPILOT_OPENAI_TOOLS.map((tool) => tool.function.name);
    expect(names).toContain('createMongoAtlasSearchIndex');
    expect(isMongoAtlasSearchIndexToolName('createMongoAtlasSearchIndex')).toBe(true);
  });
});
