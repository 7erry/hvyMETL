import { describe, expect, it } from 'vitest';
import { sidebarWidthFromTextareaBoxes } from './schemaImportSidebarSync';

describe('sidebarWidthFromTextareaBoxes', () => {
  it('includes gutter beyond textarea right edge', () => {
    expect(sidebarWidthFromTextareaBoxes(100, 500)).toBe(412);
  });
});
