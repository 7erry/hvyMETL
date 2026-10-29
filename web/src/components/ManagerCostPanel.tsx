import { useMemo } from 'react';
import {
  buildArchiveCollectionOptions,
  computeManagerCostProjection,
  formatGb,
  formatIndexKeyDisplay,
  formatPersonWeeks,
  formatRowCount,
  formatShardKeyDisplay,
  formatUsd,
  SHARDING_THRESHOLD_GB,
  TARGET_WORKLOAD_PROFILES,
  type ManagerCostInputs,
  type ManagerWorkloadType,
  type TargetWorkloadProfileId,
} from '../managerCostEstimate';
import { ATLAS_TIER_REFERENCE_ROWS } from '../../../src/atlas/atlasTierSizing.ts';
import { DATASET_TIER_SLIDER_ANCHORS_GB } from '../../../src/atlas/atlasTargetWorkloadProfiles.ts';
import type { MigrationPlan } from '../migrationPlanTypes';
import type { SqlStructuralModel } from '../types';
import {
  DATASET_SLIDER_MAX_GB,
  DATASET_SLIDER_MIN_GB,
  DATASET_SLIDER_POSITION_STEPS,
  datasetScaleSliderTrackPercent,
  rawDataGbFromSliderPosition,
  sliderPositionFromRawDataGb,
} from '../datasetScaleSlider';
import { useT } from '../i18n/LocaleContext';
import type { MessageKey } from '../i18n/messages';
import { CollapsiblePanel } from './CollapsiblePanel';

export type ManagerCostPanelVariant = 'developer' | 'manager';

type ManagerCostPanelProps = {
  model: SqlStructuralModel | null;
  migrationPlan: MigrationPlan | null;
  inputs: ManagerCostInputs;
  onChange: (inputs: ManagerCostInputs) => void;
  /** Developer: sizing inputs + tier. Manager: manpower + monthly cost + legal note. */
  variant?: ManagerCostPanelVariant;
  /** Controlled open state for the primary sizing panel (developer sidebar flow). */
  sizingPanelOpen?: boolean;
  onSizingPanelOpenChange?: (open: boolean) => void;
};

const WORKLOAD_OPTION_KEYS: {
  id: ManagerWorkloadType;
  titleKey: MessageKey;
  hintKey: MessageKey;
}[] = [
  {
    id: 'read-heavy',
    titleKey: 'sidebar.workloadReadHeavy',
    hintKey: 'sidebar.workloadReadHeavyHint',
  },
  {
    id: 'balanced',
    titleKey: 'sidebar.workloadBalanced',
    hintKey: 'sidebar.workloadBalancedHint',
  },
  {
    id: 'write-heavy',
    titleKey: 'sidebar.workloadWriteHeavy',
    hintKey: 'sidebar.workloadWriteHeavyHint',
  },
];

const WORKLOAD_SHORT: Record<ManagerWorkloadType, string> = {
  'read-heavy': '80/20',
  balanced: '50/50',
  'write-heavy': '20/80',
};

const MANAGER_COST_LEGAL_NOTE =
  'Estimates only. Not a quote, invoice, legal commitment, SLA, or financial advice. Actual MongoDB Atlas pricing, credits, taxes, usage, data transfer, support, and regional charges may vary.';

