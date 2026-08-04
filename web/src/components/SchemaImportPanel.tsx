import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccess } from '../auth/HostedAuthProvider';
import { fetchBuiltinExamples, type BuiltinExampleSummary } from '../api';
import { sortDialectsByLabel } from '../dialectConstants';
import { sidebarWidthForSchemaImportTextarea } from '../schemaImportSidebarSync';
import { detectDialect, DIALECT_DETECT_MIN_CONFIDENCE } from '../schema/detectDialect';
import { isSupportedDialect } from '../../../src/dialects.ts';
import type { Dialect } from '../types';

const DIALECT_DETECT_DEBOUNCE_MS = 280;

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
  /** When the DDL textarea is resized wider than the sidebar, expand the split pane. */
  onRequestSidebarWidth?: (widthPx: number) => void;
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
  onRequestSidebarWidth,
  compact = false,
  framed = true,
}: SchemaImportPanelProps) {
  const access = useAccess();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sidebarSyncRafRef = useRef<number | null>(null);
  const sortedDialects = useMemo(
    () => sortDialectsByLabel(dialects).filter((entry) => isSupportedDialect(entry.id)),
    [dialects],
  );
  const [autoDetectedLabel, setAutoDetectedLabel] = useState<string | null>(null);
  const dialectLockedByUserRef = useRef(false);
  const detectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runDialectDetection = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        dialectLockedByUserRef.current = false;
        setAutoDetectedLabel(null);
        return;
      }
      if (dialectLockedByUserRef.current) return;

      const result = detectDialect(text);
      if (!result.autoDetected || result.confidence < DIALECT_DETECT_MIN_CONFIDENCE) {
        setAutoDetectedLabel(null);
        return;
      }
      if (!isSupportedDialect(result.dialectId)) return;

      setAutoDetectedLabel(result.label);
      if (result.dialectId !== dialect) {
        onDialectChange(result.dialectId);
      }
    },
    [dialect, onDialectChange],
  );

  const scheduleDialectDetection = useCallback(
    (text: string) => {
      if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
      detectTimerRef.current = setTimeout(() => {
        detectTimerRef.current = null;
        runDialectDetection(text);
      }, DIALECT_DETECT_DEBOUNCE_MS);
    },
    [runDialectDetection],
  );

  useEffect(
    () => () => {
      if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    },
    [],
  );

  const handleDdlChange = useCallback(
    (value: string) => {
      onDdlChange(value);
      if (!value.trim()) {
        dialectLockedByUserRef.current = false;
        setAutoDetectedLabel(null);
        return;
      }
      scheduleDialectDetection(value);
    },
    [onDdlChange, scheduleDialectDetection],
  );

  const handleDialectSelect = useCallback(
    (value: string) => {
      dialectLockedByUserRef.current = true;
      setAutoDetectedLabel(null);
      onDialectChange(value);
    },
    [onDialectChange],
  );
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

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !onRequestSidebarWidth) return;

    const syncSidebarWidth = () => {
      if (sidebarSyncRafRef.current !== null) {
        cancelAnimationFrame(sidebarSyncRafRef.current);
      }
      sidebarSyncRafRef.current = requestAnimationFrame(() => {
        sidebarSyncRafRef.current = null;
        const needed = sidebarWidthForSchemaImportTextarea(textarea);
        if (needed === null) return;
        const sidebar = textarea.closest('.workspace-sidebar');
        if (!(sidebar instanceof HTMLElement)) return;
        const currentWidth = sidebar.getBoundingClientRect().width;
        if (needed > currentWidth + 2) {
          onRequestSidebarWidth(needed);
        }
      });
    };

    const observer = new ResizeObserver(syncSidebarWidth);
    observer.observe(textarea);
    return () => {
      observer.disconnect();
      if (sidebarSyncRafRef.current !== null) {
        cancelAnimationFrame(sidebarSyncRafRef.current);
      }
    };
  }, [onRequestSidebarWidth]);

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
      <div className="schema-import-panel__dialect-row">
        <select
          value={dialect}
          onChange={(e) => handleDialectSelect(e.target.value)}
          className="schema-import-panel__select"
          disabled={sortedDialects.length === 0}
          aria-describedby={autoDetectedLabel ? 'schema-dialect-auto-detected' : undefined}
        >
          {sortedDialects.length === 0 ? (
            <option value="">Loading dialects…</option>
          ) : (
            sortedDialects.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))
          )}
        </select>
        {autoDetectedLabel ? (
          <span className="schema-import-panel__auto-dialect" id="schema-dialect-auto-detected">
            Auto-detected: {autoDetectedLabel}
          </span>
        ) : null}
      </div>
      <textarea
        ref={textareaRef}
        value={ddl}
        onChange={(e) => handleDdlChange(e.target.value)}
        onPaste={() => {
          requestAnimationFrame(() => {
            const value = textareaRef.current?.value ?? ddl;
            runDialectDetection(value);
          });
        }}
        placeholder="Paste CREATE TABLE statements, JSON Schema, or CloudFormation YAML — dialect is detected automatically…"
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
              <a
                href="https://github.com/7erry/hvyMETL/tree/main/examples#example-domains-and-design-pattern-coverage"
                target="_blank"
                rel="noopener noreferrer"
              >
                Example domains and design-pattern coverage
              </a>
            </p>
          )}
        </div>
      ) : null}
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
