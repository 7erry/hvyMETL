import { useHaAssistant } from '../../ha/HaAssistantContext';
import { HaEstimatedCostBadge } from './HaEstimatedCostBadge';
import { HaPayloadPreview } from './HaPayloadPreview';

const QUICK_ACTIONS = [
  {
    id: 'quorum5' as const,
    label: 'Use 5-node quorum layout',
    hint: '2+2+1 electable across three regions on your provider.',
  },
  {
    id: 'readReplicas' as const,
    label: 'Add read-only per region',
    hint: 'Sets one read-only replica in each electable region.',
  },
];

type HaAssistantPanelProps = {
  recommendedTierId?: string;
};

export function HaAssistantPanel({ recommendedTierId }: HaAssistantPanelProps) {
  const ha = useHaAssistant();

  return (
    <div className="agent-copilot-sidebar__body agent-copilot-sidebar__body--ha">
      <div className="ha-assistant-banner">
        <strong>High Availability</strong>
        <span className="ha-assistant-banner__meta">
          {ha.summary.clusterName} · {ha.summary.provider} · {ha.summary.electableNodes} electable
        </span>
      </div>

      <HaEstimatedCostBadge inputs={ha.inputs} recommendedTierId={recommendedTierId} />

      <p className="agent-copilot-sidebar__empty">
        Topology matches the Developer sidebar. Adjust controls there or use quick actions below.
      </p>

      <div className="ha-assistant-quick">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className="secondary ha-assistant-quick__btn"
            onClick={() => ha.applyQuickPrompt(action.id)}
            title={action.hint}
          >
            {action.label}
          </button>
        ))}
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
            {ha.summary.regions.map((row) => (
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

      <HaPayloadPreview inputs={ha.inputs} />
    </div>
  );
}
