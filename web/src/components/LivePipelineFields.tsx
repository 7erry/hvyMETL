type LivePipelineFieldsProps = {
  uri: string;
  database: string;
  disabled: boolean;
  onChange: (next: { uri: string; database: string }) => void;
};

/** Connection fields for one pipeline run. The values stay in this form. */
export function LivePipelineFields({ uri, database, disabled, onChange }: LivePipelineFieldsProps) {
  return (
    <div className="pipeline-card">
      <p className="pipeline-hint">
        Up to 1,000 rows per SQL table, or 50 documents per MongoDB collection. This connection string is not saved.
      </p>
      <label>
        Connection URI
        <input
          value={uri}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          placeholder="postgresql://localhost:5432/shop"
          onChange={(event) => onChange({ uri: event.target.value, database })}
        />
      </label>
      <label>
        Database
        <input
          value={database}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          placeholder="Uses the database in the URI when empty"
          onChange={(event) => onChange({ uri, database: event.target.value })}
        />
      </label>
    </div>
  );
}
