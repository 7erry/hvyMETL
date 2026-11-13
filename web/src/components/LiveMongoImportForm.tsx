import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useT } from '../i18n/LocaleContext';
import type { MessageKey } from '../i18n/messages';
import {
  listLiveImportConnections,
  type LiveImportConnection,
  type LiveImportEngine,
} from '../liveImportConnections';
import {
  buildLiveConnectionUri,
  emptyLiveConnectionFields,
  parseLiveConnectionUri,
  type LiveConnectionFields,
} from '../liveConnectionUri';
import { SavedLiveImportConnectionField } from './SavedLiveImportConnectionField';

type LiveConnectionEngine = LiveImportEngine;
type InputMode = 'fields' | 'uri';

type LiveMongoImportFormProps = {
  disabled: boolean;
  /** Studio status line. The import dialog covers that line, so the form repeats live-import messages. */
  status?: string;
  /** True after Copy started a session and the agent has returned a schema. */
  agentReady?: boolean;
  /** True while waiting for the agent after Copy. */
  agentWaiting?: boolean;
  /** Hosted studio: Import waits for the agent. Local studio imports the URI directly. */
  requireAgent?: boolean;
  onImport: (uri: string, database: string, platform: string, copyOnly?: boolean) => void | Promise<string | void>;
};

type LiveConnectionHint = {
  placeholder: string;
  hint: string;
};

function liveEngineFromSelect(value: string): LiveConnectionEngine {
  switch (value) {
    case 'postgresql':
    case 'mysql':
    case 'mssql':
    case 'sqlite':
    case 'mongodb':
      return value;
    default:
      return 'mongodb';
  }
}

/** Placeholder and helper text for the connection string the user is about to type. */
export function liveConnectionHint(engine: LiveConnectionEngine): LiveConnectionHint {
  switch (engine) {
    case 'mongodb':
      return {
        placeholder: 'mongodb://localhost:27017/shop',
        hint: 'Use mongodb:// or mongodb+srv://. Leave blank to use $DATABASE_URL on the agent host.',
      };
    case 'postgresql':
      return {
        placeholder: 'postgresql://localhost:5432/shop',
        hint: 'Use postgresql://user:password@host:5432/database. Leave blank for $DATABASE_URL. Add ?schema=name when it is not public.',
      };
    case 'mysql':
      return {
        placeholder: 'mysql://localhost:3306/shop',
        hint: 'Use mysql://user:password@host:3306/database. Leave blank for $DATABASE_URL.',
      };
    case 'mssql':
      return {
        placeholder: 'mssql://localhost:1433/shop',
        hint: 'Use mssql:// or sqlserver://. Leave blank for $DATABASE_URL. Add ?schema=dbo when needed.',
      };
    case 'sqlite':
      return {
        placeholder: 'sqlite:///absolute/path/shop.db',
        hint: 'Use sqlite:///path/to/file.db or a bare path. Leave blank for $DATABASE_URL.',
      };
    default: {
      const unexpected: never = engine;
      return unexpected;
    }
  }
}

export type LiveAgentPlatform = 'macos-aarch64' | 'macos-x64' | 'windows-x64' | 'linux-x64';

/** Studio pins download assets to this GitHub release tag (last published agent builds). */
export const LIVE_AGENT_RELEASE = 'v10.1.6';

const LIVE_AGENT_BUILDS: { id: LiveAgentPlatform; label: string; fileName: string }[] = [
  { id: 'macos-aarch64', label: 'macOS Apple Silicon', fileName: 'hvymetl-agent-macos-aarch64' },
  { id: 'macos-x64', label: 'macOS Intel', fileName: 'hvymetl-agent-macos-x64' },
  { id: 'windows-x64', label: 'Windows Intel/AMD', fileName: 'hvymetl-agent-windows-x64.exe' },
  { id: 'linux-x64', label: 'Linux Intel/AMD', fileName: 'hvymetl-agent-linux-x64' },
];

