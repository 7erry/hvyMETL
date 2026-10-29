import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useAccess } from '../auth/HostedAuthProvider';
import { fetchBuiltinExamples, type BuiltinExampleSummary } from '../api';
import { useT } from '../i18n/LocaleContext';
import { sidebarWidthForSchemaImportTextarea } from '../schemaImportSidebarSync';
import { detectDialect, DIALECT_DETECT_MIN_CONFIDENCE } from '../schema/detectDialect';
import { isSupportedDialect } from '../../../src/dialects.ts';
import { validateMongoJsonPaste } from '../../../src/utilities/mongoJsonValidate.ts';
import type { Dialect } from '../types';
import { LiveMongoImportForm } from './LiveMongoImportForm';

const DIALECT_DETECT_DEBOUNCE_MS = 280;

type SchemaImportPanelProps = {
  dialects: Dialect[];
  dialect: string;
  ddl: string;
  apiConnected: boolean;
  onDialectChange: (dialect: string) => void;
  onDdlChange: (ddl: string) => void;
  onImportQuery: () => void;
  onImportLive: (uri: string, database: string, platform: string) => void | Promise<string | void>;
  /** Repeated inside the live-import form because a modal covers the page status line. */
  status?: string;
  onSchemaFiles: (files: File[]) => void;
  onImportBuiltinExample?: (exampleId: string) => void | Promise<void>;
  /** When the DDL textarea is resized wider than the sidebar, expand the split pane. */
  onRequestSidebarWidth?: (widthPx: number) => void;
  compact?: boolean;
  framed?: boolean;
};

export function SchemaImportPanel({
  dialects: _dialects,
  dialect,
  ddl,
  apiConnected,
  onDialectChange,
  onDdlChange,
  onImportQuery,
  onImportLive,
  status,
  onSchemaFiles,
  onImportBuiltinExample,
  onRequestSidebarWidth,
  compact = false,
  framed = true,
}: SchemaImportPanelProps) {
  const t = useT();
  const access = useAccess();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sidebarSyncRafRef = useRef<number | null>(null);
  const dragDepthRef = useRef(0);
  const [autoDetectedLabel, setAutoDetectedLabel] = useState<string | null>(null);
  const detectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runDialectDetection = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setAutoDetectedLabel(null);
        return;
      }

      const result = detectDialect(text);
      if (!isSupportedDialect(result.dialectId)) return;

      const highConfidence =
        result.autoDetected && result.confidence >= DIALECT_DETECT_MIN_CONFIDENCE;
      setAutoDetectedLabel(highConfidence ? result.label : null);

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
        setAutoDetectedLabel(null);
        return;
      }
      scheduleDialectDetection(value);
    },
    [onDdlChange, scheduleDialectDetection],
  );

  const [builtinExamples, setBuiltinExamples] = useState<BuiltinExampleSummary[]>([]);
  const [selectedExampleId, setSelectedExampleId] = useState('');
  const [loadingExamples, setLoadingExamples] = useState(false);
  const [loadingExample, setLoadingExample] = useState(false);
  const [importMode, setImportMode] = useState<'schema' | 'live'>('schema');
  const [dragOver, setDragOver] = useState(false);

  const takeDroppedFiles = useCallback(
    (list: FileList | null | undefined) => {
      const files = list ? Array.from(list) : [];
      if (files.length === 0) return;
      onSchemaFiles(files);
    },
    [onSchemaFiles],
  );

  const onSchemaDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setDragOver(true);
  }, []);

  const onSchemaDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onSchemaDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  }, []);

  const onSchemaDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setDragOver(false);
      takeDroppedFiles(event.dataTransfer.files);
    },
    [takeDroppedFiles],
  );

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

  const mongoJsonError = dialect === 'mongodb-json' ? validateMongoJsonPaste(ddl) : null;

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

      {onImportBuiltinExample ? (
        <div className="schema-import-panel__examples">
          <label className="schema-import-panel__label" htmlFor="builtin-example-select">
            Try with a sample schema
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
              {loadingExample ? t('common.loading') : t('schema.loadExample')}
            </button>
          </div>
          {selectedExampleId ? (
            <p className="schema-import-panel__hint">
              {builtinExamples.find((example) => example.id === selectedExampleId)?.description ??
                'Loads DDL from the server examples folder.'}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="schema-import-tabs" role="tablist" aria-label="Schema source">
        <button
          type="button"
          role="tab"
          id="schema-import-tab-schema"
          aria-selected={importMode === 'schema'}
          aria-controls="schema-import-panel-schema"
          className={importMode === 'schema' ? 'active' : ''}
          onClick={() => setImportMode('schema')}
        >
          {t('schema.title')}
        </button>
        <button
          type="button"
          role="tab"
          id="schema-import-tab-live"
          aria-selected={importMode === 'live'}
          aria-controls="schema-import-panel-live"
          className={importMode === 'live' ? 'active' : ''}
          onClick={() => setImportMode('live')}
        >
          {t('schema.liveTitle')}
        </button>
      </div>

      {importMode === 'schema' ? (
        <div
          id="schema-import-panel-schema"
          role="tabpanel"
          aria-labelledby="schema-import-tab-schema"
          className={`schema-import-panel__dropzone${dragOver ? ' schema-import-panel__dropzone--active' : ''}`}
          onDragEnter={onSchemaDragEnter}
          onDragOver={onSchemaDragOver}
          onDragLeave={onSchemaDragLeave}
          onDrop={onSchemaDrop}
        >
          <div className="schema-import-panel__editor-bar">
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
              multiple
              accept=".sql,.ddl,.txt,.json,.ndjson,.yaml,.yml,.csv,.db,.sqlite,.sqlite3"
              className="schema-import-panel__file-input"
              onChange={(e) => {
                takeDroppedFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          <p className="schema-import-panel__hint" aria-live="polite">
            {dragOver
              ? t('schema.dropHint')
              : autoDetectedLabel
                ? `${t('schema.detected')}: ${autoDetectedLabel}.`
                : t('schema.pasteHint')}
          </p>
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
            placeholder="Paste CREATE TABLE DDL, JSON Schema, MongoDB JSON, NDJSON, CloudFormation YAML — or drop CSV files…"
            rows={compact ? 6 : 8}
            className={`schema-import-panel__textarea${dragOver ? ' schema-import-panel__textarea--drop' : ''}`}
          />
          {mongoJsonError ? <p className="schema-import-panel__warn">{mongoJsonError}</p> : null}
          <div className="button-row schema-import-panel__actions">
            <button type="button" className="primary" onClick={onImportQuery} disabled={!apiConnected}>
              {t('schema.import')}
            </button>
          </div>
        </div>
      ) : (
        <div id="schema-import-panel-live" role="tabpanel" aria-labelledby="schema-import-tab-live">
          <LiveMongoImportForm disabled={!apiConnected} status={status} onImport={onImportLive} />
        </div>
      )}
    </>
  );

  if (!framed) {
    return <div className={`schema-import-panel${compact ? ' schema-import-panel--compact' : ''}`}>{content}</div>;
  }

  return (
    <div className={`panel schema-import-panel${compact ? ' schema-import-panel--compact' : ''}`}>
      <h3>{t('schema.title')}</h3>
      {content}
    </div>
  );
}
