import { useCallback, useEffect, useState } from 'react';
import { fetchPipelineExecution, fetchPipelineExecutions } from '../api';
import type { PipelineExecutionDetail, PipelineExecutionListItem } from '../transformationSummaryTypes';

type PipelineHistoryPanelProps = {
  onLoadExecution: (execution: PipelineExecutionDetail) => void;
};

export function PipelineHistoryPanel({ onLoadExecution }: PipelineHistoryPanelProps) {
  const [executions, setExecutions] = useState<PipelineExecutionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchPipelineExecutions(15);
      setExecutions(data.executions);
    } catch (e) {
      setExecutions([]);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSelect = async (executionId: string) => {
    setLoadingId(executionId);
    setError('');
    try {
      const detail = await fetchPipelineExecution(executionId);
      onLoadExecution(detail);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="panel pipeline-history" style={{ marginBottom: '0.75rem' }}>
      <div className="pipeline-history__header">
        <h3>Pipeline history</h3>
        <button type="button" className="tertiary" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh list'}
        </button>
      </div>
      <p className="pipeline-hint">Recent runs from Atlas memory DB (requires MONGODB_URI on the API server).</p>
      {error ? <p className="pipeline-history__error">{error}</p> : null}
      {executions.length === 0 && !loading && !error ? (
        <p className="pipeline-hint">No pipeline executions stored yet.</p>
      ) : null}
      <ul className="pipeline-history__list">
        {executions.map((execution) => (
          <li key={execution.executionId}>
            <button
              type="button"
              className="pipeline-history__item"
              onClick={() => void handleSelect(execution.executionId)}
              disabled={loadingId === execution.executionId}
            >
              <span className={execution.ok ? 'pipeline-history__ok' : 'pipeline-history__fail'}>
                {execution.ok ? '✓' : '✗'}
              </span>
              <span className="pipeline-history__when">
                {new Date(execution.completedAt).toLocaleString()}
              </span>
              <span className="pipeline-history__profile">{execution.profileId}</span>
              <span className="pipeline-history__meta">{execution.schemaDialect}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