export function isLiveAgentPlatform(value: string): value is LiveAgentPlatform {
  switch (value) {
    case 'macos-aarch64':
    case 'macos-x64':
    case 'windows-x64':
    case 'linux-x64':
      return true;
    default:
      return false;
  }
}

function liveAgentBuild(platform: LiveAgentPlatform): { id: LiveAgentPlatform; label: string; fileName: string } {
  const build = LIVE_AGENT_BUILDS.find((item) => item.id === platform);
  if (build) return build;
  const unexpected: never = platform;
  return unexpected;
}

export function liveAgentDownloadUrl(platform: LiveAgentPlatform): string {
  return `https://github.com/7erry/hvyMETL/releases/download/${LIVE_AGENT_RELEASE}/${liveAgentBuild(platform).fileName}`;
}

type LiveAgentClientHint = {
  userAgent: string;
  platform: string;
  architecture?: string;
};

/** Pick a build when the browser is specific. Macs that only say Intel stay unset. */
export function detectLiveAgentPlatform(hint: LiveAgentClientHint): LiveAgentPlatform | null {
  const userAgent = hint.userAgent.toLowerCase();
  const platform = hint.platform.toLowerCase();
  const architecture = (hint.architecture ?? '').toLowerCase();
  if (userAgent.includes('android')) return null;
  if (platform.includes('win') || userAgent.includes('windows')) return 'windows-x64';
  if (platform.includes('linux') || userAgent.includes('linux')) return 'linux-x64';
  const mac = platform.includes('mac') || userAgent.includes('mac');
  if (!mac) return null;
  if (architecture === 'arm' || architecture === 'aarch64' || userAgent.includes('arm') || platform.includes('arm')) {
    return 'macos-aarch64';
  }
  if (architecture === 'x86' || architecture === 'x86_64' || architecture === 'amd64') return 'macos-x64';
  return null;
}

type AgentUserAgentData = {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string; platform?: string }>;
};

/** Browser hint for the agent menu. Returns null when the Mac architecture is ambiguous. */
export async function detectClientLiveAgentPlatform(): Promise<LiveAgentPlatform | null> {
  const nav = navigator as Navigator & { userAgentData?: AgentUserAgentData };
  const data = nav.userAgentData;
  let architecture: string | undefined;
  let platform = data?.platform || navigator.platform;
  if (data?.getHighEntropyValues) {
    try {
      const hints = await data.getHighEntropyValues(['architecture', 'platform']);
      architecture = hints.architecture;
      if (hints.platform) platform = hints.platform;
    } catch {
      architecture = undefined;
    }
  }
  return detectLiveAgentPlatform({ userAgent: navigator.userAgent, platform, architecture });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** URI flag: typed URI, or shell env so credentials never enter the browser. */
export function liveAgentUriFlag(platform: LiveAgentPlatform, uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) {
    return platform === 'windows-x64' ? '--uri $env:DATABASE_URL' : '--uri "$DATABASE_URL"';
  }
  return platform === 'windows-x64' ? `--uri ${psQuote(trimmed)}` : `--uri ${shellQuote(trimmed)}`;
}

function liveAgentArgTail(
  platform: LiveAgentPlatform,
  token: string,
  uri: string,
  database: string,
  server?: string,
): string {
  const databaseFlag = database ? ` --database ${platform === 'windows-x64' ? psQuote(database) : shellQuote(database)}` : '';
  const serverFlag = server
    ? ` --server ${platform === 'windows-x64' ? psQuote(server) : shellQuote(server)}`
    : '';
  return `--token ${token} ${liveAgentUriFlag(platform, uri)}${databaseFlag}${serverFlag}`;
}

