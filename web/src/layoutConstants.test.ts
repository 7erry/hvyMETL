import { describe, expect, it } from 'vitest';
import {
  COPILOT_WIDTH_MAX,
  MANAGER_SIDEBAR_MAX_WIDTH,
  SIDEBAR_WIDTH_MAX,
} from './layoutConstants.js';

describe('layoutConstants', () => {
  it('uses matching wider max widths for left and right resizable panels', () => {
    expect(SIDEBAR_WIDTH_MAX).toBe(960);
    expect(COPILOT_WIDTH_MAX).toBe(960);
    expect(MANAGER_SIDEBAR_MAX_WIDTH).toBe(SIDEBAR_WIDTH_MAX);
  });
});
