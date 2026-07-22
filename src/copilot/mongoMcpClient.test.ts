import { describe, expect, it } from 'vitest';
import { parseMongoMcpToolPayload } from './mongoMcpClient.js';
import { isMongoInspectToolName } from './mongoInspectToolSchemas.js';

describe('mongoMcpClient helpers', () => {
  it('parses JSON text blocks from MCP tool responses', () => {
    const payload = parseMongoMcpToolPayload([
      { type: 'text', text: '{"databases":[{"name":"demo","size":1}],"totalCount":1}' },
    ]);
    expect(payload).toEqual({ databases: [{ name: 'demo', size: 1 }], totalCount: 1 });
  });
});

describe('mongoInspectToolSchemas', () => {
  it('recognizes inspect tool names', () => {
    expect(isMongoInspectToolName('listMongoDatabases')).toBe(true);
    expect(isMongoInspectToolName('foldTable')).toBe(false);
  });
});