/** Full command for an already-downloaded binary. Windows uses PowerShell quoting. */
export function liveAgentRunCommand(
  platform: LiveAgentPlatform,
  token: string,
  uri: string,
  database: string,
  server?: string,
): string {
  const fileName = liveAgentBuild(platform).fileName;
  const args = liveAgentArgTail(platform, token, uri, database, server);
  switch (platform) {
    case 'windows-x64':
      return `.\\${fileName} ${args}`;
    case 'macos-aarch64':
    case 'macos-x64':
    case 'linux-x64':
      return `chmod +x ${fileName} && ./${fileName} ${args}`;
    default: {
      const unexpected: never = platform;
      return unexpected;
    }
  }
}

/**
 * Primary path: curl|sh (or PowerShell) downloads the release asset and runs it.
 * shortcut: no `npx hvymetl-agent connect --pair` yet — keep token+URI one-liner until pair flow ships.
 */
export function liveAgentOneLiner(
  platform: LiveAgentPlatform,
  token: string,
  uri: string,
  database: string,
  server?: string,
): string {
  const fileName = liveAgentBuild(platform).fileName;
  const url = liveAgentDownloadUrl(platform);
  const args = liveAgentArgTail(platform, token, uri, database, server);
  switch (platform) {
    case 'windows-x64':
      return `Invoke-WebRequest -Uri ${psQuote(url)} -OutFile ${fileName}; .\\${fileName} ${args}`;
    case 'macos-aarch64':
    case 'macos-x64':
    case 'linux-x64':
      return `curl -fsSL ${shellQuote(url)} -o ${fileName} && chmod +x ${fileName} && ./${fileName} ${args}`;
    default: {
      const unexpected: never = platform;
      return unexpected;
    }
  }
}

/** Copy during the click that started `command`, before that promise settles. */
export function copyLiveAgentCommand(command: Promise<string>): Promise<void> {
  const blob = command.then((text) => {
    if (!text) throw new Error('no-command');
    return new Blob([text], { type: 'text/plain' });
  });
  const write =
    typeof ClipboardItem === 'undefined'
      ? command.then((text) => (text ? navigator.clipboard.writeText(text) : undefined))
      : navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
  return write.then(() => undefined).catch(() => undefined);
}

/** Messages that belong next to this form. Other studio status stays in the footer. */
export function liveImportFormNotice(status: string): string {
  if (
    status.startsWith('Reading the live database') ||
    status.startsWith('Import failed') ||
    status.startsWith('Command copied') ||
    status.startsWith('On the computer with the database') ||
    status.startsWith('Agent ready') ||
    status.startsWith('Waiting for agent') ||
    status.startsWith('Schema imported')
  ) {
    return status;
  }
  return '';
}

const ENGINE_LABEL_KEYS: Record<LiveConnectionEngine, MessageKey> = {
  mongodb: 'live.engine.mongodb',
  postgresql: 'live.engine.postgresql',
  mysql: 'live.engine.mysql',
  mssql: 'live.engine.mssql',
  sqlite: 'live.engine.sqlite',
};

