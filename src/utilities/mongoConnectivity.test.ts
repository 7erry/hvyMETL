import { describe, expect, it } from 'vitest';
import {
  enrichHostedMongoHint,
  formatMongoConnectivityFailure,
  maskMongoUri,
  verifyMongoUri,
} from '../utilities/mongoConnectivity.js';

describe('mongoConnectivity', () => {
  it('masks credentials in URI', () => {
    expect(maskMongoUri('mongodb+srv://user:secret@cluster.example.mongodb.net/mydb?retryWrites=true')).toBe(
      'mongodb+srv://***@cluster.example.mongodb.net/mydb',
    );
  });

  it('returns missing URI failure', async () => {
    const result = await verifyMongoUri('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('MISSING_URI');
    }
  });

  it('classifies DNS ENOTFOUND with actionable hint', async () => {
    const result = await verifyMongoUri('mongodb+srv://user:pass@nonexistent-hvymetl-test.example.mongodb.net', {
      timeoutMs: 3000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ENOTFOUND');
      expect(formatMongoConnectivityFailure(result)).toContain('HVYMETL_SKIP_ATLAS_IMPORT');
    }
  });

  it('adds hosted studio guidance for TLS failures', () => {
    const enriched = enrichHostedMongoHint(
      {
        ok: false,
        code: 'TLS_OR_SELECTION',
        message: 'MongoDB connection failed during TLS or server selection.',
        hint: 'Base hint.',
      },
      { hostedUrl: 'https://hvymetl.studio', serverEgressIp: '203.0.113.10' },
    );
    expect(enriched.hint).toContain('hvymetl.studio');
    expect(enriched.hint).toContain('203.0.113.10');
    expect(enriched.hint).toContain('not your browser');
  });
});
