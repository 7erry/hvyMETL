import type { ReactNode } from 'react';
import type { DiagramViewMode } from '../diagramViewMode';

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
  return (
    <div className="diagram-view-selector" role="group" aria-label="Diagram view">
      <span className="diagram-view-selector__label">View</span>
      <div className="diagram-view-selector__track">
        <Segment
          active={mode === 'split-horizontal'}
          label="Stacked split"
          title="SQL on top, MongoDB below"
          onClick={() => onChange('split-horizontal')}
          disabled={disabled}
          icon={<SplitHorizontalIcon />}
        />
        <Segment
          active={mode === 'split-vertical'}
          label="Side-by-side split"
          title="SQL on the left, MongoDB on the right"
          onClick={() => onChange('split-vertical')}
          disabled={disabled}
          icon={<SplitVerticalIcon />}
        />
        <Segment
          active={mode === 'rel'}
          label="REL"
          title="Before · SQL (relational source schema)"
          onClick={() => onChange('rel')}
          disabled={disabled}
        />
        <Segment
          active={mode === 'mdb'}
          label="MDB"
          title="After · MongoDB (migration plan)"
          onClick={() => onChange('mdb')}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
