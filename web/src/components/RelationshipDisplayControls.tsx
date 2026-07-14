import { useMemo, useState } from 'react';
import {
  RELATIONSHIP_CONNECTION_OPTIONS,
  RELATIONSHIP_NOTATION_OPTIONS,
  type RelationshipConnectionType,
  type RelationshipNotation,
} from '../relationshipDisplay';

type RelationshipDisplayControlsProps = {
  connectionType: RelationshipConnectionType;
  relationshipNotation: RelationshipNotation;
  onConnectionTypeChange: (type: RelationshipConnectionType) => void;
  onRelationshipNotationChange: (notation: RelationshipNotation) => void;
  onAutoLayout?: () => void;
  compact?: boolean;
};

function optionLabel<T extends string>(
  options: { id: T; label: string }[],
  id: T,
): string {
  return options.find((option) => option.id === id)?.label ?? id;
}

/** On-canvas controls for FK line style and labels. */
export function RelationshipDisplayControls({
  connectionType,
  relationshipNotation,
  onConnectionTypeChange,
  onRelationshipNotationChange,
  onAutoLayout,
  compact = false,
}: RelationshipDisplayControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const collapsedHint = useMemo(() => {
    const connection = optionLabel(RELATIONSHIP_CONNECTION_OPTIONS, connectionType);
    const notation = optionLabel(RELATIONSHIP_NOTATION_OPTIONS, relationshipNotation);
    return `${connection} · ${notation}`;
  }, [connectionType, relationshipNotation]);

  return (
    <details
      className={`schema-canvas-toolbar schema-canvas-toolbar--collapsible${compact ? ' schema-canvas-toolbar--compact' : ''}`}
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="schema-canvas-toolbar__summary">
        <span className="schema-canvas-toolbar__title">Relationships</span>
        {!isOpen ? <span className="schema-canvas-toolbar__hint">{collapsedHint}</span> : null}
      </summary>
      <div className="schema-canvas-toolbar__body">
        {onAutoLayout ? (
          <button type="button" className="secondary schema-canvas-toolbar__layout" onClick={onAutoLayout}>
            Auto-layout
          </button>
        ) : null}
        <label className="schema-canvas-toolbar__field">
          <span>Connection style</span>
          <select
            value={connectionType}
            onChange={(e) => onConnectionTypeChange(e.target.value as RelationshipConnectionType)}
            aria-label="Relationship connection style"
          >
            {RELATIONSHIP_CONNECTION_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="schema-canvas-toolbar__field">
          <span>Labels</span>
          <select
            value={relationshipNotation}
            onChange={(e) => onRelationshipNotationChange(e.target.value as RelationshipNotation)}
            aria-label="Relationship label notation"
          >
            {RELATIONSHIP_NOTATION_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </details>
  );
}
