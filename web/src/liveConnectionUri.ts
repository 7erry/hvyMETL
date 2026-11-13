import type { LiveImportEngine } from './liveImportConnections';

export type LiveConnectionFields = {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  schema: string;
  sslMode: string;
};

const DEFAULT_PORTS: Record<LiveImportEngine, string> = {
  mongodb: '27017',
  postgresql: '5432',
  mysql: '3306',
  mssql: '1433',
  sqlite: '',
};

const SCHEME: Record<LiveImportEngine, string> = {
  mongodb: 'mongodb',
  postgresql: 'postgresql',
  mysql: 'mysql',
  mssql: 'mssql',
  sqlite: 'sqlite',
};

export function defaultPortForEngine(engine: LiveImportEngine): string {
  return DEFAULT_PORTS[engine];
}

export function emptyLiveConnectionFields(engine: LiveImportEngine): LiveConnectionFields {
  return {
    host: engine === 'sqlite' ? '' : '127.0.0.1',
    port: defaultPortForEngine(engine),
    database: '',
    user: '',
    password: '',
    schema: '',
    sslMode: '',
  };
}

/** Host shown in saved-connection labels (`name (host)`). */
export function liveConnectionDisplayHost(uri: string, engine: LiveImportEngine): string {
  if (engine === 'sqlite') {
    const path = uri.replace(/^sqlite:\/\//, '').replace(/^\/\//, '');
    return path || 'file';
  }
  try {
    const parsed = new URL(uri.includes('://') ? uri : `postgresql://${uri}`);
    return parsed.hostname || 'localhost';
  } catch {
    return 'uri';
  }
}

function encodeAuth(user: string, password: string): string {
  if (!user) return '';
  const u = encodeURIComponent(user);
  if (!password) return `${u}@`;
  return `${u}:${encodeURIComponent(password)}@`;
}

function querySuffix(schema: string, sslMode: string): string {
  const params = new URLSearchParams();
  if (schema.trim()) params.set('schema', schema.trim());
  if (sslMode.trim()) params.set('sslmode', sslMode.trim());
  const q = params.toString();
  return q ? `?${q}` : '';
}

/** Build a connection URI from form fields for the agent command. */
export function buildLiveConnectionUri(engine: LiveImportEngine, fields: LiveConnectionFields): string {
  if (engine === 'sqlite') {
    const path = fields.host.trim() || fields.database.trim();
    if (!path) return '';
    if (path.startsWith('sqlite:')) return path;
    return path.startsWith('/') ? `sqlite://${path}` : `sqlite:///${path}`;
  }

  const host = fields.host.trim() || '127.0.0.1';
  const port = fields.port.trim() || defaultPortForEngine(engine);
  const database = fields.database.trim();
  const auth = encodeAuth(fields.user.trim(), fields.password);
  const path = database ? `/${database}` : '';
  return `${SCHEME[engine]}://${auth}${host}:${port}${path}${querySuffix(fields.schema, fields.sslMode)}`;
}

/** Parse a URI into form fields. Unknown shapes leave defaults filled where possible. */
export function parseLiveConnectionUri(engine: LiveImportEngine, uri: string): LiveConnectionFields {
  const base = emptyLiveConnectionFields(engine);
  const trimmed = uri.trim();
  if (!trimmed) return base;

  if (engine === 'sqlite') {
    const path = trimmed.replace(/^sqlite:\/\//, '').replace(/^\/\//, '');
    return { ...base, host: path.startsWith('/') ? path : `/${path}`, database: '' };
  }

  try {
    const parsed = new URL(trimmed);
    const schema = parsed.searchParams.get('schema') ?? '';
    const sslMode = parsed.searchParams.get('sslmode') ?? '';
    return {
      host: parsed.hostname || base.host,
      port: parsed.port || defaultPortForEngine(engine),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
      user: decodeURIComponent(parsed.username || ''),
      password: decodeURIComponent(parsed.password || ''),
      schema,
      sslMode,
    };
  } catch {
    return base;
  }
}
