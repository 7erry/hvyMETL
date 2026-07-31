import type { CopilotAtlasSearchIndexRecord } from '../../../src/copilot/copilotAtlasSearchContext.ts';

const STORAGE_KEY = 'hvymetl-atlas-search-indexes-v1';

/** Load lexical MongoDB Search indexes created in this browser session. */
export function loadSessionAtlasSearchIndexes(): CopilotAtlasSearchIndexRecord[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CopilotAtlasSearchIndexRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist lexical search indexes for architecture reviews across reloads. */
export function saveSessionAtlasSearchIndexes(indexes: CopilotAtlasSearchIndexRecord[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(indexes));
  } catch {
    // Quota or private mode — ignore.
  }
}
