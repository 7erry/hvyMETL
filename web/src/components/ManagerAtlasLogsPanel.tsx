import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  describeApiError,
  fetchAtlasLogsSnapshot,
  fetchAtlasLogsStatus,
  type AtlasDatabaseLogResult,
  type AtlasLogsSnapshot,
  type AtlasLogsStatus,
  type AtlasProjectEvent,
} from '../api';
import { CollapsiblePanel } from './CollapsiblePanel';

function formatWhen(timestamp: string | undefined): string {
  if (!timestamp) return '—';
  try {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return timestamp;
  }
}

type ManagerAtlasLogsPanelProps = {
  apiConnected: boolean;
};

export function ManagerAtlasLogsPanel({ apiConnected }: ManagerAtlasLogsPanelProps) {
  const [status, setStatus] = useState<AtlasLogsStatus | null>(null);
  const [snapshot, setSnapshot] = useState<AtlasLogsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    if (!apiConnected) return;
    try {
      const next = await fetchAtlasLogsStatus();
      setStatus(next);
    } catch (e) {
      setError(describeApiError(e));
    }
  }, [apiConnected]);

  const loadSnapshot = useCallback(async () => {
    if (!apiConnected || !status?.configured) return;
    setLoading(true);
    setError('');
    try {
      const next = await fetchAtlasLogsSnapshot({
        itemsPerPage: 15,
        maxLogLines: 40,
        includeDatabaseLogs: status.hasHostName,
      });
      setSnapshot(next);
      setStatus(next.status);
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setLoading(false);
    }
  }, [apiConnected, status?.configured, status?.hasHostName]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const collapsedHint = useMemo(() => {
    if (!status?.configured) return 'Not configured';
    if (loading) return 'Loading…';
    const eventCount = snapshot?.events.events.length ?? 0;
    if (eventCount === 0) return 'No events yet';
    const latest = snapshot?.events.events[0]?.eventTypeName;
    return latest ? `${eventCount} events · ${latest}` : `${eventCount} events`;
  }, [loading, snapshot, status?.configured]);

  const events: AtlasProjectEvent[] = snapshot?.events.events ?? [];
  const databaseLogs: AtlasDatabaseLogResult | undefined = snapshot?.databaseLogs;
  const databaseLogWarning = snapshot?.databaseLogWarning;

  return (
    <CollapsiblePanel title="Atlas Logs" collapsedHint={collapsedHint}>
      {!apiConnected ? (
        <p className="manager-hint">Connect to the API server to load Atlas project logs.</p>
      ) : !status?.configured ? (
        <p className="manager-hint">
          Set <code>ATLAS_CLIENT_ID</code>, <code>ATLAS_CLIENT_SECRET</code>, and <code>ATLAS_GROUP_ID</code> in the
          API server <code>.env</code>. Optional <code>ATLAS_NODE_HOSTNAME</code> enables mongod log download.
        </p>
      ) : (
        <>
          <div className="manager-atlas-logs__toolbar">
            <span className="manager-hint">
              Project {status.groupIdMasked ?? 'configured'}
              {status.hasHostName ? ' · database logs enabled' : ' · project events only'}
              {status.serverEgressIp ? ` · server IP ${status.serverEgressIp}` : ''}
            </span>
            <button type="button" className="tertiary" onClick={() => void loadSnapshot()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh logs'}
            </button>
          </div>

          {error ? <p className="manager-atlas-logs__error">{error}</p> : null}
          {status.serverEgressIp ? (
            <p className="manager-hint">
              Add API server IP <code>{status.serverEgressIp}</code> to Atlas → Organization Settings → Access
              Manager → <strong>IP Access List</strong> (Admin API, separate from cluster Network Access).
            </p>
          ) : null}

          {status.hostNameHint ? (
            <p className="manager-atlas-logs__warn">
              <strong>Check ATLAS_NODE_HOSTNAME:</strong> {status.hostNameHint}
            </p>
          ) : null}

          {!snapshot && !loading && !error ? (
            <p className="manager-hint">Click Refresh logs to pull recent Atlas project activity.</p>
          ) : null}

          {events.length > 0 ? (
            <div className="manager-atlas-logs__section">
              <h4 className="manager-atlas-logs__heading">Recent project events</h4>
              <ul className="manager-atlas-logs__events">
                {events.map((event) => (
                  <li key={event.id ?? `${event.eventTypeName}-${event.created}`}>
                    <strong>{event.eventTypeName ?? 'EVENT'}</strong>
                    <span>{formatWhen(event.created)}</span>
                    {event.hostname ? <span className="manager-atlas-logs__meta">{event.hostname}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {databaseLogWarning ? (
            <div className="manager-atlas-logs__section">
              <p className="manager-atlas-logs__warn">
                <strong>Database logs unavailable:</strong> {databaseLogWarning.error}
                {databaseLogWarning.hint ? ` ${databaseLogWarning.hint}` : ''}
              </p>
            </div>
          ) : null}

          {databaseLogs ? (
            <div className="manager-atlas-logs__section">
              <h4 className="manager-atlas-logs__heading">
                Database log preview ({databaseLogs.logName})
              </h4>
              <p className="manager-hint">
                {databaseLogs.hostName} · {databaseLogs.lineCount.toLocaleString()} lines
                {databaseLogs.truncated ? ' · showing last 40' : ''}
              </p>
              <pre className="manager-atlas-logs__preview">{databaseLogs.lines.join('\n')}</pre>
            </div>
          ) : !status.hasHostName ? (
            <p className="manager-hint">
              Add <code>ATLAS_NODE_HOSTNAME</code> with a per-node FQDN (for example{' '}
              <code>cluster0-shard-00-00.abc12.mongodb.net</code>), not the cluster connection hostname
              from <code>MONGODB_URI</code>. Atlas → cluster → View Monitoring lists node hostnames.
            </p>
          ) : null}
        </>
      )}
    </CollapsiblePanel>
  );
}
