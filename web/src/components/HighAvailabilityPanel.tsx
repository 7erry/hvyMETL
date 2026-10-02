import { useMemo } from 'react';
import {
  buildAtlasClusterCreateRequest,
  defaultHaClusterName,
  sanitizeAtlasClusterName,
  summarizeHaTopology,
  type AtlasCloudProvider,
  type HaClusterInputs,
  type HaElectableSize,
} from '../../../src/atlas/atlasClusterTopology.ts';
import { buildAtlasHaArtifactBundle } from '../../../src/atlas/atlasHaExport.ts';
import { ATLAS_CLUSTER_TIERS } from '../managerCostEstimate';
import { primaryRegionOptions } from '../ha/defaultHaClusterInputs';
import { downloadText } from '../api';
import { CollapsiblePanel } from './CollapsiblePanel';
import { CopyButton } from './CopyButton';

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
  const payload = useMemo(() => buildAtlasClusterCreateRequest(inputs), [inputs]);
  const summary = useMemo(() => summarizeHaTopology(inputs), [inputs]);
  const jsonPreview = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  const regionOptions = useMemo(() => primaryRegionOptions(inputs.provider), [inputs.provider]);

  const setProvider = (provider: AtlasCloudProvider) => {
    const regions = primaryRegionOptions(provider);
    onChange({
      ...inputs,
      provider,
      primaryRegion: regions.includes(inputs.primaryRegion) ? inputs.primaryRegion : regions[0] ?? inputs.primaryRegion,
    });
  };

  const setElectable = (electableNodeCount: HaElectableSize) => {
    onChange({
      ...inputs,
      electableNodeCount,
      clusterName: sanitizeAtlasClusterName(
        inputs.clusterName,
        defaultHaClusterName(electableNodeCount),
      ),
    });
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

      <div className="ha-cluster-controls">
        <label className="ha-cluster-field">
          <span className="ha-cluster-field__label">Cloud provider</span>
          <select value={inputs.provider} onChange={(e) => setProvider(e.target.value as AtlasCloudProvider)}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="ha-cluster-field">
          <legend className="ha-cluster-field__label">Electable nodes</legend>
          <div className="ha-cluster-radio-row">
            {ELECTABLE_SIZES.map((n) => (
              <label key={n} className="ha-cluster-radio">
                <input
                  type="radio"
                  name="ha-electable"
                  checked={inputs.electableNodeCount === n}
                  onChange={() => setElectable(n)}
                />
                {n}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="ha-cluster-field">
          <span className="ha-cluster-field__label">Primary region</span>
          <select
            value={inputs.primaryRegion}
            onChange={(e) => onChange({ ...inputs, primaryRegion: e.target.value })}
          >
            {regionOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="ha-cluster-field">
          <span className="ha-cluster-field__label">Instance size</span>
          <select
            value={inputs.instanceSize}
            onChange={(e) => onChange({ ...inputs, instanceSize: e.target.value })}
          >
            {ATLAS_CLUSTER_TIERS.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.label}
                {recommendedTierId === tier.id ? ' (recommended)' : ''}
              </option>
            ))}
          </select>
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
              <tr key={row.regionName}>
                <td>{row.regionName}</td>
                <td>{row.priority}</td>
                <td>{row.electable}</td>
                <td>{row.readOnly}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ha-cluster-actions">
        <CopyButton label="Copy JSON" text={jsonPreview} />
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
