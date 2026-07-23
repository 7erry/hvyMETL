import { afterEach, describe, expect, it, vi } from 'vitest';
import * as auth from '../server/auth.js';
import * as hosted from '../server/hosted.js';
import {
  MONGO_INSPECT_URI_MISSING_MESSAGE,
  ensureMongoInspectMcpConnection,
  releaseMongoInspectMcpConnection,
  resolveMongoInspectMongoUri,
} from './mongoInspectConnection.js';

describe('mongoInspectConnection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MONGODB_URI;
  });

  it('resolves MONGODB_URI for local dev when auth is disabled', () => {
    process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.example.net/';
    vi.spyOn(auth, 'isAuthConfigured').mockReturnValue(false);
    vi.spyOn(hosted, 'isHostedStudioRequest').mockReturnValue(false);

    const req = { auth: undefined, headers: {} } as import('express').Request;
    expect(resolveMongoInspectMongoUri(req)).toBe('mongodb+srv://user:pass@cluster.example.net/');
  });

  it('falls back to preconfigured when no tenant uri in local dev', async () => {
    const callTool = vi.fn();
    const connection = await ensureMongoInspectMcpConnection(callTool, undefined, {
      hosted: false,
      authEnabled: false,
    });
    expect(connection).toEqual({ connectionId: 'preconfigured', ephemeral: false });
    expect(callTool).not.toHaveBeenCalled();
  });

  it('connects with tenant uri and returns ephemeral connectionId', async () => {
    const callTool = vi.fn(async (name: string) => {
      if (name === 'connect') return { connectionId: 'hvymetl-a1b2' };
      return {};
    });
    const connection = await ensureMongoInspectMcpConnection(
      callTool,
      'mongodb+srv://user:pass@cluster.example.net/',
      { hosted: true, authEnabled: true },
    );
    expect(connection).toEqual({ connectionId: 'hvymetl-a1b2', ephemeral: true });
    expect(callTool).toHaveBeenCalledWith('connect', {
      connectionString: 'mongodb+srv://user:pass@cluster.example.net/',
      connectionName: 'hvymetl',
    });
  });

  it('requires tenant uri on hosted auth when unset', async () => {
    const callTool = vi.fn();
    await expect(
      ensureMongoInspectMcpConnection(callTool, undefined, { hosted: true, authEnabled: true }),
    ).rejects.toThrow(MONGO_INSPECT_URI_MISSING_MESSAGE);
  });

  it('disconnects ephemeral connections on release', async () => {
    const callTool = vi.fn(async () => ({}));
    await releaseMongoInspectMcpConnection(callTool, {
      connectionId: 'hvymetl-a1b2',
      ephemeral: true,
    });
    expect(callTool).toHaveBeenCalledWith('disconnect', { connectionId: 'hvymetl-a1b2' });
  });
});
