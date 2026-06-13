export type SchemaPhase = 'before' | 'after';

type SchemaPhaseToggleProps = {
  phase: SchemaPhase;
  onChange: (phase: SchemaPhase) => void;
  hasAfter: boolean;
};

/** Switch between SQL source (before) and MongoDB target (after) diagram views. */
export function SchemaPhaseToggle({ phase, onChange, hasAfter }: SchemaPhaseToggleProps) {
  return (
    <div className="schema-phase-toggle" role="tablist" aria-label="Schema phase">
      <button
        type="button"
        role="tab"
        aria-selected={phase === 'before'}
        className={phase === 'before' ? 'active' : ''}
        onClick={() => onChange('before')}
      >
        Before · SQL
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={phase === 'after'}
        className={phase === 'after' ? 'active' : ''}
        onClick={() => onChange('after')}
        title={hasAfter ? 'MongoDB collections from migration plan' : 'Generate a migration plan first'}
      >
        After · MongoDB
      </button>
    </div>
  );
}
