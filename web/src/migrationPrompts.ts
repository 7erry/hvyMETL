import { exportPrompts } from './api';
import type { ProfileRequestFields } from './customProfileShared';
import type { PromptArtifact } from './sessionState';

export type PromptExportResponse = {
  prompts?: { fileName: string; content: string }[];
  retrievalStrategy?: string;
};

/** Map `/api/export/prompts` JSON into session prompt artifacts. */
export function mapPromptExportResponse(result: PromptExportResponse): {
  prompts: PromptArtifact[];
  retrievalStrategy?: string;
} {
  return {
    prompts: (result.prompts ?? []).map((p) => ({
      fileName: p.fileName,
      content: p.content,
    })),
    retrievalStrategy: result.retrievalStrategy,
  };
}

/** Fetch RAG prompt bundle for the current DDL + workload profile. */
export async function fetchMigrationPrompts(
  ddl: string,
  profile: ProfileRequestFields,
): Promise<{ prompts: PromptArtifact[]; retrievalStrategy?: string }> {
  if (!ddl.trim()) {
    return { prompts: [] };
  }
  const result = await exportPrompts(ddl, profile);
  return mapPromptExportResponse(result as PromptExportResponse);
}
