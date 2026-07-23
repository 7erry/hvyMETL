import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccess } from '../auth/HostedAuthProvider';
import { fetchBuiltinExamples, type BuiltinExampleSummary } from '../api';
import { sortDialectsByLabel } from '../dialectConstants';
import type { Dialect } from '../types';

type SchemaImportPanelProps = {
  dialects: Dialect[];
  dialect: string;
  ddl: string;
  apiConnected: boolean;
  onDialectChange: (dialect: string) => void;
  onDdlChange: (ddl: string) => void;
  onImportQuery: () => void;
  onSchemaFile: (file: File) => void;
  onImportBuiltinExample?: (exampleId: string) => void | Promise<void>;
  compact?: boolean;
  framed?: boolean;
};

export function SchemaImportPanel({
  dialects,
  dialect,
  ddl,
  apiConnected,
  onDialectChange,
  onDdlChange,
  onImportQuery,
  onSchemaFile,
  onImportBuiltinExample,
  compact = false,
  framed = true,
}: SchemaImportPanelProps) {
  const access = useAccess();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sortedDialects = useMemo(() => sortDialectsByLabel(dialects), [dialects]);
  const [builtinExamples, setBuiltinExamples] = useState<BuiltinExampleSummary[]>([]);
  const [selectedExampleId, setSelectedExampleId] = useState('');
  const [loadingExamples, setLoadingExamples] = useState(false);
  const [loadingExample, setLoadingExample] = useState(false);

  useEffect(() => {
    if (!apiConnected || !onImportBuiltinExample) {
      setBuiltinExamples([]);
      setSelectedExampleId('');
      return;
    }

    let cancelled = false;
    setLoadingExamples(true);
    void fetchBuiltinExamples()
      .then(({ examples }) => {
        if (!cancelled) setBuiltinExamples(examples);
      })
      .catch(() => {
        if (!cancelled) setBuiltinExamples([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingExamples(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiConnected, onImportBuiltinExample]);

  const handleLoadExample = async () => {
    if (!selectedExampleId || !onImportBuiltinExample) return;
    setLoadingExample(true);
    try {
      await onImportBuiltinExample(selectedExampleId);
    } finally {
      setLoadingExample(false);
    }
  };

  const content = (
    <>
      {!apiConnected ? (
        <p className="schema-import-panel__warn">
          {access.enabled ? (
            <>
              API not reachable. Confirm you are signed in and the hvyMETL server at{' '}
              <code>{window.location.origin}</code> is running with matching Auth0 API settings.
            </>
          ) : access.serverAuthRequired ? (
            <>API not reachable. Sign in is required — reload after Auth0 web env vars are configured.</>
          ) : (
            <>
              API not reachable. From the repo root run <code>npm run dev:ui</code> and open{' '}
              <code>http://localhost:3847</code> (not the Vite port alone unless the API is running).
            </>
          )}
        </p>
      ) : null}
      <label className="schema-import-panel__label">Database dialect</label>
      <select
        value={dialect}
        onChange={(e) => onDialectChange(e.target.value)}
        className="schema-import-panel__select"
        disabled={sortedDialects.length === 0}
      >
        {sortedDialects.length === 0 ? (
          <option value="">Loading dialects…</option>
        ) : (
          sortedDialects.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
              {!d.live ? ' (DDL paste)' : ''}
            </option>
          ))
        )}
      </select>
      <textarea
        value={ddl}
        onChange={(e) => onDdlChange(e.target.value)}
        placeholder="Paste CREATE TABLE statements or a full DDL script…"
        rows={compact ? 6 : 8}
        className="schema-import-panel__textarea"
      />
      <div className="button-row schema-import-panel__actions">
        <button type="button" className="primary" onClick={onImportQuery} disabled={!apiConnected}>
          Import DDL
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={!apiConnected}
        >
          Upload file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".sql,.ddl,.txt,.db,.sqlite,.sqlite3"
          className="schema-import-panel__file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onSchemaFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {onImportBuiltinExample ? (
        <div className="schema-import-panel__examples">
          <label className="schema-import-panel__label" htmlFor="builtin-example-select">
            Built-in example
          </label>
          <div className="schema-import-panel__example-row">
            <select
              id="builtin-example-select"
              value={selectedExampleId}
              onChange={(e) => setSelectedExampleId(e.target.value)}
              className="schema-import-panel__select"
              disabled={!apiConnected || loadingExamples || builtinExamples.length === 0}
            >
              <option value="">
                {loadingExamples
                  ? 'Loading examples…'
                  : builtinExamples.length === 0
                    ? 'No examples on server'
                    : 'Choose an example…'}
              </option>
              {builtinExamples.map((example) => (
                <option key={example.id} value={example.id}>
                  {example.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="secondary"
              onClick={() => void handleLoadExample()}
              disabled={!apiConnected || !selectedExampleId || loadingExample}
            >
              {loadingExample ? 'Loading…' : 'Load example'}
            </button>
          </div>
          {selectedExampleId ? (
            <p className="schema-import-panel__hint">
              {builtinExamples.find((example) => example.id === selectedExampleId)?.description ??
                'Loads DDL from the server examples folder.'}
            </p>
          ) : (
            <p className="schema-import-panel__hint">
              Examples are read from <code>~/hvymetl/examples</code> on the server (or the repo{' '}
              <code>examples/</code> folder locally).
            </p>
          )}
        </div>
      ) : null}
      <p className="schema-import-panel__hint">
        Use <code>.sql</code> / <code>.ddl</code> for scripts, or <code>.db</code> for SQLite uploads.
      </p>
    </>
  );

  if (!framed) {
    return <div className={`schema-import-panel${compact ? ' schema-import-panel--compact' : ''}`}>{content}</div>;
  }

  return (
    <div className={`panel schema-import-panel${compact ? ' schema-import-panel--compact' : ''}`}>
      <h3>Instant Schema Import</h3>
      {content}
    </div>
  );
}
