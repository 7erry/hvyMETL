import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useT } from '../i18n/LocaleContext';
import type { MessageKey } from '../i18n/messages';

type LiveConnectionEngine = 'mongodb' | 'postgresql' | 'mysql' | 'mssql' | 'sqlite';

type LiveMongoImportFormProps = {
  disabled: boolean;
  /** Studio status line. The import dialog covers that line, so the form repeats live-import messages. */
  status?: string;
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
        hint: 'Use mongodb:// or mongodb+srv://. The database can be the path, or the field below.',
      };
    case 'postgresql':
      return {
        placeholder: 'postgresql://localhost:5432/shop',
        hint: 'Use postgresql://user:password@host:5432/database. Add ?schema=name when it is not public.',
      };
    case 'mysql':
      return {
        placeholder: 'mysql://localhost:3306/shop',
        hint: 'Use mysql://user:password@host:3306/database.',
      };
    case 'mssql':
      return {
        placeholder: 'mssql://localhost:1433/shop',
        hint: 'Use mssql:// or sqlserver://user:password@host:1433/database. Add ?schema=dbo when needed.',
      };
    case 'sqlite':
      return {
        placeholder: 'sqlite:///absolute/path/shop.db',
        hint: 'Use sqlite:///path/to/file.db or a bare filesystem path on the agent host.',
      };
    default: {
      const unexpected: never = engine;
      return unexpected;
    }
  }
}

export type LiveAgentPlatform = 'macos-aarch64' | 'macos-x64' | 'windows-x64' | 'linux-x64';

export const LIVE_AGENT_RELEASE = 'v10.1.0';

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

/** Full command for the downloaded file. Windows uses PowerShell quoting. */
export function liveAgentRunCommand(
  platform: LiveAgentPlatform,
  token: string,
  uri: string,
  database: string,
  server?: string,
): string {
  const fileName = liveAgentBuild(platform).fileName;
  const databaseFlag = database ? ` --database ${shellQuote(database)}` : '';
  const serverFlag = server ? ` --server ${shellQuote(server)}` : '';
  const args = `--token ${token} --uri ${shellQuote(uri)}${databaseFlag}${serverFlag}`;
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
    status.startsWith('On the computer with the database')
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

/** URI form for sampling a live database via the studio agent. */
export function LiveMongoImportForm({ disabled, status = '', onImport }: LiveMongoImportFormProps) {
  const t = useT();
  const [engine, setEngine] = useState<LiveConnectionEngine>('mongodb');
  const [uri, setUri] = useState('');
  const [database, setDatabase] = useState('');
  const [platform, setPlatform] = useState<LiveAgentPlatform | ''>('');
  const [busy, setBusy] = useState(false);
  const userPickedPlatform = useRef(false);
  const connection = liveConnectionHint(engine);
  const selected = isLiveAgentPlatform(platform) ? liveAgentBuild(platform) : null;

  useEffect(() => {
    let cancelled = false;
    void detectClientLiveAgentPlatform().then((detected) => {
      if (!cancelled && detected && !userPickedPlatform.current) setPlatform(detected);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const runImport = (event: FormEvent, copy: boolean) => {
    event.preventDefault();
    if (busy || !uri.trim()) return;
    setBusy(true);
    const pending = Promise.resolve(onImport(uri.trim(), database.trim(), platform, copy)).then((command) => command ?? '');
    const finished = copy ? copyLiveAgentCommand(pending) : pending.then(() => undefined);
    void finished.finally(() => setBusy(false));
  };

  const notice = liveImportFormNotice(status) || (busy ? t('live.reading') : '');

  return (
    <form className="live-mongo-import" onSubmit={(event) => runImport(event, true)}>
      <div className="live-mongo-import__agent">
        <p className="pipeline-hint">{t('live.agentHint')}</p>
        <label className="schema-import-panel__label">
          {t('live.agentPlatform')}
          <select
            value={platform}
            onChange={(event) => {
              userPickedPlatform.current = true;
              const next = event.target.value;
              setPlatform(isLiveAgentPlatform(next) ? next : '');
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
        {selected ? (
          <a className="live-mongo-import__download" href={liveAgentDownloadUrl(selected.id)}>
            {t('live.download')} {selected.label}
          </a>
        ) : null}
      </div>
      <label className="schema-import-panel__label">
        {t('live.engine')}
        <select
          value={engine}
          onChange={(event) => setEngine(liveEngineFromSelect(event.target.value))}
          className="schema-import-panel__select"
        >
          {(Object.keys(ENGINE_LABEL_KEYS) as LiveConnectionEngine[]).map((id) => (
            <option key={id} value={id}>
              {t(ENGINE_LABEL_KEYS[id])}
            </option>
          ))}
        </select>
      </label>
      <label className="schema-import-panel__label">
        {t('live.uri')}
        <input
          value={uri}
          onChange={(event) => setUri(event.target.value)}
          placeholder={connection.placeholder}
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>
      <p className="schema-import-panel__hint">{connection.hint}</p>
      <label className="schema-import-panel__label">
        {t('live.database')}
        <input
          value={database}
          onChange={(event) => setDatabase(event.target.value)}
          placeholder="Uses the database in the URI when empty"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {notice ? (
        <p className="live-mongo-import__status" role="status">
          {notice}
        </p>
      ) : null}
      <div className="button-row">
        <button type="submit" className="primary" disabled={disabled || busy || !selected}>
          {busy ? t('live.reading') : t('live.copyCommand')}
        </button>
        <button type="button" className="secondary" disabled={disabled || busy} onClick={(event) => runImport(event, false)}>
          {t('live.importLive')}
        </button>
      </div>
    </form>
  );
}
