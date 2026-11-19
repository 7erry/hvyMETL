import { describe, expect, it } from 'vitest';
import { ddlFromSchemaImage, type GroveVisionConfig, type VisionFetch } from './schemaImageImport.js';

const config: GroveVisionConfig = {
  apiKey: 'test-key',
  url: 'https://grove.example/anthropic/v1/messages',
  model: 'claude-sonnet-5-5',
};

function visionFetch(body: unknown): VisionFetch {
  return async (url, init) => {
    expect(url).not.toContain('embeddings');
    expect(url).toBe(config.url);
    const payload = JSON.parse(String(init.body)) as {
      model: string;
      messages: Array<{ content: Array<{ type: string; source?: { type: string; data: string } }> }>;
    };
    expect(payload.model).toBe('claude-sonnet-5-5');
    const image = payload.messages[0]?.content.find((part) => part.type === 'image');
    expect(image?.source).toMatchObject({ type: 'base64', data: Buffer.from('png').toString('base64') });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

describe('ddlFromSchemaImage', () => {
  it('sends a base64 image to Claude and extracts fenced SQL', async () => {
    const ddl = await ddlFromSchemaImage(
      Buffer.from('png'),
      'image/png',
      config,
      visionFetch({
        content: [{ type: 'text', text: '```sql\nCREATE TABLE customer (id INT PRIMARY KEY);\n```' }],
      }),
    );
    expect(ddl).toBe('CREATE TABLE customer (id INT PRIMARY KEY);');

    await expect(
      ddlFromSchemaImage(
        Buffer.from('png'),
        'image/png',
        config,
        visionFetch({ content: [{ type: 'text', text: 'no tables here' }] }),
      ),
    ).rejects.toThrow(/CREATE TABLE/);
  });
});
