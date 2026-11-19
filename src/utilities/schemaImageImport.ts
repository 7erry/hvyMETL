/** Turn an ER-diagram image into DDL via Grove's Anthropic messages API. */

const DEFAULT_CHAT_URL =
  'https://grove-gateway-prod.azure-api.net/grove-foundry-prod/openai/v1/chat/completions';
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const TIMEOUT_MS = 120_000;
export const SCHEMA_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const PROMPT =
  'Transcribe this ER diagram into SQL. Include every visible table, column, type, primary key, and foreign key. Keep names and types exactly as printed, including typos. Emit each table name once. Reply with SQL only.';

export type GroveVisionConfig = {
  apiKey: string;
  url: string;
  model: string;
};

export type VisionFetch = (url: string, init: RequestInit) => Promise<Response>;

export function readGroveVisionConfig(env: NodeJS.ProcessEnv = process.env): GroveVisionConfig {
  const apiKey = env.GROVE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Grove is not configured. Set GROVE_API_KEY in .env.');
  }
  return {
    apiKey,
    url: visionMessagesUrl(env),
    model: env.GROVE_VISION_MODEL?.trim() || DEFAULT_MODEL,
  };
}

function visionMessagesUrl(env: NodeJS.ProcessEnv): string {
  const override = env.GROVE_VISION_URL?.trim();
  if (override) return override.replace(/\/$/, '');
  const chat = (env.GROVE_API_URL?.trim() || DEFAULT_CHAT_URL).replace(/\/$/, '');
  const suffix = '/openai/v1/chat/completions';
  if (!chat.endsWith(suffix)) {
    throw new Error('Set GROVE_VISION_URL to the Grove Anthropic messages endpoint.');
  }
  return `${chat.slice(0, -suffix.length)}/anthropic/v1/messages`;
}

export function imageMediaType(mime: string, filename: string): string {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  if (normalized === 'image/png' || normalized === 'image/jpeg' || normalized === 'image/webp' || normalized === 'image/gif') {
    return normalized;
  }
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  throw new Error('Image must be png, jpeg, webp, or gif.');
}

/** Pull SQL out of a model reply. A fence is optional. */
export function ddlFromVisionReply(reply: string): string {
  const fenced = reply.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  const sql = (fenced?.[1] ?? reply).trim();
  if (!/create\s+table/i.test(sql)) {
    throw new Error('The vision model did not return CREATE TABLE SQL.');
  }
  return sql;
}

export async function ddlFromSchemaImage(
  image: Buffer,
  mediaType: string,
  config: GroveVisionConfig,
  visionFetch: VisionFetch = fetch,
): Promise<string> {
  if (image.length === 0) throw new Error('Image is empty.');
  if (image.length > SCHEMA_IMAGE_MAX_BYTES) throw new Error('Image exceeds 8MB.');
  const response = await postVision(image, mediaType, config, visionFetch);
  return ddlFromVisionReply(response);
}

async function postVision(
  image: Buffer,
  mediaType: string,
  config: GroveVisionConfig,
  visionFetch: VisionFetch,
): Promise<string> {
  let response: Response;
  try {
    response = await visionFetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: image.toString('base64') },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Grove vision request timed out after 120s.');
    }
    throw error;
  }
  const raw = await response.text();
  let parsed: {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
    message?: string;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error(`Grove vision returned invalid JSON (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(parsed.error?.message || parsed.message || `Grove vision request failed (HTTP ${response.status}).`);
  }
  const text = (parsed.content ?? [])
    .map((block) => (block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .join('');
  if (!text.trim()) throw new Error('Grove vision returned an empty reply.');
  return text;
}
