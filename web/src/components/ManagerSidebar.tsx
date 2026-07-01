import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPipelineExecutions } from '../api';
import type { ActivityFeedItem, MigrationProgress } from '../managerDashboard';
import { buildActivityFeed, buildCloudResourceSummary } from '../managerDashboard';
import { formatTokenCount, tokenUsageSourceLabel } from '../modelUsage';
import type { MigrationArtifacts, ManagerCostInputs } from '../sessionState';
import type { PipelineExecutionListItem } from '../transformationSummaryTypes';
import { ManagerCostPanel } from './ManagerCostPanel';
import { SchemaImportPanel } from './SchemaImportPanel';
import type { MigrationPlan } from '../migrationPlanTypes';
import type { Dialect, SqlStructuralModel } from '../types';

type ManagerSidebarProps = {
  model: SqlStructuralModel | null;
  migrationPlan: MigrationPlan | null;
  progress: MigrationProgress;
  artifacts: MigrationArtifacts | null;
  blockerCount: number;
  reviewCount: number;
  profileInfo: { label: string; readPercent: number; writePercent: number } | null;
  managerCostInputs: ManagerCostInputs;
  onManagerCostInputsChange: (inputs: ManagerCostInputs) => void;
  dialects: Dialect[];
  dialect: string;
  ddl: string;
  apiConnected: boolean;
  onDialectChange: (dialect: string) => void;
  onDdlChange: (ddl: string) => void;
  onImportQuery: () => void;
  onSchemaFile: (file: File) => void;
  onOpenReview: () => void;
};

function ProgressRing({ percent }: { percent: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="manager-progress-ring" aria-label={`${percent}% schemas mapped`}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle className="manager-progress-ring__track" cx="70" cy="70" r={radius} />
        <circle
          className="manager-progress-ring__fill"
          cx="70"
          cy="70"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 70 70)"
        />
      </svg>
      <div className="manager-progress-ring__label">
        <strong>{percent}%</strong>
        <span>mapped</span>
      </div>
    </div>
  );
}

