import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react';
import {
  createLiveAgentSession,
  waitForLiveAgentExtract,
  waitForLiveAgentResult,
  type LiveAgentExtractStatus,
} from '../api';
import {
  listLiveImportConnections,
  type LiveImportConnection,
} from '../liveImportConnections';
import { liveImportEngineFromUri } from '../liveConnectionUri';
import { SavedLiveImportConnectionField } from './SavedLiveImportConnectionField';
import {
  copyLiveAgentCommand,
  detectClientLiveAgentPlatform,
  isLiveAgentPlatform,
  liveAgentDownloadUrl,
  liveAgentOneLiner,
  type LiveAgentPlatform,
} from './LiveMongoImportForm';

const LIVE_AGENT_BUILDS: { id: LiveAgentPlatform; label: string }[] = [
  { id: 'macos-aarch64', label: 'macOS Apple Silicon' },
  { id: 'macos-x64', label: 'macOS Intel' },
  { id: 'windows-x64', label: 'Windows Intel/AMD' },
  { id: 'linux-x64', label: 'Linux Intel/AMD' },
];

type LivePipelineFieldsProps = {
  uri: string;
  database: string;
  disabled: boolean;
  /** Hosted studio: start agent + wait for extract before Run. */
  requireAgent?: boolean;
  agentStagingDir?: string | null;
  onChange: (next: { uri: string; database: string }) => void;
  onAgentStagingChange?: (stagingDir: string | null) => void;
};

type AgentPhase = 'idle' | 'waiting' | 'streaming' | 'ready' | 'error';

