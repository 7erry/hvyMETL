import { useState, type FormEvent } from 'react';

type LiveMongoImportFormProps = {
  disabled: boolean;
  onImport: (uri: string, database: string) => void;
};

/** URI form for sampling a MongoDB database from the studio server. */
export function LiveMongoImportForm({ disabled, onImport }: LiveMongoImportFormProps) {
  const [open, setOpen] = useState(false);
  const [uri, setUri] = useState('');
  const [database, setDatabase] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onImport(uri.trim(), database.trim());
  };

  if (!open) {
    return (
      <button type="button" className="secondary" onClick={() => setOpen(true)} disabled={disabled}>
        Import live data
      </button>
    );
  }

  return (
    <form className="live-mongo-import" onSubmit={submit}>
      <p className="pipeline-hint">
        MongoDB, PostgreSQL, or MySQL. The studio server connects. The hosted website cannot reach a database on your computer.
      </p>
      <label className="schema-import-panel__label">
        Connection URI
        <input
          value={uri}
          onChange={(event) => setUri(event.target.value)}
          placeholder="mongodb://localhost:27017/shop"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>
      <label className="schema-import-panel__label">
        Database
        <input
          value={database}
          onChange={(event) => setDatabase(event.target.value)}
          placeholder="Uses the database in the URI when empty"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="button-row">
        <button type="submit" className="primary" disabled={disabled}>
          Import live data
        </button>
        <button type="button" className="tertiary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
