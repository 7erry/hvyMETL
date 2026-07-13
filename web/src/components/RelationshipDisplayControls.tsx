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

/** On-canvas controls for FK line style and labels. */
export function RelationshipDisplayControls({
  connectionType,
  relationshipNotation,
  onConnectionTypeChange,
  onRelationshipNotationChange,
  onAutoLayout,
  compact = false,
}: RelationshipDisplayControlsProps) {
  return (
    <div className={`schema-canvas-toolbar${compact ? ' schema-canvas-toolbar--compact' : ''}`}>
      <span className="schema-canvas-toolbar__title">Relationships</span>
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
  );
}
