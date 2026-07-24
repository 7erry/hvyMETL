import type { SchemaPhase } from './SchemaPhaseToggle';

type MigrationWorkflowBarProps = {
  phase: SchemaPhase;
  onPhaseChange: (phase: SchemaPhase) => void;
  hasAfter: boolean;
  hasModel: boolean;
  designingPlan: boolean;
  exporting: boolean;
  onImportDdl: () => void;
  onExportMigration: () => void;
  onRunPipeline: () => void;
};

type WorkflowStepProps = {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  primary?: boolean;
  title?: string;
};

function WorkflowArrow() {
  return <span className="migration-workflow-bar__arrow" aria-hidden="true">→</span>;
}

function WorkflowStep({ label, onClick, active, disabled, loading, primary, title }: WorkflowStepProps) {
  return (
    <button
      type="button"
      className={[
        'migration-workflow-bar__step',
        active ? 'migration-workflow-bar__step--active' : '',
        primary ? 'migration-workflow-bar__step--primary' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-current={active ? 'step' : undefined}
    >
      {loading ? `${label}…` : label}
    </button>
  );
}

/** Linear migration steps: import → SQL view → MongoDB view → export → pipeline. */
export function MigrationWorkflowBar({
  phase,
  onPhaseChange,
  hasAfter,
  hasModel,
  designingPlan,
  exporting,
  onImportDdl,
  onExportMigration,
  onRunPipeline,
}: MigrationWorkflowBarProps) {
  return (
    <nav className="migration-workflow-bar" aria-label="Migration workflow">
      <WorkflowStep label="Import DDL" onClick={onImportDdl} />
      <WorkflowArrow />
      <WorkflowStep
        label="Before · SQL"
        onClick={() => onPhaseChange('before')}
        active={hasModel && phase === 'before'}
        disabled={!hasModel}
      />
      <WorkflowArrow />
      <WorkflowStep
        label="After · MongoDB"
        onClick={() => onPhaseChange('after')}
        active={hasModel && phase === 'after'}
        disabled={!hasModel}
        loading={designingPlan}
        title={hasAfter ? 'MongoDB collections from migration plan' : 'Generate a migration plan first'}
      />
      <WorkflowArrow />
      <WorkflowStep
        label={exporting ? 'Exporting…' : 'Export migration'}
        onClick={onExportMigration}
        disabled={!hasModel || exporting}
      />
      <WorkflowArrow />
      <WorkflowStep label="Run pipeline" onClick={onRunPipeline} disabled={!hasModel} primary />
    </nav>
  );
}
