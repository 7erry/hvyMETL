import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { describeApiError } from '../api';
import { useT } from '../i18n/LocaleContext';
import type { MessageKey } from '../i18n/messages';
import {
  deleteLiveImportConnection,
  listLiveImportConnections,
  upsertLiveImportConnection,
  type LiveImportConnection,
  type LiveImportEngine,
} from '../liveImportConnections';

type LiveConnectionEngine = LiveImportEngine;

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

/** Studio pins download assets to this GitHub release tag. */
export const LIVE_AGENT_RELEASE = 'v10.1.5';

const LIVE_AGENT_BUILDS: { id: LiveAgentPlatform; label: string; fileName: string }[] = [
  { id: 'macos-aarch64', label: 'macOS Apple silicon', fileName: 'hvymetl-agent-macos-aarch64' },
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
 * Chose curl|sh over npm — no `@hvymetl/agent` package / publish step required.
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

type ConnFormState = { id?: string; name: string; uri: string; database: string };

/** URI form for sampling a live database via the studio agent. */
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
  const [uri, setUri] = useState('');
  const [database, setDatabase] = useState('');
  const [platform, setPlatform] = useState<LiveAgentPlatform | ''>('');
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [binaryOpen, setBinaryOpen] = useState(false);
  const [osOpen, setOsOpen] = useState(false);
  const [commandPreview, setCommandPreview] = useState('');
  const [connections, setConnections] = useState<LiveImportConnection[]>(() => listLiveImportConnections());
  const [connectionId, setConnectionId] = useState(() => listLiveImportConnections()[0]?.id ?? '');
  const [editingConn, setEditingConn] = useState(false);
  const [connForm, setConnForm] = useState<ConnFormState>({ name: '', uri: '', database: '' });
  const [connError, setConnError] = useState('');
  const userPickedPlatform = useRef(false);
  const connection = liveConnectionHint(engine);
  const selected = isLiveAgentPlatform(platform) ? liveAgentBuild(platform) : null;
  const isWindows = platform === 'windows-x64';

  useEffect(() => {
    let cancelled = false;
    void detectClientLiveAgentPlatform().then((detected) => {
      if (!cancelled && detected && !userPickedPlatform.current) setPlatform(detected);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!connectionId) return;
    const saved = connections.find((c) => c.id === connectionId);
    if (!saved) return;
    setEngine(saved.engine);
    setUri(saved.uri);
    setDatabase(saved.database);
  }, [connectionId, connections]);

  const previewTemplate = useMemo(() => {
    if (!isLiveAgentPlatform(platform)) return '';
    return liveAgentOneLiner(platform, '<token>', uri, database.trim(), typeof window !== 'undefined' ? window.location.origin : undefined);
  }, [platform, uri, database]);

  const shownCommand = commandPreview || previewTemplate;

  const refreshConnections = (): LiveImportConnection[] => {
    const next = listLiveImportConnections();
    setConnections(next);
    if (connectionId && !next.some((c) => c.id === connectionId)) {
      setConnectionId(next[0]?.id ?? '');
    }
    return next;
  };

  const runCopy = (event: FormEvent) => {
    event.preventDefault();
    if (busy || !selected) return;
    setBusy(true);
    const pending = Promise.resolve(onImport(uri.trim(), database.trim(), platform, true)).then((command) => command ?? '');
    void pending.then((command) => {
      if (command) setCommandPreview(command);
    });
    void copyLiveAgentCommand(pending).finally(() => setBusy(false));
  };

  const runImport = () => {
    if (busy) return;
    setBusy(true);
    void Promise.resolve(onImport(uri.trim(), database.trim(), platform, false)).finally(() => setBusy(false));
  };

  const notice = liveImportFormNotice(status) || (busy ? t('live.reading') : '');

  const badgeLabel = agentWaiting
    ? t('live.waitingAgent')
    : agentReady
      ? t('live.agentReady')
      : t('live.waitingIdle');

  return (
    <form className="live-mongo-import" onSubmit={runCopy}>
      <ol className="live-mongo-import__steps">
        <li className="live-mongo-import__step">
          <h4 className="live-mongo-import__step-title">{t('live.step1')}</h4>
          <label className="schema-import-panel__label">
            {t('live.engine')}
            <select
              value={engine}
              onChange={(event) => {
                setEngine(liveEngineFromSelect(event.target.value));
                setConnectionId('');
              }}
              className="schema-import-panel__select"
            >
              {(Object.keys(ENGINE_LABEL_KEYS) as LiveConnectionEngine[]).map((id) => (
                <option key={id} value={id}>
                  {t(ENGINE_LABEL_KEYS[id])}
                </option>
              ))}
            </select>
          </label>

          <div className={editingConn ? 'saved-mongo-conn saved-mongo-conn--editing' : 'saved-mongo-conn'}>
            <label className="schema-import-panel__label">
              <span>{t('live.savedConnections')}</span>
              <div className="saved-mongo-conn__row">
                <select
                  value={connectionId}
                  aria-label={t('live.savedConnections')}
                  onChange={(e) => setConnectionId(e.target.value)}
                  onFocus={refreshConnections}
                >
                  {connections.length === 0 ? (
                    <option value="">{t('live.noSavedConnections')}</option>
                  ) : (
                    <>
                      <option value="">{t('live.manualConnection')}</option>
                      {connections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name || c.id}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <button
                  type="button"
                  className="tertiary"
                  onClick={() => {
                    setConnForm({ name: '', uri, database });
                    setConnError('');
                    setEditingConn(true);
                  }}
                >
                  {t('connections.add')}
                </button>
                <button
                  type="button"
                  className="tertiary"
                  disabled={!connectionId}
                  onClick={() => {
                    const selectedConn = connections.find((c) => c.id === connectionId);
                    if (!selectedConn) return;
                    setConnForm({
                      id: selectedConn.id,
                      name: selectedConn.name,
                      uri: selectedConn.uri,
                      database: selectedConn.database,
                    });
                    setConnError('');
                    setEditingConn(true);
                  }}
                >
                  {t('connections.edit')}
                </button>
                <button
                  type="button"
                  className="danger secondary"
                  disabled={!connectionId}
                  onClick={() => {
                    const selectedConn = connections.find((c) => c.id === connectionId);
                    if (!selectedConn) return;
                    if (!window.confirm(t('connections.deleteConfirm', { name: selectedConn.name }))) return;
                    deleteLiveImportConnection(selectedConn.id);
                    const next = refreshConnections();
                    setConnectionId(next[0]?.id ?? '');
                    setEditingConn(false);
                  }}
                >
                  {t('connections.delete')}
                </button>
              </div>
            </label>
            {editingConn ? (
              <div className="saved-mongo-conn__form">
                <label>
                  {t('connections.name')}
                  <input
                    value={connForm.name}
                    onChange={(e) => setConnForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder={t('connections.namePlaceholder')}
                  />
                </label>
                <label>
                  {t('live.uri')}
                  <input
                    value={connForm.uri}
                    onChange={(e) => setConnForm((prev) => ({ ...prev, uri: e.target.value }))}
                    placeholder={connection.placeholder}
                    spellCheck={false}
                  />
                </label>
                <label>
                  {t('live.database')}
                  <input
                    value={connForm.database}
                    onChange={(e) => setConnForm((prev) => ({ ...prev, database: e.target.value }))}
                    placeholder={t('live.databasePlaceholder')}
                    spellCheck={false}
                  />
                </label>
                {connError ? <p className="saved-mongo-conn__error">{connError}</p> : null}
                <div className="button-row">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      try {
                        const saved = upsertLiveImportConnection({
                          id: connForm.id,
                          name: connForm.name,
                          engine,
                          uri: connForm.uri,
                          database: connForm.database,
                        });
                        const next = refreshConnections();
                        setConnectionId(next.some((c) => c.id === saved.id) ? saved.id : (next[0]?.id ?? ''));
                        setUri(saved.uri);
                        setDatabase(saved.database);
                        setEditingConn(false);
                        setConnError('');
                      } catch (error) {
                        setConnError(describeApiError(error));
                      }
                    }}
                  >
                    {t('common.save')}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setEditingConn(false);
                      setConnError('');
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
                <p className="saved-mongo-conn__hint">{t('live.storageHint')}</p>
              </div>
            ) : null}
          </div>

          <label className="schema-import-panel__label">
            {t('live.uri')}
            <input
              value={uri}
              onChange={(event) => {
                setUri(event.target.value);
                setConnectionId('');
              }}
              placeholder={t('live.uriEnvPlaceholder')}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="schema-import-panel__hint">{connection.hint}</p>

          <details
            className="live-mongo-import__advanced"
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen((event.target as HTMLDetailsElement).open)}
          >
            <summary>{t('live.advanced')}</summary>
            <label className="schema-import-panel__label">
              {t('live.database')}
              <input
                value={database}
                onChange={(event) => setDatabase(event.target.value)}
                placeholder={t('live.databasePlaceholder')}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <p className="schema-import-panel__hint">{t('live.advancedSkipHint')}</p>
          </details>
        </li>

        <li className="live-mongo-import__step">
          <h4 className="live-mongo-import__step-title">
            {t('live.step2')}
            {selected ? (
              <button type="button" className="tertiary live-mongo-import__os-change" onClick={() => setOsOpen((v) => !v)}>
                {selected.label} · {t('live.changeOs')}
              </button>
            ) : null}
          </h4>
          {osOpen || !selected ? (
            <label className="schema-import-panel__label">
              {t('live.agentPlatform')}
              <select
                value={platform}
                onChange={(event) => {
                  userPickedPlatform.current = true;
                  const next = event.target.value;
                  setPlatform(isLiveAgentPlatform(next) ? next : '');
                  setCommandPreview('');
                  setOsOpen(false);
                }}
                className="schema-import-panel__select"
              >
                <option value="">{t('live.chooseComputer')}</option>
                {LIVE_AGENT_BUILDS.map((build) => (
                  <option key={build.id} value={build.id}>
                    {build.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {isWindows ? <p className="schema-import-panel__hint">{t('live.windowsTip')}</p> : null}
          {shownCommand ? (
            <div className="live-mongo-import__command">
              <pre className="live-mongo-import__command-pre" tabIndex={0}>
                {shownCommand}
              </pre>
              <button type="submit" className="primary" disabled={disabled || busy || !selected}>
                {busy ? t('live.reading') : t('live.copyCommand')}
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
            <summary>{t('live.orDownloadBinary')}</summary>
            {selected ? (
              <a className="live-mongo-import__download" href={liveAgentDownloadUrl(selected.id)}>
                {t('live.download')} {selected.label}
              </a>
            ) : (
              <p className="schema-import-panel__hint">{t('live.chooseComputer')}</p>
            )}
          </details>
        </li>

        <li className="live-mongo-import__step">
          <h4 className="live-mongo-import__step-title">{t('live.step3')}</h4>
          <div className="live-mongo-import__import-row">
            <span
              className={`live-mongo-import__badge${agentWaiting ? ' live-mongo-import__badge--waiting' : ''}${agentReady ? ' live-mongo-import__badge--ready' : ''}`}
              role="status"
            >
              {badgeLabel}
            </span>
            <button
              type="button"
              className="secondary"
              disabled={
                disabled || busy || (requireAgent ? !agentReady : !uri.trim())
              }
              onClick={runImport}
            >
              {t('schema.import')}
            </button>
          </div>
          <p className="schema-import-panel__hint">{t('live.oneLinerNote')}</p>
        </li>
      </ol>

      {notice ? (
        <p className="live-mongo-import__status" role="status">
          {notice}
        </p>
      ) : null}
    </form>
  );
}
