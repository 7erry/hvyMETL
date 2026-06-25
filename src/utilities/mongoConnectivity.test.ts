import { describe, expect, it } from 'vitest';
import {
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
});
