import { useState, type FormEvent } from 'react';

type LiveConnectionEngine = 'mongodb' | 'postgresql' | 'mysql';

type LiveMongoImportFormProps = {
  disabled: boolean;
  /** Studio status line. The import dialog covers that line, so the form repeats live-import messages. */
  status?: string;
  onImport: (uri: string, database: string) => void | Promise<void>;
};

type LiveConnectionHint = {
  placeholder: string;
  hint: string;
};

function liveEngineFromSelect(value: string): LiveConnectionEngine {
  switch (value) {
    case 'postgresql':
    case 'mysql':
    case 'mongodb':
      return value;
    default:
      return 'mongodb';
  }
}

/** Placeholder and helper text for the connection string the user is about to type. */
export function liveConnectionHint(engine: LiveConnectionEngine): LiveConnectionHint {
  switch (engine) {
    case 'mongodb':
      return {
        placeholder: 'mongodb://localhost:27017/shop',
        hint: 'Use mongodb:// or mongodb+srv://. The database can be the path, or the field below.',
      };
    case 'postgresql':
      return {
        placeholder: 'postgresql://localhost:5432/shop',
        hint: 'Use postgresql://user:password@host:5432/database. Add ?schema=name when it is not public.',
      };
    case 'mysql':
      return {
        placeholder: 'mysql://localhost:3306/shop',
        hint: 'Use mysql://user:password@host:3306/database.',
      };
    default: {
      const unexpected: never = engine;
      return unexpected;
    }
  }
}

/** Apple silicon build attached to the GitHub release. Other platforms are not in this file yet. */
export const LIVE_AGENT_FILE = 'hvymetl-agent-macos-aarch64';

export const LIVE_AGENT_DOWNLOAD_URL = `https://github.com/7erry/hvyMETL/releases/download/v7.6.0/${LIVE_AGENT_FILE}`;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Command the hosted page prints after the user downloads the agent. */
export function liveAgentRunCommand(token: string, uri: string, database: string): string {
  const databaseFlag = database ? ` --database ${shellQuote(database)}` : '';
  return `chmod +x ${LIVE_AGENT_FILE} && ./${LIVE_AGENT_FILE} --token ${token} --uri ${shellQuote(uri)}${databaseFlag}`;
}

/** Messages that belong next to this form. Other studio status stays in the footer. */
export function liveImportFormNotice(status: string): string {
  if (
    status.startsWith('Reading the live database') ||
    status.startsWith('Import failed') ||
    status.startsWith('On the computer with the database')
  ) {
    return status;
  }
  return '';
}

/** URI form for sampling a MongoDB, PostgreSQL, or MySQL database from the studio server. */
export function LiveMongoImportForm({ disabled, status = '', onImport }: LiveMongoImportFormProps) {
  const [engine, setEngine] = useState<LiveConnectionEngine>('mongodb');
  const [uri, setUri] = useState('');
  const [database, setDatabase] = useState('');
  const [busy, setBusy] = useState(false);
  const connection = liveConnectionHint(engine);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    void Promise.resolve(onImport(uri.trim(), database.trim())).finally(() => setBusy(false));
  };

  const notice = liveImportFormNotice(status) || (busy ? 'Reading the live database…' : '');

  return (
    <form className="live-mongo-import" onSubmit={submit}>
      <div className="live-mongo-import__agent">
        <p className="pipeline-hint">
          hvymetl.studio cannot open a database on your computer. Download the agent, click Import live data, then run the command shown here on the computer that has the database.
        </p>
        <a className="live-mongo-import__download" href={LIVE_AGENT_DOWNLOAD_URL}>
          Download macOS agent (Apple silicon)
        </a>
      </div>
      <label className="schema-import-panel__label">
        Database type
        <select
          value={engine}
          onChange={(event) => setEngine(liveEngineFromSelect(event.target.value))}
          className="schema-import-panel__select"
        >
          <option value="mongodb">MongoDB</option>
          <option value="postgresql">PostgreSQL</option>
          <option value="mysql">MySQL</option>
        </select>
      </label>
      <label className="schema-import-panel__label">
        Connection URI
        <input
          value={uri}
          onChange={(event) => setUri(event.target.value)}
          placeholder={connection.placeholder}
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>
      <p className="schema-import-panel__hint">{connection.hint}</p>
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
      {notice ? (
        <p className="live-mongo-import__status" role="status">
          {notice}
        </p>
      ) : null}
      <div className="button-row">
        <button type="submit" className="primary" disabled={disabled || busy}>
          {busy ? 'Reading…' : 'Import live data'}
        </button>
      </div>
    </form>
  );
}
