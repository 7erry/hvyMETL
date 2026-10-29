import type { ReactNode } from 'react';
import type { DiagramViewMode } from '../diagramViewMode';
import { useT } from '../i18n/LocaleContext';

type DiagramViewSelectorProps = {
  mode: DiagramViewMode;
  onChange: (mode: DiagramViewMode) => void;
  disabled?: boolean;
};

function SplitHorizontalIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
      <rect x="1" y="1" width="16" height="5.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1" y="7.5" width="16" height="5.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SplitVerticalIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
      <rect x="1" y="1" width="7" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="10" y="1" width="7" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

type SegmentProps = {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
};

function Segment({ active, label, title, onClick, disabled, icon }: SegmentProps) {
  return (
    <button
      type="button"
      className={['diagram-view-selector__segment', active ? 'diagram-view-selector__segment--active' : '']
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
    >
      {icon ?? label}
      {icon ? <span className="diagram-view-selector__sr">{label}</span> : null}
    </button>
  );
}

/** Segmented control: stacked split, side-by-side split, SQL-only, MongoDB-only. */
export function DiagramViewSelector({ mode, onChange, disabled }: DiagramViewSelectorProps) {
  const t = useT();
  return (
    <div className="diagram-view-selector" role="group" aria-label={t('view.aria')}>
      <span className="diagram-view-selector__label">{t('view.label')}</span>
      <div className="diagram-view-selector__track">
        <Segment
          active={mode === 'split-horizontal'}
          label={t('view.stacked')}
          title={t('view.stackedTitle')}
          onClick={() => onChange('split-horizontal')}
          disabled={disabled}
          icon={<SplitHorizontalIcon />}
        />
        <Segment
          active={mode === 'split-vertical'}
          label={t('view.sideBySide')}
          title={t('view.sideBySideTitle')}
          onClick={() => onChange('split-vertical')}
          disabled={disabled}
          icon={<SplitVerticalIcon />}
        />
        <Segment
          active={mode === 'rel'}
          label="REL"
          title={t('view.relTitle')}
          onClick={() => onChange('rel')}
          disabled={disabled}
        />
        <Segment
          active={mode === 'mdb'}
          label="MDB"
          title={t('view.mdbTitle')}
          onClick={() => onChange('mdb')}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