export function ManagerCostPanel({
  model,
  migrationPlan,
  inputs,
  onChange,
  variant = 'developer',
  sizingPanelOpen,
  onSizingPanelOpenChange,
}: ManagerCostPanelProps) {
  const t = useT();
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

  const setTargetWorkloadProfile = (targetWorkloadProfile: TargetWorkloadProfileId) => {
    onChange({ ...inputs, targetWorkloadProfile });
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
    if (variant === 'manager') return null;
    return (
      <CollapsiblePanel
        title={t('sidebar.sizingTitle')}
        open={sizingPanelOpen}
        onOpenChange={onSizingPanelOpenChange}
      >
        <p className="manager-hint">{t('sidebar.sizingEmpty')}</p>
      </CollapsiblePanel>
    );
  }

  const hasSchemaRowStats = model.tables.some((table) => table.rowCount > 0);
  const datasetScaleGb = Math.max(
    DATASET_SLIDER_MIN_GB,
    Math.min(DATASET_SLIDER_MAX_GB, inputs.estimatedDataGb > 0 ? inputs.estimatedDataGb : projection.rawDataGb),
  );
  const datasetSliderPosition = sliderPositionFromRawDataGb(datasetScaleGb);

  const sizingSection = (
    <CollapsiblePanel
        title={t('sidebar.sizingTitle')}
        open={sizingPanelOpen}
        onOpenChange={onSizingPanelOpenChange}
        defaultOpen={sizingPanelOpen === undefined}
        className="manager-cost-panel"
        collapsedHint={`${formatGb(datasetScaleGb)} · ${WORKLOAD_SHORT[inputs.workloadType]}`}
      >
        <p className="manager-hint manager-cost-panel__intro">{t('sidebar.sizingIntro')}</p>

        <div className="manager-cost-inputs">
          <label className="manager-cost-field">
            <span className="manager-cost-field__label">
              {t('sidebar.datasetScale')} <strong>{formatGb(datasetScaleGb)}</strong>
            </span>
            <div className="manager-cost-dataset-scale">
              <input
                type="range"
                min={0}
                max={DATASET_SLIDER_POSITION_STEPS}
                step={1}
                value={datasetSliderPosition}
                onChange={(e) => setDataSize(rawDataGbFromSliderPosition(Number(e.target.value)))}
                aria-valuetext={t('sidebar.rawRecommendedAria', {
                  size: formatGb(datasetScaleGb),
                  tier: projection.recommendedTier.label,
                })}
              />
              <div className="manager-cost-tier-ruler" aria-hidden="true">
                {DATASET_TIER_SLIDER_ANCHORS_GB.map(({ tierId, rawDataGb }) => (
                  <button
                    key={tierId}
                    type="button"
                    className={
                      projection.recommendedTier.id === tierId ? 'manager-cost-tier-ruler__mark active' : 'manager-cost-tier-ruler__mark'
                    }
                    style={{ left: `${datasetScaleSliderTrackPercent(rawDataGb)}%` }}
                    title={`${tierId} · ~${formatGb(rawDataGb)} raw`}
                    onClick={() => setDataSize(rawDataGb)}
                  >
                    {tierId}
                  </button>
                ))}
              </div>
            </div>
            <span className="manager-cost-field__note">
              {t('sidebar.sliderNote', {
                mid: formatGb(4 * 1024),
                max: formatGb(DATASET_SLIDER_MAX_GB),
              })}
              {hasSchemaRowStats ? (
                <>
                  {' '}
                  {t('sidebar.schemaStatsNote', { rows: formatRowCount(projection.estimatedTotalRows) })}
                </>
              ) : null}
            </span>
          </label>

          <div className="manager-cost-workload" role="group" aria-label={t('sidebar.workloadType')}>
            <span className="manager-cost-field__label">{t('sidebar.workloadType')}</span>
            <div className="manager-cost-workload__grid">
              {WORKLOAD_OPTION_KEYS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={inputs.workloadType === option.id ? 'active' : ''}
                  aria-pressed={inputs.workloadType === option.id}
                  onClick={() => setWorkload(option.id)}
                >
                  <strong>{t(option.titleKey)}</strong>
                  <span>{t(option.hintKey)}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="manager-cost-field">
            <span className="manager-cost-field__label">
              {t('sidebar.dataGrowth')} <strong>{inputs.growthRatePercent}%</strong> {t('sidebar.yoy')}
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
                  <strong>{t('sidebar.archiveByCollection')}</strong>
                  <small>
                    {t(
                      archiveOptions.length === 1
                        ? 'sidebar.eligibleCollection'
                        : 'sidebar.eligibleCollections',
                      { count: archiveOptions.length },
                    )}
                    {projection.archiveStorageGb > 0
                      ? ` · ${formatGb(projection.archiveStorageGb)} archived for ${formatUsd(projection.monthlyArchiveUsd)} / mo`
                      : ''}
                  </small>
                </span>
              </summary>
              <p className="manager-cost-field__note">{t('sidebar.archiveRetainHint')}</p>
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
                          {option.isPlanned ? t('sidebar.recommended') : t('sidebar.available')} ·{' '}
                          {t('sidebar.dateField')} {option.timeField}
                        </small>
                      </span>
                    </label>
                    <label className="manager-archive-control__years">
                      <span>{t('sidebar.hotRetention')}</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        step={1}
                        value={option.retentionYears}
                        disabled={!option.isEnabled}
                        onChange={(e) => setArchiveRetention(option.collectionName, Number(e.target.value))}
                      />
                      <span>{t('sidebar.years')}</span>
                    </label>
                    <p className="manager-archive-control__hint">
                      {t('sidebar.archivePartitionHint', {
                        fields: option.partitionFields.join(' -> '),
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </CollapsiblePanel>
  );

  const manpowerSection = (
      <CollapsiblePanel
        title="Estimated Manpower Eliminated"
        collapsedHint={formatPersonWeeks(projection.personWeeksEliminated)}
      >
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
  );

  const recommendedTierSection = (
      <CollapsiblePanel
        title={t('sidebar.recommendedTier')}
        collapsedHint={`${projection.recommendedTier.label} · ${projection.recommendedTier.ramGb} GB RAM`}
      >
        <label className="manager-cost-field manager-cost-field--tier-profile">
          <span className="manager-cost-field__label">{t('sidebar.targetWorkloadProfile')}</span>
          <select
            className="manager-cost-profile-select"
            value={inputs.targetWorkloadProfile ?? 'auto'}
            onChange={(e) => setTargetWorkloadProfile(e.target.value as TargetWorkloadProfileId)}
          >
            {TARGET_WORKLOAD_PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
          <span className="manager-cost-field__note">{projection.recommendedTierWorkloadSummary}</span>
        </label>

        <dl className="manager-cost-card__metrics">
          <div>
            <dt>{t('sidebar.recommendedTierLabel')}</dt>
            <dd>
              {projection.recommendedTier.label} ({projection.recommendedTier.ramGb} GB RAM,{' '}
              {projection.recommendedTier.vcpu} vCPU, up to {formatGb(projection.recommendedTier.storageGb)} storage)
            </dd>
          </div>
          <div>
            <dt>{t('sidebar.maxConnections')}</dt>
            <dd>{projection.recommendedTier.maxConnections.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{t('sidebar.datasetSizeEst')}</dt>
            <dd>
              {formatGb(projection.rawDataGb)} raw · {formatGb(projection.activeStorageGb)} hot
              {projection.archiveStorageGb > 0 ? ` · ${formatGb(projection.archiveStorageGb)} archived` : ''} (
              {projection.indexCount} hot indexes)
            </dd>
          </div>
          <div>
            <dt>{t('sidebar.planningStorage')}</dt>
            <dd>
              {formatGb(projection.planningStorageGb)}
              {projection.growthRatePercent > 0
                ? t('sidebar.inclGrowth', { percent: projection.growthRatePercent })
                : ''}
              {projection.exceedsReplicaSetDiskCap ? t('sidebar.exceedsReplicaSet') : ''}
            </dd>
          </div>
          <div>
            <dt>{t('sidebar.targetRam')}</dt>
            <dd>
              {formatGb(projection.requiredRamGb)} — 2× (indexes {formatGb(projection.indexSizeGb)} + active data{' '}
              {formatGb(projection.activeWorkingSetGb)})
            </dd>
          </div>
          <div>
            <dt>{t('sidebar.avgDocSize')}</dt>
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
            {t('sidebar.workingSetFits', { percent: projection.workingSetPercent })}
          </span>
        </div>

        <details className="manager-cost-tier-reference">
          <summary>{t('sidebar.atlasTierReference')}</summary>
          <div className="manager-cost-tier-reference__wrap">
            <table className="manager-cost-tier-reference__table">
              <thead>
                <tr>
                  <th scope="col">{t('sidebar.tierCol')}</th>
                  <th scope="col">{t('sidebar.vcpuCol')}</th>
                  <th scope="col">{t('sidebar.ramCol')}</th>
                  <th scope="col">{t('sidebar.storageScaleCol')}</th>
                  <th scope="col">{t('sidebar.maxConnCol')}</th>
                </tr>
              </thead>
              <tbody>
                {ATLAS_TIER_REFERENCE_ROWS.map((row) => (
                  <tr
                    key={row.tierLabel}
                    className={
                      row.tierLabel.includes(projection.recommendedTier.label) ||
                      row.tierLabel.startsWith(projection.recommendedTier.label)
                        ? 'manager-cost-tier-reference__row--active'
                        : undefined
                    }
                  >
                    <td>{row.tierLabel}</td>
                    <td>{row.vcpuLabel}</td>
                    <td>{row.ramGb} GB</td>
                    <td>{row.storageScaleLabel}</td>
                    <td>{row.maxConnectionsLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CollapsiblePanel>
  );

  const monthlyCostSection = (
      <CollapsiblePanel
        title="Monthly Cost"
        defaultOpen
        collapsedHint={`${formatUsd(projection.monthlyTotalUsd)} / mo`}
      >
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
  );

  /** Sharding recommendations render only in the developer variant (not Manager Configure). */
  const shardingSection =
    projection.requiresSharding ? (
        <CollapsiblePanel
          title={t('sidebar.shardingTitle')}
          collapsedHint={t('sidebar.shardingCollections', {
            count: projection.shardingRecommendations.length,
          })}
        >
          <div className="manager-cost-sharding" aria-label={t('sidebar.shardingTitle')}>
            <div className="manager-cost-sharding__header">
              <strong>
                {t('sidebar.shardingHeader', { threshold: formatGb(SHARDING_THRESHOLD_GB) })}
              </strong>
              <p>
                {t('sidebar.shardingIntro')}{' '}
                <a
                  href="https://www.mongodb.com/docs/manual/sharding/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('sidebar.shardingDocs')}
                </a>
                {' · '}
                <a
                  href="https://www.mongodb.com/company/blog/mongodb/performance-best-practices-sharding"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('sidebar.shardingBestPractices')}
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
                    <th scope="col">{t('sidebar.collectionCol')}</th>
                    <th scope="col">{t('sidebar.hotStorageCol')}</th>
                    <th scope="col">{t('sidebar.shardKeyCol')}</th>
                    <th scope="col">{t('sidebar.strategyCol')}</th>
                    <th scope="col">{t('sidebar.supportingIndexCol')}</th>
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
      ) : null;

  const legalNote = (
    <div className="manager-cost-legal" role="note">
      {MANAGER_COST_LEGAL_NOTE}
    </div>
  );

  if (variant === 'manager') {
    return (
      <>
        {manpowerSection}
        {monthlyCostSection}
        {legalNote}
      </>
    );
  }

  return (
    <>
      {sizingSection}
      {recommendedTierSection}
      {shardingSection}
    </>
  );
}

const EGRESS_DISPLAY_RATE = '0.09';
