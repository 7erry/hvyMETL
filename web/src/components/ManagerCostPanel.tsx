import { useMemo } from 'react';
import {
  computeManagerCostProjection,
  DEFAULT_MANAGER_COST_INPUTS,
  formatGb,
  formatRowCount,
  formatUsd,
  type ManagerCostInputs,
  type ManagerWorkloadType,
} from '../managerCostEstimate';
import type { MigrationPlan } from '../migrationPlanTypes';
import type { SqlStructuralModel } from '../types';

type ManagerCostPanelProps = {
  model: SqlStructuralModel | null;
  migrationPlan: MigrationPlan | null;
  inputs: ManagerCostInputs;
  onChange: (inputs: ManagerCostInputs) => void;
};

const ROW_SLIDER_MAX = 50_000_000;
const ROW_SLIDER_STEP = 500_000;

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
    title: 'Write-heavy (50/50)',
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

  const setWorkload = (workloadType: ManagerWorkloadType) => {
    onChange({ ...inputs, workloadType });
  };

  const setRows = (estimatedTotalRows: number) => {
    onChange({ ...inputs, estimatedTotalRows: Math.max(10_000, estimatedTotalRows) });
  };

  const setGrowth = (growthRatePercent: number) => {
    onChange({ ...inputs, growthRatePercent: Math.max(0, Math.min(100, growthRatePercent)) });
  };

  if (!model) {
    return (
      <section className="manager-panel">
        <h3>Migration cost projection</h3>
        <p className="manager-hint">Import a source schema to estimate Atlas sizing and monthly run costs.</p>
      </section>
    );
  }

  const hasSchemaRowStats = model.tables.some((t) => t.rowCount > 0);

  return (
    <section className="manager-panel manager-cost-panel">
      <h3>Migration cost projection</h3>
      <p className="manager-hint manager-cost-panel__intro">
        Heuristic sizing from your DDL and workload profile — not a formal Atlas quote.
      </p>

      <div className="manager-cost-inputs">
        <label className="manager-cost-field">
          <span className="manager-cost-field__label">
            Dataset scale — total estimated rows: <strong>{formatRowCount(inputs.estimatedTotalRows)}</strong>
          </span>
          <input
            type="range"
            min={100_000}
            max={ROW_SLIDER_MAX}
            step={ROW_SLIDER_STEP}
            value={inputs.estimatedTotalRows}
            onChange={(e) => setRows(Number(e.target.value))}
          />
          {hasSchemaRowStats ? (
            <span className="manager-cost-field__note">Row totals use statistics from the imported schema.</span>
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
      </div>

      <div className="manager-cost-card">
        <div className="manager-cost-card__header">
          <span className="manager-cost-card__icon" aria-hidden>💰</span>
          <div>
            <strong>Estimated monthly running cost (MongoDB Atlas)</strong>
            <p>Target architecture: MongoDB Atlas dedicated cluster</p>
          </div>
        </div>

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
              {formatGb(projection.rawDataGb)} raw · {formatGb(projection.totalStorageGb)} with BSON + indexes (
              {projection.indexCount} indexes)
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

        <div className="manager-cost-totals">
          <div className="manager-cost-totals__row">
            <span>Monthly compute / storage</span>
            <strong>{formatUsd(projection.monthlyComputeUsd)} / mo</strong>
          </div>
          <div className="manager-cost-totals__row">
            <span>Backup &amp; storage</span>
            <strong>{formatUsd(projection.monthlyBackupUsd)} / mo</strong>
          </div>
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
      </div>
    </section>
  );
}

const EGRESS_DISPLAY_RATE = '0.09';