/** Connection fields for one pipeline run. Saved picks reuse Live Import connections. */
export function LivePipelineFields({
  uri,
  database,
  disabled,
  requireAgent = false,
  agentStagingDir = null,
  onChange,
  onAgentStagingChange,
}: LivePipelineFieldsProps): ReactElement {
  const [connections, setConnections] = useState<LiveImportConnection[]>(() =>
    listLiveImportConnections(),
  );
  const [connectionId, setConnectionId] = useState('');
  const [platform, setPlatform] = useState<LiveAgentPlatform | ''>('');
  const [commandPreview, setCommandPreview] = useState('');
  const [phase, setPhase] = useState<AgentPhase>(() => (agentStagingDir ? 'ready' : 'idle'));
  const [status, setStatus] = useState('');
  const [extractProgress, setExtractProgress] = useState<LiveAgentExtractStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const userPickedPlatform = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void detectClientLiveAgentPlatform().then((detected) => {
      if (!cancelled && detected && !userPickedPlatform.current) setPlatform(detected);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyConnection = (saved: LiveImportConnection): void => {
    onChange({ uri: saved.uri, database: saved.database });
    onAgentStagingChange?.(null);
    setPhase('idle');
    setStatus('');
    setExtractProgress(null);
    setCommandPreview('');
  };

  const previewTemplate = useMemo(() => {
    if (!requireAgent || !isLiveAgentPlatform(platform)) return '';
    return liveAgentOneLiner(
      platform,
      '<token>',
      uri.trim(),
      database.trim(),
      typeof window !== 'undefined' ? window.location.origin : undefined,
    );
  }, [requireAgent, platform, uri, database]);

  const shownCommand = commandPreview || previewTemplate;

  const startAgent = (event?: FormEvent): void => {
    event?.preventDefault();
    if (!requireAgent || busy || disabled || !isLiveAgentPlatform(platform)) return;
    setBusy(true);
    onAgentStagingChange?.(null);
    setExtractProgress(null);
    setPhase('waiting');
    setStatus('Waiting for agent… Paste the command in a terminal on the database host.');

    const commandPromise = createLiveAgentSession().then((session) => {
      const command = liveAgentOneLiner(
        platform,
        session.token,
        uri.trim(),
        database.trim(),
        window.location.origin,
      );
      setCommandPreview(command);
      void (async () => {
        try {
          const result = await waitForLiveAgentResult(session.token);
          setPhase('streaming');
          setStatus('Agent connected. Streaming live extract…');
          const extract =
            result.extract?.status === 'complete'
              ? result.extract
              : await waitForLiveAgentExtract(session.token);
          setExtractProgress(extract);
          onAgentStagingChange?.(extract.stagingDir);
          setPhase('ready');
          setStatus(
            `Extract ready (${extract.tables.length} table${extract.tables.length === 1 ? '' : 's'}). Run the pipeline.`,
          );
        } catch (error: unknown) {
          setPhase('error');
          setStatus(error instanceof Error ? error.message : 'Agent extract failed.');
          onAgentStagingChange?.(null);
        } finally {
          setBusy(false);
        }
      })();
      return command;
    });

    void copyLiveAgentCommand(commandPromise).catch(() => {
      /* clipboard may fail; command still shown */
    });
    void commandPromise.catch((error: unknown) => {
      setPhase('error');
      setStatus(error instanceof Error ? error.message : 'Could not start agent session.');
      onAgentStagingChange?.(null);
      setBusy(false);
    });
  };

  const badgeLabel =
    phase === 'waiting'
      ? 'Waiting for agent…'
      : phase === 'streaming'
        ? 'Streaming extract…'
        : phase === 'ready'
          ? 'Extract ready'
          : phase === 'error'
            ? 'Agent error'
            : 'Waiting for agent…';

  const badgeClass = [
    'live-mongo-import__badge',
    phase === 'ready' ? 'live-mongo-import__badge--ready' : '',
    phase === 'waiting' || phase === 'streaming' ? 'live-mongo-import__badge--waiting' : '',
    phase === 'idle' || phase === 'error' ? 'live-mongo-import__badge--idle' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="pipeline-card">
      <p className="pipeline-hint">
        {requireAgent
          ? 'On the hosted studio, the local Rust agent streams table extracts over WSS into staging CSVs for this run. Saved connections are shared with Live Import.'
          : 'Up to 1,000 rows per SQL table, or 50 documents per MongoDB collection. Saved connections are shared with Live Import and stay in this browser.'}
      </p>
      <SavedLiveImportConnectionField
        connections={connections}
        connectionId={connectionId}
        onConnectionIdChange={setConnectionId}
        onConnectionsChange={setConnections}
        draftUri={uri}
        draftDatabase={database}
        draftEngine={liveImportEngineFromUri(uri) ?? 'postgresql'}
        onApplyConnection={applyConnection}
        disabled={disabled || busy}
      />
      <label>
        Connection URI
        <input
          value={uri}
          disabled={disabled || busy}
          autoComplete="off"
          spellCheck={false}
          placeholder="postgresql://localhost:5432/shop"
          onChange={(event) => {
            setConnectionId('');
            onAgentStagingChange?.(null);
            setPhase('idle');
            onChange({ uri: event.target.value, database });
          }}
        />
      </label>
      <label>
        Database
        <input
          value={database}
          disabled={disabled || busy}
          autoComplete="off"
          spellCheck={false}
          placeholder="Uses the database in the URI when empty"
          onChange={(event) => {
            setConnectionId('');
            onAgentStagingChange?.(null);
            setPhase('idle');
            onChange({ uri, database: event.target.value });
          }}
        />
      </label>

      {requireAgent ? (
        <form className="live-mongo-import" onSubmit={startAgent} style={{ marginTop: '0.75rem' }}>
          <div className="live-mongo-import__section-head">
            <strong>Local agent</strong>
            <select
              className="live-mongo-import__os-select"
              value={platform}
              aria-label="Agent computer"
              disabled={disabled || busy}
              onChange={(event) => {
                userPickedPlatform.current = true;
                const next = event.target.value;
                setPlatform(isLiveAgentPlatform(next) ? next : '');
                setCommandPreview('');
              }}
            >
              <option value="">Choose your computer…</option>
              {LIVE_AGENT_BUILDS.map((build) => (
                <option key={build.id} value={build.id}>
                  {build.label}
                </option>
              ))}
            </select>
          </div>
          <p className="pipeline-hint">
            Copy the command, run it where the database is reachable, then wait until the extract is
            ready before Run pipeline.
          </p>
          {shownCommand ? (
            <div className="live-mongo-import__command">
              <pre className="live-mongo-import__command-pre" tabIndex={0}>
                {shownCommand}
              </pre>
            </div>
          ) : null}
          <div className="live-mongo-import__footer" style={{ marginTop: '0.5rem' }}>
            <div className={badgeClass} role="status">
              <span className="live-mongo-import__dot" aria-hidden />
              <span className="live-mongo-import__badge-text">{badgeLabel}</span>
            </div>
            <button
              type="submit"
              className="primary"
              disabled={disabled || busy || !isLiveAgentPlatform(platform)}
            >
              {busy ? 'Working…' : 'Start agent'}
            </button>
            {isLiveAgentPlatform(platform) ? (
              <a className="secondary" href={liveAgentDownloadUrl(platform)}>
                Download agent
              </a>
            ) : null}
          </div>
          {status ? (
            <p className="pipeline-hint" role="status">
              {status}
              {extractProgress && phase === 'streaming'
                ? ` (${extractProgress.tables.filter((t) => t.eof).length}/${extractProgress.tables.length} tables)`
                : ''}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
