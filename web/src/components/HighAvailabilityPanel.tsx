import { useMemo } from 'react';
import {
  buildAtlasClusterCreateRequest,
  defaultHaClusterName,
  haRegionSlotLabels,
  sanitizeAtlasClusterName,
  summarizeHaTopology,
  type AtlasCloudProvider,
  type HaClusterInputs,
  type HaElectableSize,
} from '../../../src/atlas/atlasClusterTopology.ts';
import { buildAtlasHaArtifactBundle } from '../../../src/atlas/atlasHaExport.ts';
import { ATLAS_CLUSTER_TIERS } from '../managerCostEstimate';
import {
  patchHaElectableCount,
  patchHaProvider,
  patchHaRegionAtIndex,
  primaryRegionOptions,
} from '../ha/defaultHaClusterInputs';
import { downloadText } from '../api';
import { CollapsiblePanel } from './CollapsiblePanel';
import { HaEstimatedCostBadge } from './ha/HaEstimatedCostBadge';
import { HaPayloadPreview } from './ha/HaPayloadPreview';

type HighAvailabilityPanelProps = {
  inputs: HaClusterInputs;
  onChange: (next: HaClusterInputs) => void;
  recommendedTierId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenCopilotHa?: () => void;
};

const PROVIDERS: AtlasCloudProvider[] = ['AWS', 'GCP', 'AZURE'];
const ELECTABLE_SIZES: HaElectableSize[] = [3, 5, 7];

export function HighAvailabilityPanel({
  inputs,
  onChange,
  recommendedTierId,
  open,
  onOpenChange,
  onOpenCopilotHa,
}: HighAvailabilityPanelProps) {
  const summary = useMemo(() => summarizeHaTopology(inputs), [inputs]);
  const regionSlots = useMemo(() => haRegionSlotLabels(inputs.electableNodeCount), [inputs.electableNodeCount]);
  const regionOptions = useMemo(() => primaryRegionOptions(inputs.provider), [inputs.provider]);
  const regionNames = inputs.regionNames ?? summary.regions.map((r) => r.regionName);

  const setElectable = (electableNodeCount: HaElectableSize) => {
    onChange(
      patchHaElectableCount(
        {
          ...inputs,
          clusterName: sanitizeAtlasClusterName(inputs.clusterName, defaultHaClusterName(electableNodeCount)),
        },
        electableNodeCount,
      ),
    );
  };

  const handleDownloadHaPack = () => {
    const bundle = buildAtlasHaArtifactBundle(inputs);
    downloadText('atlas-ha-provisioning-guide.md', bundle.provisioningGuideMd, 'text/markdown');
    downloadText('atlas-cluster-create.json', bundle.clusterCreateJson, 'application/json');
  };

  return (
    <CollapsiblePanel title="High Availability" open={open} onOpenChange={onOpenChange}>
      <p className="ha-cluster-intro">
        Multi-region Atlas replica set topology for Admin API provisioning. Electable layout: 3 → 2+1, 5 → 2+2+1, 7 →
        3+2+2 on your selected cloud provider.
      </p>

      <HaEstimatedCostBadge inputs={inputs} recommendedTierId={recommendedTierId} />

      <div className="ha-cluster-controls">
        <label className="ha-cluster-field">
          <span className="ha-cluster-field__label">Cloud provider</span>
          <select
            value={inputs.provider}
            onChange={(e) => onChange(patchHaProvider(inputs, e.target.value as AtlasCloudProvider))}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <div className="ha-cluster-field">
          <span className="ha-cluster-field__label">Electable nodes</span>
          <div className="ha-segmented" role="group" aria-label="Electable node count">
            {ELECTABLE_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                className={inputs.electableNodeCount === n ? 'ha-segmented__btn active' : 'ha-segmented__btn'}
                aria-pressed={inputs.electableNodeCount === n}
                onClick={() => setElectable(n)}
              >
                {n} nodes
              </button>
            ))}
          </div>
        </div>

        {regionSlots.map((slot) => {
          const label =
            slot.role === 'primary'
              ? `Primary region (${slot.electableNodes} node${slot.electableNodes === 1 ? '' : 's'})`
              : `Secondary region ${slot.index} (${slot.electableNodes} node${slot.electableNodes === 1 ? '' : 's'})`;
          return (
            <label key={slot.index} className="ha-cluster-field">
              <span className="ha-cluster-field__label">{label}</span>
              <select
                value={regionNames[slot.index] ?? regionOptions[0]}
                onChange={(e) => onChange(patchHaRegionAtIndex(inputs, slot.index, e.target.value))}
              >
                {regionOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          );
        })}

        <label className="ha-cluster-field">
          <span className="ha-cluster-field__label">Instance size</span>
          <select
            value={inputs.instanceSize}
            onChange={(e) =>
              onChange({
                ...inputs,
                instanceSize: e.target.value,
                instanceSizeLocked: true,
              })
            }
          >
            {ATLAS_CLUSTER_TIERS.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.label}
                {recommendedTierId === tier.id ? ' (recommended)' : ''}
              </option>
            ))}
          </select>
          {recommendedTierId && recommendedTierId !== inputs.instanceSize ? (
            <button
              type="button"
              className="tertiary ha-cluster-use-recommended"
              onClick={() =>
                onChange({
                  ...inputs,
                  instanceSize: recommendedTierId,
                  instanceSizeLocked: false,
                })
              }
            >
              Use recommended {recommendedTierId}
            </button>
          ) : null}
        </label>

        <label className="ha-cluster-field">
          <span className="ha-cluster-field__label">Read-only replicas per region</span>
          <input
            type="number"
            min={0}
            max={5}
            value={inputs.readOnlyReplicasPerRegion}
            onChange={(e) =>
              onChange({
                ...inputs,
                readOnlyReplicasPerRegion: Math.max(0, Math.min(5, Number(e.target.value) || 0)),
              })
            }
          />
        </label>

        <label className="ha-cluster-field">
          <span className="ha-cluster-field__label">Cluster name</span>
          <input
            type="text"
            value={inputs.clusterName}
            onChange={(e) => onChange({ ...inputs, clusterName: e.target.value })}
          />
        </label>
      </div>

      <div className="ha-cluster-table-wrap">
        <table className="ha-cluster-table">
          <thead>
            <tr>
              <th scope="col">Region</th>
              <th scope="col">Priority</th>
              <th scope="col">Electable</th>
              <th scope="col">Read-only</th>
            </tr>
          </thead>
          <tbody>
            {summary.regions.map((row) => (
              <tr key={`${row.regionName}-${row.priority}`}>
                <td>{row.regionName}</td>
                <td>{row.priority}</td>
                <td>{row.electable}</td>
                <td>{row.readOnly}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <HaPayloadPreview inputs={inputs} />

      <div className="ha-cluster-actions">
        <button type="button" className="secondary" onClick={handleDownloadHaPack}>
          Download HA pack
        </button>
        {onOpenCopilotHa ? (
          <button type="button" className="tertiary" onClick={onOpenCopilotHa}>
            Open in Copilot
          </button>
        ) : null}
      </div>
    </CollapsiblePanel>
  );
}
