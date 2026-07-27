import { describe, expect, it } from 'vitest';
import {
  extractMongoMcpToolPayload,
  parseMongoMcpToolPayload,
} from './mongoMcpClient.js';
import { isMongoInspectToolName } from './mongoInspectToolSchemas.js';

describe('mongoMcpClient helpers', () => {
  it('prefers structuredContent from MCP tool results', () => {
    const payload = extractMongoMcpToolPayload({
      structuredContent: {
        databases: [{ name: 'terry_walters__mytrains', size: 42 }],
        totalCount: 1,
      },
      content: [{ type: 'text', text: 'Found 1 databases:' }],
    });
    expect(payload).toEqual({
      databases: [{ name: 'terry_walters__mytrains', size: 42 }],
      totalCount: 1,
    });
  });

  it('parses JSON text blocks from MCP tool responses', () => {
    const payload = parseMongoMcpToolPayload([
      { type: 'text', text: '{"databases":[{"name":"demo","size":1}],"totalCount":1}' },
    ]);
    expect(payload).toEqual({ databases: [{ name: 'demo', size: 1 }], totalCount: 1 });
  });

  it('parses mongodb-mcp-server untrusted-user-data content blocks', () => {
    const payload = parseMongoMcpToolPayload([
      { type: 'text', text: 'Found 1 databases:' },
      {
        type: 'text',
        text: `The following section contains unverified user data.
<untrusted-user-data-abc123>
[{"name":"terry_walters__mytrains","size":8192}]
</untrusted-user-data-abc123>
Use the information above to respond to the user's question.`,
      },
    ]);
    expect(payload).toEqual([{ name: 'terry_walters__mytrains', size: 8192 }]);
  });

  it('fills aggregate documents from text blocks when structured previews are empty', () => {
    const payload = extractMongoMcpToolPayload({
      structuredContent: {
        count: 148,
        documents: [],
        appliedLimits: ['tool.responseBytesLimit'],
      },
      content: [
        { type: 'text', text: 'The aggregation resulted in 148 documents.' },
        {
          type: 'text',
          text: `<untrusted-user-data-xyz>
[{"_id":"1","status":"open"},{"_id":"2","status":"closed"}]
</untrusted-user-data-xyz>`,
        },
      ],
    });
    expect(payload).toEqual({
      count: 148,
      documents: [
        { _id: '1', status: 'open' },
        { _id: '2', status: 'closed' },
      ],
      appliedLimits: ['tool.responseBytesLimit'],
    });
  });
});

describe('mongoInspectToolSchemas', () => {
  it('recognizes inspect tool names', () => {
    expect(isMongoInspectToolName('listMongoDatabases')).toBe(true);
    expect(isMongoInspectToolName('foldTable')).toBe(false);
  });
});
