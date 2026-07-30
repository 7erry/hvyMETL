import { describe, expect, it } from 'vitest';
import { mapPromptExportResponse } from './migrationPrompts';

describe('mapPromptExportResponse', () => {
  it('maps prompt files from export API shape', () => {
    const mapped = mapPromptExportResponse({
      retrievalStrategy: 'hybrid',
      prompts: [{ fileName: '1-schema-design-architect.md', content: '# Architect' }],
    });
    expect(mapped.retrievalStrategy).toBe('hybrid');
    expect(mapped.prompts).toEqual([{ fileName: '1-schema-design-architect.md', content: '# Architect' }]);
  });

  it('returns empty prompts when API omits them', () => {
    expect(mapPromptExportResponse({}).prompts).toEqual([]);
  });
});
