/** How Run pipeline loads rows when Data source = Read live data. */

export type PipelineLiveRunSource = {
  csvSourcePath?: string;
  generateMockCsv: false;
  liveUri?: string;
  liveDatabase?: string;
};

/**
 * Hosted studio: use agent extract staging CSVs (never liveUri, never mock).
 * Local studio: keep capped direct liveUri reads.
 */
export function resolvePipelineLiveRunSource(options: {
  requireAgent: boolean;
  liveUri: string;
  liveDatabase: string;
  agentStagingDir: string | null;
}): PipelineLiveRunSource {
  if (options.requireAgent) {
    const staging = options.agentStagingDir?.trim() ?? '';
    if (!staging) {
      throw new Error(
        'Start the local agent and wait for the extract to finish before running the pipeline.',
      );
    }
    return {
      csvSourcePath: staging,
      generateMockCsv: false,
    };
  }
  const liveUri = options.liveUri.trim();
  if (!liveUri) {
    throw new Error('Enter a live connection URI, or start the local agent on a hosted studio.');
  }
  return {
    generateMockCsv: false,
    liveUri,
    liveDatabase: options.liveDatabase.trim() || undefined,
  };
}
