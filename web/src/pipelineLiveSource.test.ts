import { describe, expect, it } from 'vitest';
import { resolvePipelineLiveRunSource } from './pipelineLiveSource';

describe('resolvePipelineLiveRunSource', () => {
  it('uses agent staging CSV on hosted and never mock or liveUri', () => {
    expect(
      resolvePipelineLiveRunSource({
        requireAgent: true,
        liveUri: 'postgresql://localhost/shop',
        liveDatabase: 'public',
        agentStagingDir: '/data/web-uploads/tenants/u/tmp/agent-extract/abc',
      }),
    ).toEqual({
      csvSourcePath: '/data/web-uploads/tenants/u/tmp/agent-extract/abc',
      generateMockCsv: false,
    });
  });

  it('refuses hosted run until extract staging is ready', () => {
    expect(() =>
      resolvePipelineLiveRunSource({
        requireAgent: true,
        liveUri: 'postgresql://localhost/shop',
        liveDatabase: '',
        agentStagingDir: null,
      }),
    ).toThrow(/local agent/);
  });

  it('keeps direct liveUri on local studio', () => {
    expect(
      resolvePipelineLiveRunSource({
        requireAgent: false,
        liveUri: 'postgresql://localhost/shop',
        liveDatabase: 'public',
        agentStagingDir: null,
      }),
    ).toEqual({
      generateMockCsv: false,
      liveUri: 'postgresql://localhost/shop',
      liveDatabase: 'public',
    });
  });
});