/** Live database connection + local-agent bridge for schema import. */
export function LiveMongoImportForm({
  disabled,
  status = '',
  agentReady = false,
  agentWaiting = false,
  requireAgent = true,
  onImport,
}: LiveMongoImportFormProps) {
  const t = useT();
  const [engine, setEngine] = useState<LiveConnectionEngine>('postgresql');
  const [inputMode, setInputMode] = useState<InputMode>('fields');
  const [fields, setFields] = useState<LiveConnectionFields>(() => emptyLiveConnectionFields('postgresql'));
  const [uri, setUri] = useState('');
  const [platform, setPlatform] = useState<LiveAgentPlatform | ''>('');
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [binaryOpen, setBinaryOpen] = useState(false);
  const [commandPreview, setCommandPreview] = useState('');
  const [connections, setConnections] = useState<LiveImportConnection[]>(() => listLiveImportConnections());
  const [connectionId, setConnectionId] = useState(() => listLiveImportConnections()[0]?.id ?? '');
  const userPickedPlatform = useRef(false);
  const connection = liveConnectionHint(engine);
  const selected = isLiveAgentPlatform(platform) ? liveAgentBuild(platform) : null;
  const isWindows = platform === 'windows-x64';
  const isSqlite = engine === 'sqlite';

  const effectiveUri = useMemo(() => {
    if (inputMode === 'uri') return uri.trim();
    return buildLiveConnectionUri(engine, fields);
  }, [inputMode, uri, engine, fields]);

  const effectiveDatabase = useMemo(() => {
    if (inputMode === 'uri') return '';
    if (isSqlite) return '';
    return fields.database.trim();
  }, [inputMode, isSqlite, fields.database]);

  useEffect(() => {
    let cancelled = false;
    void detectClientLiveAgentPlatform().then((detected) => {
      if (!cancelled && detected && !userPickedPlatform.current) setPlatform(detected);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const applySavedConnection = (saved: LiveImportConnection): void => {
    setEngine(saved.engine);
    setUri(saved.uri);
    setFields(parseLiveConnectionUri(saved.engine, saved.uri));
    if (saved.database) {
      setFields((prev) => ({ ...prev, database: saved.database || prev.database }));
    }
  };

  useEffect(() => {
    if (!connectionId) return;
    const saved = connections.find((c) => c.id === connectionId);
    if (!saved) return;
    setEngine(saved.engine);
    setUri(saved.uri);
    setFields(parseLiveConnectionUri(saved.engine, saved.uri));
    if (saved.database) {
      setFields((prev) => ({ ...prev, database: saved.database || prev.database }));
    }
  }, [connectionId, connections]);

  const previewTemplate = useMemo(() => {
    if (!isLiveAgentPlatform(platform)) return '';
    return liveAgentOneLiner(
      platform,
      '<token>',
      effectiveUri,
      effectiveDatabase,
      typeof window !== 'undefined' ? window.location.origin : undefined,
    );
  }, [platform, effectiveUri, effectiveDatabase]);

  const shownCommand = commandPreview || previewTemplate;

  const patchFields = (patch: Partial<LiveConnectionFields>) => {
    setFields((prev) => ({ ...prev, ...patch }));
    setConnectionId('');
  };

  const switchEngine = (next: LiveConnectionEngine) => {
    setEngine(next);
    setConnectionId('');
    setFields((prev) => {
      const defaults = emptyLiveConnectionFields(next);
      return {
        ...defaults,
        host: prev.host || defaults.host,
        database: prev.database,
        user: prev.user,
        password: prev.password,
        schema: prev.schema,
        sslMode: prev.sslMode,
      };
    });
    setCommandPreview('');
  };

  const switchInputMode = (mode: InputMode) => {
    if (mode === inputMode) return;
    if (mode === 'uri') {
      setUri(buildLiveConnectionUri(engine, fields));
    } else {
      setFields(parseLiveConnectionUri(engine, uri));
    }
    setInputMode(mode);
  };

  const runCopy = (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || !selected) return;
    setBusy(true);
    const pending = Promise.resolve(onImport(effectiveUri, effectiveDatabase, platform, true)).then(
      (command) => command ?? '',
    );
    void pending.then((command) => {
      if (command) setCommandPreview(command);
    });
    void copyLiveAgentCommand(pending).finally(() => setBusy(false));
  };

  const runImport = () => {
    if (busy) return;
    setBusy(true);
    void Promise.resolve(onImport(effectiveUri, effectiveDatabase, platform, false)).finally(() => setBusy(false));
  };

  const notice = liveImportFormNotice(status) || (busy ? t('live.reading') : '');

  const badgeLabel = agentWaiting
    ? t('live.waitingAgent')
    : agentReady
      ? t('live.agentReady')
      : t('live.waitingIdle');

  const badgeClass = [
    'live-mongo-import__badge',
    agentReady ? 'live-mongo-import__badge--ready' : '',
    agentWaiting ? 'live-mongo-import__badge--waiting' : '',
    !agentReady && !agentWaiting ? 'live-mongo-import__badge--idle' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const importDisabled =
    disabled || busy || (requireAgent ? !agentReady : !effectiveUri);

  return (
    <form className="live-mongo-import" onSubmit={runCopy}>
      <section className="live-mongo-import__section">
        <h4 className="live-mongo-import__section-title">
          <span className="live-mongo-import__section-num" aria-hidden>
            1
          </span>
          {t('live.sectionConnection')}
        </h4>

        <SavedLiveImportConnectionField
          connections={connections}
          connectionId={connectionId}
          onConnectionIdChange={setConnectionId}
          onConnectionsChange={(next) => {
            setConnections(next);
            if (connectionId && !next.some((c) => c.id === connectionId)) {
              setConnectionId(next[0]?.id ?? '');
            }
          }}
          draftUri={effectiveUri}
          draftDatabase={effectiveDatabase}
          draftEngine={engine}
          onApplyConnection={applySavedConnection}
          disabled={disabled || busy}
        />

        <div className="live-mongo-import__mode-tabs" role="tablist" aria-label={t('live.uri')}>
          <button
            type="button"
            role="tab"
            aria-selected={inputMode === 'fields'}
            className={inputMode === 'fields' ? 'active' : ''}
            onClick={() => switchInputMode('fields')}
          >
            {t('live.inputModeFields')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inputMode === 'uri'}
            className={inputMode === 'uri' ? 'active' : ''}
            onClick={() => switchInputMode('uri')}
          >
            {t('live.inputModeUri')}
          </button>
        </div>

        {inputMode === 'fields' ? (
          <div className={`live-mongo-import__grid${isSqlite ? ' live-mongo-import__grid--sqlite' : ''}`}>
            <label className="live-mongo-import__field">
              <span>{t('live.engine')}</span>
              <select value={engine} onChange={(e) => switchEngine(liveEngineFromSelect(e.target.value))}>
                {(Object.keys(ENGINE_LABEL_KEYS) as LiveConnectionEngine[]).map((id) => (
                  <option key={id} value={id}>
                    {t(ENGINE_LABEL_KEYS[id])}
                  </option>
                ))}
              </select>
            </label>
            {isSqlite ? (
              <label className="live-mongo-import__field live-mongo-import__field--wide">
                <span>{t('live.path')}</span>
                <input
                  value={fields.host}
                  onChange={(e) => patchFields({ host: e.target.value })}
                  placeholder="/absolute/path/shop.db"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            ) : (
              <>
                <label className="live-mongo-import__field">
                  <span>{t('live.host')}</span>
                  <input
                    value={fields.host}
                    onChange={(e) => patchFields({ host: e.target.value })}
                    placeholder="127.0.0.1"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label className="live-mongo-import__field">
                  <span>{t('live.database')}</span>
                  <input
                    value={fields.database}
                    onChange={(e) => patchFields({ database: e.target.value })}
                    placeholder="dvdrental"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label className="live-mongo-import__field">
                  <span>{t('live.port')}</span>
                  <input
                    value={fields.port}
                    onChange={(e) => patchFields({ port: e.target.value })}
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label className="live-mongo-import__field">
                  <span>{t('live.user')}</span>
                  <input
                    value={fields.user}
                    onChange={(e) => patchFields({ user: e.target.value })}
                    autoComplete="username"
                    spellCheck={false}
                  />
                </label>
                <label className="live-mongo-import__field">
                  <span>{t('live.password')}</span>
                  <input
                    type="password"
                    value={fields.password}
                    onChange={(e) => patchFields({ password: e.target.value })}
                    autoComplete="current-password"
                  />
                </label>
              </>
            )}
          </div>
        ) : (
          <label className="live-mongo-import__field live-mongo-import__field--wide">
            <span>{t('live.uri')}</span>
            <input
              value={uri}
              onChange={(e) => {
                setUri(e.target.value);
                setConnectionId('');
              }}
              placeholder={t('live.uriEnvPlaceholder')}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="live-mongo-import__field-hint">{connection.hint}</span>
          </label>
        )}

        <details
          className="live-mongo-import__advanced"
          open={advancedOpen}
          onToggle={(event) => setAdvancedOpen((event.target as HTMLDetailsElement).open)}
        >
          <summary>{t('live.sslSchemaOptions')}</summary>
          <div className="live-mongo-import__grid live-mongo-import__grid--advanced">
            <label className="live-mongo-import__field">
              <span>{t('live.schemaOption')}</span>
              <input
                value={fields.schema}
                onChange={(e) => patchFields({ schema: e.target.value })}
                placeholder="public"
                autoComplete="off"
                spellCheck={false}
                disabled={isSqlite}
              />
            </label>
            <label className="live-mongo-import__field">
              <span>{t('live.sslMode')}</span>
              <select
                value={fields.sslMode}
                onChange={(e) => patchFields({ sslMode: e.target.value })}
                disabled={isSqlite}
              >
                <option value="">{t('live.sslModeDefault')}</option>
                <option value="disable">disable</option>
                <option value="prefer">prefer</option>
                <option value="require">require</option>
              </select>
            </label>
          </div>
        </details>
      </section>

      <section className="live-mongo-import__section">
        <div className="live-mongo-import__section-head">
          <h4 className="live-mongo-import__section-title">
            <span className="live-mongo-import__section-num" aria-hidden>
              2
            </span>
            {t('live.sectionAgent')}
          </h4>
          <select
            className="live-mongo-import__os-select"
            value={platform}
            aria-label={t('live.agentPlatform')}
            onChange={(event) => {
              userPickedPlatform.current = true;
              const next = event.target.value;
              setPlatform(isLiveAgentPlatform(next) ? next : '');
              setCommandPreview('');
            }}
          >
            <option value="">{t('live.chooseComputer')}</option>
            {LIVE_AGENT_BUILDS.map((build) => (
              <option key={build.id} value={build.id}>
                {build.label}
              </option>
            ))}
          </select>
        </div>

        {isWindows ? <p className="schema-import-panel__hint">{t('live.windowsTip')}</p> : null}
        <p className="live-mongo-import__bridge-hint">{t('live.agentBridgeHint')}</p>

        {shownCommand ? (
          <div className="live-mongo-import__command">
            <pre className="live-mongo-import__command-pre" tabIndex={0}>
              {shownCommand}
            </pre>
            <button
              type="submit"
              className="live-mongo-import__copy-btn"
              disabled={disabled || busy || !selected}
              title={t('live.copyCommand')}
              aria-label={t('live.copyCommand')}
            >
              {busy ? '…' : '📋'}
            </button>
          </div>
        ) : (
          <p className="schema-import-panel__hint">{t('live.chooseComputer')}</p>
        )}

        <details
          className="live-mongo-import__binary"
          open={binaryOpen}
          onToggle={(event) => setBinaryOpen((event.target as HTMLDetailsElement).open)}
        >
          <summary>{t('live.firstTimeBinary')}</summary>
          {selected ? (
            <a className="live-mongo-import__download" href={liveAgentDownloadUrl(selected.id)}>
              {t('live.download')} {selected.label}
            </a>
          ) : (
            <p className="schema-import-panel__hint">{t('live.chooseComputer')}</p>
          )}
        </details>
      </section>

      <div className="live-mongo-import__footer">
        <div className={badgeClass} role="status">
          <span className="live-mongo-import__dot" aria-hidden />
          <span className="live-mongo-import__badge-text">{badgeLabel}</span>
          <span className="live-mongo-import__auto-caption">{t('live.autoImportCaption')}</span>
        </div>
        <button type="button" className="primary live-mongo-import__import-btn" disabled={importDisabled} onClick={runImport}>
          {t('schema.import')}
        </button>
      </div>

      {notice ? (
        <p className="live-mongo-import__status" role="status">
          {notice}
        </p>
      ) : null}
    </form>
  );
}
