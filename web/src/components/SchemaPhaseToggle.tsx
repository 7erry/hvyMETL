import { useT } from '../i18n/LocaleContext';

export type SchemaPhase = 'before' | 'after';

type SchemaPhaseToggleProps = {
  phase: SchemaPhase;
  onChange: (phase: SchemaPhase) => void;
  hasAfter: boolean;
};

/** Switch between SQL source (before) and MongoDB target (after) diagram views. */
export function SchemaPhaseToggle({ phase, onChange, hasAfter }: SchemaPhaseToggleProps) {
  const t = useT();
  return (
    <div className="schema-phase-toggle" role="tablist" aria-label={t('phase.aria')}>
      <button
        type="button"
        role="tab"
        aria-selected={phase === 'before'}
        className={phase === 'before' ? 'active' : ''}
        onClick={() => onChange('before')}
      >
        {t('workflow.beforeSql')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={phase === 'after'}
        className={phase === 'after' ? 'active' : ''}
        onClick={() => onChange('after')}
        title={hasAfter ? t('workflow.afterTitleReady') : t('workflow.afterTitleNeedPlan')}
      >
        {t('workflow.afterMongo')}
      </button>
    </div>
  );
}
