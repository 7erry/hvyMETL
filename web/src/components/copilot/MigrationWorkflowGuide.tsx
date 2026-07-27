import { useCopilot } from '../../copilot/CopilotContext';
import {
  MIGRATION_WORKFLOW_STEPS,
  type CopilotAction,
} from '../../copilot/copilotActionLinks';

type WorkflowActionButtonProps = {
  label: string;
  action: CopilotAction;
  disabled: boolean;
  onRun: (action: CopilotAction) => void;
};

/** Clickable button that runs one migration workflow step via the copilot action runner. */
function WorkflowActionButton({ label, action, disabled, onRun }: WorkflowActionButtonProps) {
  return (
    <button
      type="button"
      className="copilot-action-link"
      disabled={disabled}
      onClick={() => onRun(action)}
    >
      {label}
    </button>
  );
}

/** Static migration workflow guide with native action buttons (always clickable). */
export function MigrationWorkflowGuide() {
  const copilot = useCopilot();
  const disabled = copilot.status !== 'idle';
  const firstStep = MIGRATION_WORKFLOW_STEPS[0];

  return (
    <div className="copilot-message__body copilot-message__body--markdown">
      <h2 className="copilot-md-h2">Migration workflow</h2>
      <p className="copilot-md-p">Follow these steps in order (click to run each step):</p>
      <ol className="copilot-workflow-guide">
        {MIGRATION_WORKFLOW_STEPS.map((step) => (
          <li key={step.label}>
            <WorkflowActionButton
              label={step.label}
              action={step.action}
              disabled={disabled}
              onRun={copilot.runCopilotAction}
            />
            {' — '}
            {step.description}
          </li>
        ))}
      </ol>
      <p className="copilot-md-p">
        Start with{' '}
        <WorkflowActionButton
          label={firstStep.label}
          action={firstStep.action}
          disabled={disabled}
          onRun={copilot.runCopilotAction}
        />
        .
      </p>
    </div>
  );
}
