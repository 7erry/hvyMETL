import { useMemo, useState } from 'react';
import { buildAtlasClusterCreateRequest, type HaClusterInputs } from '../../../../src/atlas/atlasClusterTopology.ts';
import { ATLAS_CLUSTER_CREATE_ACCEPT, ATLAS_CLUSTER_CREATE_ENDPOINT } from '../../../../src/atlas/atlasHaExport.ts';
import { buildAtlasClusterTerraformHcl } from '../../../../src/atlas/atlasClusterTerraform.ts';
import { validateAtlasClusterCreateRequest } from '../../../../src/atlas/atlasClusterValidate.ts';
import { downloadText } from '../../api';
import { CopyButton } from '../CopyButton';

type HaPayloadPreviewProps = {
  inputs: HaClusterInputs;
};

export function HaPayloadPreview({ inputs }: HaPayloadPreviewProps) {
  const [open, setOpen] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const payload = useMemo(() => buildAtlasClusterCreateRequest(inputs), [inputs]);
  const jsonPreview = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const terraform = useMemo(() => buildAtlasClusterTerraformHcl(payload), [payload]);

  const runValidate = () => {
    const result = validateAtlasClusterCreateRequest(payload);
    if (result.ok) {
      const warn = result.warnings.length ? ` Warnings: ${result.warnings.join(' ')}` : '';
      setValidationMessage(`Payload looks valid for Atlas Admin API.${warn}`);
    } else {
      setValidationMessage(result.errors.join(' '));
    }
  };

  const copyDeployCurl = async () => {
    const curl = [
      `curl --request POST \\`,
      `  --url "https://cloud.mongodb.com/api/atlas/v2/groups/{GROUP-ID}/clusters" \\`,
      `  --header "Content-Type: application/json" \\`,
      `  --header "Accept: ${ATLAS_CLUSTER_CREATE_ACCEPT}" \\`,
      `  --user "<ATLAS_PUBLIC_KEY>:<ATLAS_PRIVATE_KEY>" \\`,
      `  --data '${JSON.stringify(payload)}'`,
    ].join('\n');
    await navigator.clipboard.writeText(curl);
    setValidationMessage('Deploy curl copied — replace {GROUP-ID} and API keys before running.');
  };

  return (
    <details
      className="ha-payload-drawer panel-dropdown"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="panel-dropdown__summary">
        <span className="panel-dropdown__title">Generated REST / Terraform payload</span>
        <span className="panel-dropdown__hint">{payload.name}</span>
      </summary>
      <div className="panel-dropdown__body ha-payload-drawer__body">
        <p className="ha-payload-drawer__endpoint">
          <code>{ATLAS_CLUSTER_CREATE_ENDPOINT}</code>
        </p>
        <div className="ha-cluster-actions ha-payload-drawer__actions">
          <CopyButton label="Copy JSON payload" text={jsonPreview} />
          <button
            type="button"
            className="secondary"
            onClick={() => downloadText('atlas-cluster-create.json', jsonPreview, 'application/json')}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => downloadText('atlas-cluster.tf', terraform, 'text/plain')}
          >
            Export Terraform (.tf)
          </button>
          <button type="button" className="tertiary" onClick={runValidate}>
            Validate payload
          </button>
          <button type="button" className="primary" onClick={() => void copyDeployCurl()}>
            Copy deploy curl
          </button>
        </div>
        {validationMessage ? (
          <p className="ha-payload-drawer__validation" role="status">
            {validationMessage}
          </p>
        ) : null}
        <pre className="ha-assistant-json" aria-label="Atlas cluster create JSON">
          {jsonPreview}
        </pre>
      </div>
    </details>
  );
}
