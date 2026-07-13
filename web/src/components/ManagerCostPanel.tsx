import { useMemo } from 'react';
import {
  buildArchiveCollectionOptions,
  computeManagerCostProjection,
  DEFAULT_MANAGER_COST_INPUTS,
  formatGb,
  formatIndexKeyDisplay,
  formatPersonWeeks,
  formatRowCount,
  formatShardKeyDisplay,
  formatUsd,
  SHARDING_THRESHOLD_GB,
  type ManagerCostInputs,
  type ManagerWorkloadType,
} from '../managerCostEstimate';
import type { MigrationPlan } from '../migrationPlanTypes';
import type { SqlStructuralModel } from '../types';
import { CollapsiblePanel } from './CollapsiblePanel';

type ManagerCostPanelProps = {
  model: SqlStructuralModel | null;
  migrationPlan: MigrationPlan | null;
  inputs: ManagerCostInputs;
  onChange: (inputs: ManagerCostInputs) => void;
};

const DATASET_SLIDER_MIN_GB = 1;
const DATASET_SLIDER_MAX_GB = 21 * 1024;
const DATASET_SLIDER_STEP_GB = 64;

const WORKLOAD_OPTIONS: { id: ManagerWorkloadType; title: string; hint: string }[] = [
  {
    id: 'read-heavy',
    title: 'Read-heavy (80/20)',
    hint: 'Blogs, storefronts, analytics dashboards',
  },
  {
    id: 'balanced',
    title: 'Balanced (50/50)',
    hint: 'Mixed transactional and reporting workloads',
  },
  {
    id: 'write-heavy',
    title: 'Write-heavy (20/80)',
    hint: 'IoT logging, chat, financial ledgers',
  },
];

