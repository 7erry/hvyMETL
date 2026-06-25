import type { ManagerMilestone } from '../managerDashboard';

type ManagerStatusBarProps = {
  milestone: ManagerMilestone;
  statusMessage?: string;
};

export function ManagerStatusBar({ milestone, statusMessage }: ManagerStatusBarProps) {
  const steps = Array.from({ length: milestone.totalSteps }, (_, i) => i + 1);

  return (
    <footer className="manager-status-bar">
      <div className="manager-status-bar__milestones">
        {steps.map((step) => (
          <span
            key={step}
            className={[
              'manager-milestone-step',
              step < milestone.step ? 'done' : '',
              step === milestone.step ? 'active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-hidden
          />
        ))}
      </div>
      <div className="manager-status-bar__text">
        <strong>
          Step {milestone.step} of {milestone.totalSteps}: {milestone.phaseLabel}
        </strong>
        <span>{milestone.detail}</span>
        {milestone.etaHint ? <span className="manager-status-bar__eta">{milestone.etaHint}</span> : null}
      </div>
      {statusMessage ? <span className="manager-status-bar__status">{statusMessage}</span> : null}
    </footer>
  );
}
