import type { CopilotVectorSearchIndexRecord } from '../../../src/copilot/copilotVectorSearchContext.ts';

const STORAGE_KEY = 'hvymetl-vector-search-indexes-v1';

/** Load vector indexes created in this browser session (studio autoEmbed). */
export function loadSessionVectorSearchIndexes(): CopilotVectorSearchIndexRecord[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CopilotVectorSearchIndexRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist vector indexes for architecture reviews across dialog reloads. */
export function saveSessionVectorSearchIndexes(indexes: CopilotVectorSearchIndexRecord[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(indexes));
  } catch {
    // Quota or private mode — ignore.
  }
}