export function ManagerCostPanel({
  model,
  migrationPlan,
  inputs,
  onChange,
}: ManagerCostPanelProps) {
  const projection = useMemo(
    () => computeManagerCostProjection(model, migrationPlan, inputs),
    [model, migrationPlan, inputs],
  );
  const archiveOptions = useMemo(
    () => buildArchiveCollectionOptions(model, migrationPlan, inputs),
    [model, migrationPlan, inputs],
  );

  const setWorkload = (workloadType: ManagerWorkloadType) => {
    onChange({ ...inputs, workloadType });
  };

  const setDataSize = (estimatedDataGb: number) => {
    onChange({ ...inputs, estimatedDataGb: Math.max(DATASET_SLIDER_MIN_GB, estimatedDataGb) });
  };

  const setGrowth = (growthRatePercent: number) => {
    onChange({ ...inputs, growthRatePercent: Math.max(0, Math.min(100, growthRatePercent)) });
  };

  const setArchiveRetention = (collectionName: string, retentionYears: number) => {
    onChange({
      ...inputs,
      collectionRetentionYears: {
        ...(inputs.collectionRetentionYears ?? {}),
        [collectionName]: Math.max(0, Math.min(10, Math.round(retentionYears))),
      },
    });
  };

  if (!model) {
    return (
      <CollapsiblePanel title="Migration Cost Projection">
        <p className="manager-hint">Import a source schema to estimate Atlas sizing and monthly run costs.</p>
      </CollapsiblePanel>
    );
  }

  const hasSchemaRowStats = model.tables.some((t) => t.rowCount > 0);
  const datasetScaleGb = Math.max(
    DATASET_SLIDER_MIN_GB,
    Math.min(DATASET_SLIDER_MAX_GB, inputs.estimatedDataGb > 0 ? inputs.estimatedDataGb : projection.rawDataGb),
  );

  return (
    <>
      <CollapsiblePanel title="Migration Cost Projection" defaultOpen className="manager-cost-panel">
        <p className="manager-hint manager-cost-panel__intro">
          Heuristic sizing from your DDL and workload profile — not a formal Atlas quote.
        </p>

        <div className="manager-cost-inputs">
          <label className="manager-cost-field">
            <span className="manager-cost-field__label">
              Dataset scale — raw data: <strong>{formatGb(datasetScaleGb)}</strong>
            </span>
            <input
              type="range"
              min={DATASET_SLIDER_MIN_GB}
              max={DATASET_SLIDER_MAX_GB}
              step={DATASET_SLIDER_STEP_GB}
              value={datasetScaleGb}
              onChange={(e) => setDataSize(Number(e.target.value))}
            />
            {hasSchemaRowStats ? (
              <span className="manager-cost-field__note">
                Schema statistics estimate document shape; slider scenarios scale raw data up to 21 TB. Approximate
                documents: {formatRowCount(projection.estimatedTotalRows)}.
              </span>
            ) : null}
          </label>

          <div className="manager-cost-workload" role="group" aria-label="Workload type">
            <span className="manager-cost-field__label">Workload type</span>
            <div className="manager-cost-workload__grid">
              {WORKLOAD_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={inputs.workloadType === option.id ? 'active' : ''}
                  onClick={() => setWorkload(option.id)}
                >
                  <strong>{option.title}</strong>
                  <span>{option.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="manager-cost-field">
            <span className="manager-cost-field__label">
              Expected data growth: <strong>{inputs.growthRatePercent}%</strong> YoY
            </span>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={inputs.growthRatePercent}
              onChange={(e) => setGrowth(Number(e.target.value))}
            />
          </label>

          {archiveOptions.length > 0 ? (
            <details className="manager-archive-controls">
              <summary className="manager-archive-controls__summary">
                <span>
                  <strong>Archive pattern by collection</strong>
                  <small>
                    {archiveOptions.length} eligible collection{archiveOptions.length === 1 ? '' : 's'}
                    {projection.archiveStorageGb > 0
                      ? ` · ${formatGb(projection.archiveStorageGb)} archived for ${formatUsd(projection.monthlyArchiveUsd)} / mo`
                      : ''}
                  </small>
                </span>
              </summary>
              <p className="manager-cost-field__note">
                Retain recent data on the hot Atlas cluster, then route older dated documents to Online Archive.
              </p>
              <div className="manager-archive-controls__list">
                {archiveOptions.map((option) => (
                  <div className="manager-archive-control" key={option.collectionName}>
                    <label className="manager-archive-control__toggle">
                      <input
                        type="checkbox"
                        checked={option.isEnabled}
                        onChange={(e) =>
                          setArchiveRetention(option.collectionName, e.target.checked ? option.retentionYears : 0)
                        }
                      />
                      <span>
                        <strong>{option.collectionName}</strong>
                        <small>
                          {option.isPlanned ? 'Recommended' : 'Available'} · date field {option.timeField}
                        </small>
                      </span>
                    </label>
                    <label className="manager-archive-control__years">
                      <span>Hot retention</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        step={1}
                        value={option.retentionYears}
                        disabled={!option.isEnabled}
                        onChange={(e) => setArchiveRetention(option.collectionName, Number(e.target.value))}
                      />
                      <span>years</span>
                    </label>
                    <p className="manager-archive-control__hint">
                      Partition: {option.partitionFields.join(' -> ')}. Use Atlas Data Federation's unified
                      connection string for hot + archived queries.
                    </p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel title="Estimated Manpower Eliminated">
        <div className="manager-cost-manpower" aria-label="Estimated manpower eliminated">
          <div className="manager-cost-manpower__primary">
            <span>Estimated manpower eliminated</span>
            <strong>{formatPersonWeeks(projection.personWeeksEliminated)}</strong>
          </div>
          <p>
            {projection.manpowerReductionPercent}% less migration labor than a manual redesign, leaving about{' '}
            <strong>{formatPersonWeeks(projection.hvyMetlAssistedPersonWeeks)}</strong> for architectural review,
            validation, and cutover execution.
          </p>
          <div className="manager-cost-manpower__breakdown" aria-label="Manpower estimate breakdown">
            {projection.manpowerCategoryBreakdown.map((category) => (
              <div className="manager-cost-manpower__category" key={category.label}>
                <div>
                  <strong>{category.label}</strong>
                  <span>{category.description}</span>
                </div>
                <em>{formatPersonWeeks(category.personWeeksEliminated)}</em>
              </div>
            ))}
          </div>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel title="Recommended Tier">
        <dl className="manager-cost-card__metrics">
          <div>
            <dt>Recommended tier</dt>
            <dd>
              {projection.recommendedTier.label} ({projection.recommendedTier.ramGb} GB RAM,{' '}
              {projection.recommendedTier.storageGb} GB storage)
            </dd>
          </div>
          <div>
            <dt>Dataset size (est.)</dt>
            <dd>
              {formatGb(projection.rawDataGb)} raw · {formatGb(projection.activeStorageGb)} hot
              {projection.archiveStorageGb > 0 ? ` · ${formatGb(projection.archiveStorageGb)} archived` : ''} (
              {projection.indexCount} hot indexes)
            </dd>
          </div>
          <div>
            <dt>Avg document size</dt>
            <dd>{projection.averageDocumentBytes.toLocaleString()} bytes</dd>
          </div>
        </dl>

        <div className="manager-cost-working-set" aria-label={`${projection.workingSetPercent}% working set in RAM`}>
          <div className="manager-cost-working-set__track">
            <div
              className="manager-cost-working-set__fill"
              style={{ width: `${projection.workingSetPercent}%` }}
            />
          </div>
          <span className="manager-cost-working-set__label">
            {projection.workingSetPercent}% working set fits in tier RAM
          </span>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel title="Monthly Cost" defaultOpen>
        <div className="manager-cost-card__header">
          <span className="manager-cost-card__icon" aria-hidden>💰</span>
          <div>
            <strong>Estimated monthly running cost (MongoDB Atlas)</strong>
            <p>Target architecture: MongoDB Atlas dedicated cluster</p>
          </div>
        </div>

        <div className="manager-cost-savings" aria-label="Estimated MongoDB optimization savings">
          <div className="manager-cost-savings__primary">
            <span>Estimated monthly savings</span>
            <strong>{formatUsd(projection.monthlySavingsUsd)}</strong>
          </div>
          <div className="manager-cost-savings__meta">
            <span>{projection.savingsPercent}% lower than manual migration + all-hot storage baseline</span>
            <span>
              Baseline {formatUsd(projection.baselineMonthlyTotalUsd)} / mo → optimized{' '}
              {formatUsd(projection.monthlyTotalUsd)} / mo
            </span>
            <span>
              Includes {formatUsd(projection.monthlyManpowerSavingsUsd)} / mo monthlyized manpower avoided
              {projection.infrastructureMonthlySavingsUsd > 0
                ? ` and ${formatUsd(projection.infrastructureMonthlySavingsUsd)} / mo Atlas storage optimization`
                : ''}
              .
            </span>
          </div>
        </div>

        <div className="manager-cost-totals">
          <div className="manager-cost-totals__row">
            <span>Monthly compute / storage</span>
            <strong>{formatUsd(projection.monthlyComputeUsd)} / mo</strong>
          </div>
          <div className="manager-cost-totals__row">
            <span>Hot backup &amp; storage ({formatGb(projection.activeStorageGb)})</span>
            <strong>{formatUsd(projection.monthlyBackupUsd)} / mo</strong>
          </div>
          {projection.archiveCollectionCount > 0 ? (
            <div className="manager-cost-totals__row">
              <span>
                Online Archive ({projection.archiveCollectionCount} collection
                {projection.archiveCollectionCount === 1 ? '' : 's'}, {formatGb(projection.archiveStorageGb)})
              </span>
              <strong>{formatUsd(projection.monthlyArchiveUsd)} / mo</strong>
            </div>
          ) : null}
          <div className="manager-cost-totals__row manager-cost-totals__row--total">
            <span>Projected total Opex</span>
            <strong>{formatUsd(projection.monthlyTotalUsd)} / mo</strong>
          </div>
        </div>

        <p className="manager-cost-egress">
          <span aria-hidden>⚡</span> One-time egress (migrate {formatGb(projection.rawDataGb)}):{' '}
          <strong>{formatUsd(projection.oneTimeEgressUsd)}</strong>
          <span className="manager-cost-egress__rate"> (~${EGRESS_DISPLAY_RATE}/GB)</span>
        </p>

        {projection.growthRatePercent > 0 ? (
          <p className="manager-cost-footnote">
            At {projection.growthRatePercent}% YoY growth, projected monthly cost next year:{' '}
            <strong>{formatUsd(projection.projectedMonthlyNextYearUsd)}</strong>.
          </p>
        ) : null}
        {projection.archiveCollectionCount > 0 ? (
          <p className="manager-cost-footnote">
            Archive model keeps about <strong>{projection.archiveHotDataPercent}%</strong> of collection bytes hot.
            Avoid updates at the archive threshold; use TTL indexes instead for logs or sessions that can be deleted.
          </p>
        ) : null}
      </CollapsiblePanel>

      {projection.requiresSharding ? (
        <CollapsiblePanel title="Sharding Recommended">
          <div className="manager-cost-sharding" aria-label="Sharding recommendations">
            <div className="manager-cost-sharding__header">
              <strong>Sharding recommended ({formatGb(SHARDING_THRESHOLD_GB)}+ dataset)</strong>
              <p>
                At this scale, plan a sharded cluster with shard keys that distribute reads and writes uniformly.{' '}
                <a
                  href="https://www.mongodb.com/docs/manual/sharding/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Sharding documentation
                </a>
                {' · '}
                <a
                  href="https://www.mongodb.com/company/blog/mongodb/performance-best-practices-sharding"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Performance best practices
                </a>
              </p>
            </div>
            <ul className="manager-cost-sharding__guidance">
              {projection.shardingGuidance.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="manager-cost-sharding__table-wrap">
              <table className="manager-cost-sharding__table">
                <thead>
                  <tr>
                    <th scope="col">Collection</th>
                    <th scope="col">Hot storage</th>
                    <th scope="col">Shard key</th>
                    <th scope="col">Strategy</th>
                    <th scope="col">Supporting index</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.shardingRecommendations.map((rec) => (
                    <tr key={rec.collectionName}>
                      <td>
                        <strong>{rec.collectionName}</strong>
                        <span>{rec.rationale}</span>
                        {rec.warnings.length > 0 ? (
                          <ul className="manager-cost-sharding__warnings">
                            {rec.warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        ) : null}
                        <span className="manager-cost-sharding__query">{rec.queryGuidance}</span>
                      </td>
                      <td>{formatGb(rec.estimatedHotStorageGb)}</td>
                      <td>
                        <code>{formatShardKeyDisplay(rec.shardKey)}</code>
                      </td>
                      <td>{rec.strategy}</td>
                      <td>
                        <code>{formatIndexKeyDisplay(rec.supportingIndex)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CollapsiblePanel>
      ) : null}

      <div className="manager-cost-legal" role="note">
        Estimates only. Not a quote, invoice, legal commitment, SLA, or financial advice. Actual MongoDB Atlas pricing,
        credits, taxes, usage, data transfer, support, and regional charges may vary.
      </div>
    </>
  );
}

const EGRESS_DISPLAY_RATE = '0.09';
