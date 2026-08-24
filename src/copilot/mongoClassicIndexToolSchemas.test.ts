import { describe, expect, it } from 'vitest';
import { isMongoClassicIndexToolName } from './mongoClassicIndexToolSchemas.js';

describe('mongoClassicIndexToolSchemas', () => {
  it('registers createMongoClassicIndex on the copilot tool list', () => {
    expect(isMongoClassicIndexToolName('createMongoClassicIndex')).toBe(true);
  });
});