function formatWhen(timestamp: string): string {
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

export function ManagerSidebar({
  model,
  migrationPlan,
  progress,
  artifacts,
  blockerCount,
  reviewCount,
  profileInfo,
  managerCostInputs,
  onManagerCostInputsChange,
  dialects,
  dialect,
  ddl,
  apiConnected,
  onDialectChange,
  onDdlChange,
  onImportQuery,
  onSchemaFile,
  onOpenReview,
}: ManagerSidebarProps) {
  const [activity, setActivity] = useState<ActivityFeedItem[]>([]);
  const [executions, setExecutions] = useState<PipelineExecutionListItem[]>([]);

  const refreshActivity = useCallback(async () => {
    try {
      const data = await fetchPipelineExecutions(15);
      setExecutions(data.executions);
      setActivity(buildActivityFeed(artifacts, data.executions));
    } catch {
      setExecutions([]);
      setActivity(buildActivityFeed(artifacts, []));
    }
  }, [artifacts]);

  useEffect(() => {
    void refreshActivity();
  }, [refreshActivity]);

  const cloudSummary = useMemo(
    () => buildCloudResourceSummary(artifacts, executions, profileInfo),
    [artifacts, executions, profileInfo],
  );

  return (
    <div className="manager-sidebar sidebar-scroll">
      {!model ? (
        <SchemaImportPanel
          dialects={dialects}
          dialect={dialect}
          ddl={ddl}
          apiConnected={apiConnected}
          onDialectChange={onDialectChange}
          onDdlChange={onDdlChange}
          onImportQuery={onImportQuery}
          onSchemaFile={onSchemaFile}
          compact
        />
      ) : null}

      <section className="manager-panel">
        <h3>Migration progress</h3>
        <div className="manager-progress-block">
          <ProgressRing percent={progress.percent} />
          <p className="manager-progress-summary">
            <strong>{progress.mappedCount}</strong> of <strong>{progress.totalCount}</strong> entities mapped
          </p>
          <ul className="manager-progress-breakdown">
            <li><span className="dot dot--ready" /> {progress.readyCount} ready</li>
            <li><span className="dot dot--review" /> {reviewCount} need review</li>
            <li><span className="dot dot--blocked" /> {progress.blockedCount} blocked</li>
            <li><span className="dot dot--pending" /> {progress.pendingCount} pending</li>
          </ul>
        </div>
      </section>

      {(blockerCount > 0 || reviewCount > 0) && (
        <section className="manager-panel manager-panel--alert">
          <h3>Attention needed</h3>
          {reviewCount > 0 ? (
            <>
              <p>
                {reviewCount} collection(s) have recommended design changes — review and accept before sign-off.
              </p>
              <button type="button" className="primary manager-review-cta" onClick={onOpenReview}>
                Review recommended changes
              </button>
            </>
          ) : null}
          {blockerCount > 0 ? (
            <p>{blockerCount} entity(ies) are blocked and must be resolved before sign-off.</p>
          ) : null}
        </section>
      )}

      <ManagerCostPanel
        model={model}
        migrationPlan={migrationPlan}
        inputs={managerCostInputs}
        onChange={onManagerCostInputsChange}
      />

      <section className="manager-panel manager-token-panel">
        <h3>Model API usage</h3>
        {!cloudSummary.modelTokenUsage || cloudSummary.modelTokenUsage.totalTokens === 0 ? (
          <p className="manager-hint">
            Run design or the full pipeline with <code>MONGODB_MODEL_KEY</code> or{' '}
            <code>OPENAI_API_KEY</code> to track embedding and rerank tokens. BM25-only runs report zero tokens.
          </p>
        ) : (
          <>
            <dl className="manager-metrics manager-token-metrics">
              <div>
                <dt>Session total</dt>
                <dd className="manager-token-total">
                  {formatTokenCount(cloudSummary.modelTokenUsage.totalTokens)} tokens
                  {cloudSummary.modelTokenUsage.estimated ? (
                    <span className="manager-token-estimated" title="Some values were estimated from text length">
                      est.
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt>Embeddings</dt>
                <dd>{formatTokenCount(cloudSummary.modelTokenUsage.embeddingTokens)}</dd>
              </div>
              <div>
                <dt>Rerank</dt>
                <dd>{formatTokenCount(cloudSummary.modelTokenUsage.rerankTokens)}</dd>
              </div>
              <div>
                <dt>API calls</dt>
                <dd>{cloudSummary.modelTokenUsage.apiCalls.toLocaleString()}</dd>
              </div>
              {cloudSummary.retrievalStrategy ? (
                <div>
                  <dt>Retrieval mode</dt>
                  <dd className="manager-token-strategy">{cloudSummary.retrievalStrategy}</dd>
                </div>
              ) : null}
            </dl>
            <p className="manager-hint manager-token-footnote">{tokenUsageSourceLabel(cloudSummary.modelTokenUsage)}</p>
          </>
        )}
      </section>

      <section className="manager-panel">
        <h3>Workload & Atlas imports</h3>
        {!cloudSummary.profileLabel && !cloudSummary.hasImportData && cloudSummary.pipelineRunsRecorded === 0 ? (
          <p className="manager-hint">
            No pipeline data yet. Run the full pipeline to record Atlas import counts and workload settings.
          </p>
        ) : (
          <dl className="manager-metrics">
            {cloudSummary.profileLabel ? (
              <div>
                <dt>Workload profile</dt>
                <dd>{cloudSummary.profileLabel}</dd>
              </div>
            ) : null}
            {cloudSummary.readWriteRatio ? (
              <div>
                <dt>Read / write ratio</dt>
                <dd>{cloudSummary.readWriteRatio}</dd>
              </div>
            ) : null}
            {cloudSummary.documentsImported !== null ? (
              <div>
                <dt>Documents imported</dt>
                <dd>{cloudSummary.documentsImported.toLocaleString()}</dd>
              </div>
            ) : null}
            {cloudSummary.hasImportData ? (
              <div>
                <dt>Collections imported</dt>
                <dd>
                  {cloudSummary.collectionsSucceeded} succeeded
                  {cloudSummary.collectionsFailed > 0
                    ? ` · ${cloudSummary.collectionsFailed} failed`
                    : ''}
                </dd>
              </div>
            ) : null}
            {cloudSummary.targetDatabase ? (
              <div>
                <dt>Target database</dt>
                <dd>{cloudSummary.targetDatabase}</dd>
              </div>
            ) : null}
            {cloudSummary.pipelineRunsRecorded > 0 ? (
              <div>
                <dt>Pipeline runs recorded</dt>
                <dd>{cloudSummary.pipelineRunsRecorded}</dd>
              </div>
            ) : null}
            {cloudSummary.lastPipelineAt ? (
              <div>
                <dt>Last pipeline run</dt>
                <dd>{formatWhen(cloudSummary.lastPipelineAt)}</dd>
              </div>
            ) : null}
            {cloudSummary.retrievalStrategy ? (
              <div>
                <dt>Design retrieval</dt>
                <dd>{cloudSummary.retrievalStrategy}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </section>

      <section className="manager-panel">
        <div className="manager-panel__header">
          <h3>Activity</h3>
          <button type="button" className="tertiary manager-refresh" onClick={() => void refreshActivity()}>
            Refresh activity
          </button>
        </div>
        {activity.length === 0 ? (
          <p className="manager-hint">No activity yet. Run design or the full pipeline to populate this feed.</p>
        ) : (
          <ul className="manager-activity">
            {activity.map((item) => (
              <li key={item.id} className={`manager-activity__item manager-activity__item--${item.tone}`}>
                <span className="manager-activity__message">{item.message}</span>
                <time className="manager-activity__time">{formatWhen(item.timestamp)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
