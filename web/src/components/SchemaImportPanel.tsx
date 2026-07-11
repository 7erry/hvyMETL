import { useRef } from 'react';
import { useAccess } from '../auth/HostedAuthProvider';
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
  compact = false,
  framed = true,
}: SchemaImportPanelProps) {
  const access = useAccess();
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        disabled={dialects.length === 0}
      >
        {dialects.length === 0 ? (
          <option value="">Loading dialects…</option>
        ) : (
          dialects.map((d) => (
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
      <div className="button-row">
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
          hidden
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onSchemaFile(file);
            e.target.value = '';
          }}
        />
      </div>
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
