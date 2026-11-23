/** Tools that change data or the studio session. The client must confirm before running them. */

export const COPILOT_MUTATING_TOOLS = [
  'createMongoClassicIndex',
  'createMongoAutoEmbedVectorIndex',
  'createMongoAtlasSearchIndex',
  'clearSession',
  'importSchemaDdl',
  'importBuiltinExample',
  'refreshDesign',
  'runPipeline',
] as const;

export type CopilotMutatingToolName = (typeof COPILOT_MUTATING_TOOLS)[number];

const MUTATING = new Set<string>(COPILOT_MUTATING_TOOLS);

export function isCopilotMutatingTool(name: string): name is CopilotMutatingToolName {
  return MUTATING.has(name);
}
