import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react';
import Editor from 'react-simple-code-editor';
import { describeApiError, fetchMongoshStatus, runMongoshScript, type MongoshRunResult, type MongoshStatus } from '../api';
import {
  applyMongoShellCompletion,
  MONGO_SHELL_INTROSPECT_SCRIPT,
  mongoShellCompletionsFor,
  schemaContextFromIntrospect,
  type MongoShellCompletion,
  type MongoShellSchemaContext,
} from '../mongoShellCompletions';
import {
  databaseFromMongoUri,
  deleteMongoShellConnection,
  listMongoShellConnections,
  maskMongoShellUri,
  upsertMongoShellConnection,
  type MongoShellConnection,
} from '../mongoShellConnections';
import {
  buildCollectionReplicateScript,
  MONGO_SHELL_REPLICATE_TIMEOUT_MS,
} from '../mongoShellReplicate';
import {
  collectionNameFromScript,
  resolveShellResultDocuments,
  parseShellJsonOutput,
  scriptLooksLikeCollectionQuery,
} from '../mongoShellResultModel';
import {
  deleteMongoShellLibraryEntry,
  downloadMongoShellScript,
  downloadTextFile,
  exportMongoShellLibraryJson,
  importMongoShellLibraryJson,
  listMongoShellHistory,
  listMongoShellLibrary,
  pushMongoShellHistory,
  readMongoShellScriptFile,
  upsertMongoShellLibraryEntry,
  type MongoShellHistoryEntry,
  type MongoShellLibraryEntry,
} from '../mongoShellScriptIo';
import { highlightPrismCode } from '../prismHighlight';
import { MongoShellResultTree } from './MongoShellResultTree';
import { ResizableVerticalSplit } from './ResizableVerticalSplit';

type ShellResultTab = {
  id: string;
  title: string;
  kind: 'docs' | 'output';
  documents?: Record<string, unknown>[];
  result: MongoshRunResult;
  error?: string;
};

const MAX_RESULT_TABS = 24;

const SHELL_EDITOR_STYLE = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '0.82rem',
  lineHeight: '1.45',
  minHeight: '100%',
  outline: 0,
} as const;

function highlightShellScript(code: string): string {
  return highlightPrismCode(code, 'javascript');
}

const DEFAULT_SCRIPT = `// mongosh helpers like \`show collections\` work here
db.runCommand({ ping: 1 })
`;

function previewName(script: string): string {
  const line = script.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith('//')) ?? 'script';
  return line.trim().slice(0, 40) || 'script';
}

type FormState = {
  id?: string;
  name: string;
  uri: string;
};

export function MongoShellView(): ReactElement {
  const [connections, setConnections] = useState<MongoShellConnection[]>(() => listMongoShellConnections());
  const [selectedId, setSelectedId] = useState<string | null>(() => listMongoShellConnections()[0]?.id ?? null);
  const [form, setForm] = useState<FormState>({ name: '', uri: '' });
  const [editing, setEditing] = useState(false);
  const [dbName, setDbName] = useState(() => {
    const first = listMongoShellConnections()[0];
    return first ? (databaseFromMongoUri(first.uri) ?? '') : '';
  });
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [resultTabs, setResultTabs] = useState<ShellResultTab[]>([]);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [findLimit, setFindLimit] = useState(50);
  const [runError, setRunError] = useState('');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<MongoshStatus | null>(null);
  const [bottomHeight, setBottomHeight] = useState(420);
  const [suggestions, setSuggestions] = useState<MongoShellCompletion[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<MongoShellHistoryEntry[]>(() => listMongoShellHistory());
  const [library, setLibrary] = useState<MongoShellLibraryEntry[]>(() => listMongoShellLibrary());
  const [libraryProject, setLibraryProject] = useState('all');
  const [schema, setSchema] = useState<MongoShellSchemaContext | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [replicateOpen, setReplicateOpen] = useState(false);
  const [replicateSourceId, setReplicateSourceId] = useState<string | null>(null);
  const [replicateTargetId, setReplicateTargetId] = useState<string | null>(null);
  const [replicateSourceDb, setReplicateSourceDb] = useState('');
  const [replicateTargetDb, setReplicateTargetDb] = useState('');
  const [replicateSourceColl, setReplicateSourceColl] = useState('');
  const [replicateTargetColl, setReplicateTargetColl] = useState('');
  const [replicateBatchSize, setReplicateBatchSize] = useState(1000);
  const [replicateCollections, setReplicateCollections] = useState<string[]>([]);
  const [replicateCollectionsLoading, setReplicateCollectionsLoading] = useState(false);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);
  const libraryImportRef = useRef<HTMLInputElement>(null);
  const schemaRef = useRef<MongoShellSchemaContext | null>(null);
  schemaRef.current = schema;

  const activeResult = useMemo(
    () => resultTabs.find((t) => t.id === activeResultId) ?? null,
    [resultTabs, activeResultId],
  );

  useLayoutEffect(() => {
    const ta = editorWrapRef.current?.querySelector('textarea');
    editorRef.current = ta instanceof HTMLTextAreaElement ? ta : null;
  });

  const selected = useMemo(
    () => connections.find((c) => c.id === selectedId) ?? null,
    [connections, selectedId],
  );

  const selectConnection = useCallback((id: string | null) => {
    setSelectedId(id);
    setEditing(false);
    if (!id) return;
    const conn = listMongoShellConnections().find((c) => c.id === id);
    if (!conn) return;
    const fromUri = databaseFromMongoUri(conn.uri);
    if (fromUri) setDbName(fromUri);
  }, []);

  const refreshConnections = useCallback(() => {
    const next = listMongoShellConnections();
    setConnections(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchMongoshStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus({ available: false, error: describeApiError(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const closeSuggestions = () => {
    setSuggestions([]);
    setActiveSuggestion(0);
  };

  const refreshSuggestions = (nextScript: string, caret: number, force = false) => {
    const before = nextScript.slice(0, caret);
    const lineStart = Math.max(before.lastIndexOf('\n') + 1, 0);
    const lineBefore = before.slice(lineStart);
    const linePrefix = lineBefore.trimStart();
    const memberCtx = /db(?:\.\w+|\.getCollection\s*\(\s*['"][^'"]*['"]\s*\))+\.\w*$/.test(
      linePrefix.replace(/;?\s*$/, ''),
    );
    const opOrFieldCtx = /(?:\{|,|\[)\s*\$?[\w.]*$/.test(lineBefore);
    if (!force && !memberCtx && !opOrFieldCtx && linePrefix.length < 2) {
      closeSuggestions();
      return;
    }
    const hits = mongoShellCompletionsFor(nextScript, caret, schemaRef.current);
    if (!force && hits.length === 0) {
      closeSuggestions();
      return;
    }
    setSuggestions(hits);
    setActiveSuggestion(0);
  };

  const refreshSchema = useCallback(async () => {
    if (!selected?.uri.trim()) {
      setSchema(null);
      return;
    }
    setSchemaLoading(true);
    try {
      const next = await runMongoshScript({
        uri: selected.uri,
        script: MONGO_SHELL_INTROSPECT_SCRIPT,
        dbName: dbName.trim() || undefined,
      });
      if (!next.ok) {
        setRunError(
          next.stderr.trim() || 'Could not load collections for autocomplete.',
        );
        return;
      }
      const parsed = parseShellJsonOutput(next.stdout);
      setSchema(schemaContextFromIntrospect(parsed));
    } catch (error) {
      setRunError(describeApiError(error));
    } finally {
      setSchemaLoading(false);
    }
  }, [selected, dbName]);

  useEffect(() => {
    void refreshSchema();
  }, [refreshSchema]);

  const acceptSuggestion = (completion: MongoShellCompletion) => {
    const el = editorRef.current;
    const caret = el?.selectionStart ?? script.length;
    const next = applyMongoShellCompletion(script, caret, completion);
    setScript(next.script);
    closeSuggestions();
    requestAnimationFrame(() => {
      const field = editorRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(next.caret, next.caret);
    });
  };

  const startCreate = () => {
    setEditing(true);
    setForm({ name: '', uri: '' });
    setSelectedId(null);
  };

  const startEdit = () => {
    if (!selected) return;
    setEditing(true);
    setForm({ id: selected.id, name: selected.name, uri: selected.uri });
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm({ name: '', uri: '' });
  };

  const saveConnection = () => {
    try {
      const saved = upsertMongoShellConnection(form);
      refreshConnections();
      selectConnection(saved.id);
      setForm({ name: '', uri: '' });
      const fromUri = databaseFromMongoUri(saved.uri);
      if (fromUri) setDbName(fromUri);
      setRunError('');
    } catch (error) {
      setRunError(describeApiError(error));
    }
  };

  const removeConnection = () => {
    if (!selected) return;
    if (!window.confirm(`Delete connection "${selected.name}"?`)) return;
    deleteMongoShellConnection(selected.id);
    const next = refreshConnections();
    setSelectedId(next[0]?.id ?? null);
    setEditing(false);
  };

  const scriptToRun = useCallback(
    (mode: 'all' | 'selection' | 'toLine'): string => {
      const el = editorRef.current;
      if (mode === 'selection' && el) {
        const { selectionStart, selectionEnd, value } = el;
        if (selectionStart !== selectionEnd) {
          return value.slice(selectionStart, selectionEnd);
        }
      }
      if (mode === 'toLine' && el) {
        const caret = el.selectionStart;
        const nl = script.indexOf('\n', caret);
        return nl < 0 ? script : script.slice(0, nl);
      }
      return script;
    },
    [script],
  );

  const closeResultTab = (id: string) => {
    setResultTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      setActiveResultId((cur) => {
        if (cur !== id) return cur;
        return next[next.length - 1]?.id ?? null;
      });
      return next;
    });
  };

  const runBody = async (
    body: string,
    options?: {
      uri?: string;
      dbName?: string;
      timeoutMs?: number;
      historyScript?: string;
      resultTitle?: string;
    },
  ) => {
    const uri = (options?.uri ?? selected?.uri ?? '').trim();
    if (!uri) {
      setRunError('Select or save a connection with a MongoDB URI first.');
      return;
    }
    if (!body.trim()) {
      setRunError('Script is empty.');
      return;
    }
    setRunning(true);
    setRunError('');
    closeSuggestions();
    setHistoryOpen(false);
    try {
      const next = await runMongoshScript({
        uri,
        script: body,
        dbName: (options?.dbName ?? dbName).trim() || undefined,
        findLimit,
        timeoutMs: options?.timeoutMs,
      });
      pushMongoShellHistory(options?.historyScript ?? script);
      setHistory(listMongoShellHistory());
      const preferCollectionTab = scriptLooksLikeCollectionQuery(body);
      const docs = resolveShellResultDocuments(next.stdout, preferCollectionTab);
      const coll = collectionNameFromScript(body);
      const timeoutLabel =
        options?.timeoutMs && options.timeoutMs !== 30_000
          ? `${Math.round(options.timeoutMs / 60000)}m`
          : '30s';
      const err = !next.ok
        ? next.timedOut
          ? `mongosh timed out after ${timeoutLabel}.`
          : next.stderr.trim() || `mongosh exited with code ${next.exitCode ?? '?'}`
        : next.truncated
          ? 'Output truncated — showing complete documents that fit.'
          : undefined;
      // Collection finds (including empty / truncated) get a named docs tab, not "Shell result"
      const useDocsTab = preferCollectionTab || (docs !== null && docs.length > 0);
      const tab: ShellResultTab = useDocsTab
        ? {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title: options?.resultTitle ?? `${coll} (${docs?.length ?? 0})`,
            kind: 'docs',
            documents: docs ?? [],
            result: next,
            error: err,
          }
        : {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            title: options?.resultTitle ?? 'Shell result',
            kind: 'output',
            result: next,
            error: err,
          };
      // shortcut: drop oldest tabs past MAX_RESULT_TABS, upgrade if sessions need more
      setResultTabs((prev) => [...prev, tab].slice(-MAX_RESULT_TABS));
      setActiveResultId(tab.id);
      if (err) setRunError(err);
    } catch (error) {
      setRunError(describeApiError(error));
    } finally {
      setRunning(false);
    }
  };

  const run = async (mode: 'all' | 'selection' | 'toLine') => {
    const body = scriptToRun(mode);
    if (!body.trim()) {
      setRunError(
        mode === 'selection'
          ? 'Select script text to run, or use Run.'
          : mode === 'toLine'
            ? 'Nothing to run to the current line.'
            : 'Script is empty.',
      );
      return;
    }
    await runBody(body);
  };

  const openReplicatePanel = () => {
    const source = selected ?? connections[0] ?? null;
    const target =
      connections.find((c) => c.id !== source?.id) ?? source ?? null;
    setReplicateSourceId(source?.id ?? null);
    setReplicateTargetId(target?.id ?? null);
    setReplicateSourceDb(
      (source && databaseFromMongoUri(source.uri)) || dbName || '',
    );
    setReplicateTargetDb(
      (target && databaseFromMongoUri(target.uri)) ||
        (source && databaseFromMongoUri(source.uri)) ||
        dbName ||
        '',
    );
    const names =
      source && selected && source.id === selected.id
        ? (schema?.collections.map((c) => c.name) ?? [])
        : [];
    setReplicateCollections(names);
    setReplicateSourceColl(names[0] ?? '');
    setReplicateTargetColl(names[0] ?? '');
    setReplicateOpen(true);
    setRunError('');
  };

  const loadReplicateCollections = async () => {
    const source = connections.find((c) => c.id === replicateSourceId);
    if (!source?.uri.trim()) {
      setRunError('Pick a source connection with a MongoDB URI.');
      return;
    }
    if (!replicateSourceDb.trim()) {
      setRunError('Source database is required to list collections.');
      return;
    }
    setReplicateCollectionsLoading(true);
    setRunError('');
    try {
      const next = await runMongoshScript({
        uri: source.uri,
        script: MONGO_SHELL_INTROSPECT_SCRIPT,
        dbName: replicateSourceDb.trim(),
      });
      if (!next.ok) {
        setRunError(
          next.stderr.trim() || 'Could not load collections from the source.',
        );
        return;
      }
      const names =
        schemaContextFromIntrospect(parseShellJsonOutput(next.stdout)).collections.map(
          (c) => c.name,
        );
      setReplicateCollections(names);
      if (names.length === 0) {
        setRunError('No collections found in the source database.');
      } else if (!names.includes(replicateSourceColl)) {
        setReplicateSourceColl(names[0] ?? '');
        setReplicateTargetColl((prev) => prev || names[0] || '');
      }
    } catch (error) {
      setRunError(describeApiError(error));
    } finally {
      setReplicateCollectionsLoading(false);
    }
  };

  const buildReplicateScriptOrError = (): string | null => {
    const source = connections.find((c) => c.id === replicateSourceId);
    const target = connections.find((c) => c.id === replicateTargetId);
    if (!source?.uri.trim() || !target?.uri.trim()) {
      setRunError('Source and target connections are required.');
      return null;
    }
    try {
      return buildCollectionReplicateScript({
        targetUri: target.uri,
        sourceDb: replicateSourceDb,
        targetDb: replicateTargetDb,
        sourceCollection: replicateSourceColl,
        targetCollection: replicateTargetColl || replicateSourceColl,
        batchSize: replicateBatchSize,
      });
    } catch (error) {
      setRunError(describeApiError(error));
      return null;
    }
  };

  const insertReplicateScript = () => {
    const body = buildReplicateScriptOrError();
    if (!body) return;
    setScript(body);
    setRunError('');
  };

  const runReplicate = async () => {
    const source = connections.find((c) => c.id === replicateSourceId);
    const target = connections.find((c) => c.id === replicateTargetId);
    const body = buildReplicateScriptOrError();
    if (!body || !source || !target) return;
    const targetColl = replicateTargetColl.trim() || replicateSourceColl.trim();
    if (
      !window.confirm(
        `Copy ${replicateSourceDb}.${replicateSourceColl} → ${replicateTargetDb}.${targetColl}?\n\nSource: ${source.name}\nTarget: ${target.name}`,
      )
    ) {
      return;
    }
    setScript(body);
    if (source.id !== selectedId) {
      selectConnection(source.id);
      setDbName(replicateSourceDb.trim());
    }
    await runBody(body, {
      uri: source.uri,
      dbName: replicateSourceDb.trim(),
      timeoutMs: MONGO_SHELL_REPLICATE_TIMEOUT_MS,
      historyScript: body,
      resultTitle: `Replicate ${replicateSourceColl}`,
    });
  };

  const saveScript = () => {
    downloadMongoShellScript(script);
    pushMongoShellHistory(script);
    setHistory(listMongoShellHistory());
  };

  const saveToLibrary = () => {
    const name = window.prompt('Script name', previewName(script));
    if (!name?.trim()) return;
    const project = window.prompt('Project', libraryProject === 'all' ? 'default' : libraryProject);
    if (project == null) return;
    try {
      upsertMongoShellLibraryEntry({ name, project, script });
      setLibrary(listMongoShellLibrary());
      pushMongoShellHistory(script);
      setHistory(listMongoShellHistory());
    } catch (error) {
      setRunError(describeApiError(error));
    }
  };

  const loadScriptFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await readMongoShellScriptFile(file);
      setScript(text);
      pushMongoShellHistory(text);
      setHistory(listMongoShellHistory());
      setRunError('');
    } catch (error) {
      setRunError(describeApiError(error));
    }
  };

  const importLibraryFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await readMongoShellScriptFile(file);
      const n = importMongoShellLibraryJson(text);
      setLibrary(listMongoShellLibrary());
      setRunError('');
      window.alert(`Imported ${n} script(s) into the library.`);
    } catch (error) {
      setRunError(describeApiError(error));
    }
  };

  const projects = useMemo(() => {
    const set = new Set(library.map((e) => e.project));
    return ['all', ...Array.from(set).sort()];
  }, [library]);

  const visibleLibrary = useMemo(() => {
    if (libraryProject === 'all') return library;
    return library.filter((e) => e.project === libraryProject);
  }, [library, libraryProject]);

  const onEditorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveSuggestion((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveSuggestion((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        acceptSuggestion(suggestions[activeSuggestion] ?? suggestions[0]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSuggestions();
        return;
      }
    }

    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      const caret = event.currentTarget.selectionStart;
      const hits = mongoShellCompletionsFor(script, caret);
      if (hits.length === 1) {
        acceptSuggestion(hits[0]);
        return;
      }
      setSuggestions(hits);
      setActiveSuggestion(0);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === ' ') {
      event.preventDefault();
      refreshSuggestions(script, event.currentTarget.selectionStart, true);
    }
  };

  return (
    <div className="mongo-shell">
      <aside className="mongo-shell__connections" aria-label="MongoDB connections">
        <div className="mongo-shell__connections-header">
          <strong>Connections</strong>
          <button type="button" className="tertiary" onClick={startCreate}>
            Add
          </button>
        </div>

        {status && !status.available ? (
          <p className="mongo-shell__hint mongo-shell__hint--warn">
            {status.error ?? 'mongosh is not available on this server.'}
          </p>
        ) : status?.version ? (
          <p className="mongo-shell__hint">{status.version}</p>
        ) : null}

        <ul className="mongo-shell__list">
          {connections.length === 0 ? (
            <li className="mongo-shell__empty">No saved connections. Add a MongoDB URI.</li>
          ) : (
            connections.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={
                    selectedId === c.id ? 'mongo-shell__conn active' : 'mongo-shell__conn'
                  }
                  onClick={() => selectConnection(c.id)}
                >
                  <span className="mongo-shell__conn-name">{c.name}</span>
                  <span className="mongo-shell__conn-uri">{maskMongoShellUri(c.uri)}</span>
                </button>
              </li>
            ))
          )}
        </ul>

        {editing ? (
          <div className="mongo-shell__form">
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Atlas prod"
              />
            </label>
            <label>
              MongoDB URI
              <input
                value={form.uri}
                onChange={(e) => setForm((prev) => ({ ...prev, uri: e.target.value }))}
                placeholder="mongodb+srv://…"
                spellCheck={false}
              />
            </label>
            <div className="button-row">
              <button type="button" className="primary" onClick={saveConnection}>
                Save
              </button>
              <button type="button" className="secondary" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
            <p className="mongo-shell__hint">Stored only in this browser. Sent to the server when you Run.</p>
          </div>
        ) : selected ? (
          <div className="mongo-shell__form">
            <label>
              Database
              <input
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                placeholder="required for show collections"
                spellCheck={false}
              />
            </label>
            <p className="mongo-shell__hint">
              Empty Database → mongosh uses <code>test</code>. Autocomplete loads collections from this DB.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                disabled={schemaLoading}
                onClick={() => void refreshSchema()}
              >
                {schemaLoading ? 'Loading…' : 'Refresh schema'}
              </button>
              <button type="button" className="secondary" onClick={startEdit}>
                Edit
              </button>
              <button type="button" className="danger secondary" onClick={removeConnection}>
                Delete
              </button>
            </div>
            {schema ? (
              <p className="mongo-shell__hint">
                {schema.collections.length} collection
                {schema.collections.length === 1 ? '' : 's'}
                {schema.database ? ` in ${schema.database}` : ''} for autocomplete
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mongo-shell__library">
          <div className="mongo-shell__connections-header">
            <strong>Script library</strong>
            <button type="button" className="tertiary" onClick={saveToLibrary} disabled={!script.trim()}>
              Save
            </button>
          </div>
          <label className="mongo-shell__library-project">
            Project
            <select value={libraryProject} onChange={(e) => setLibraryProject(e.target.value)}>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p === 'all' ? 'All projects' : p}
                </option>
              ))}
            </select>
          </label>
          <ul className="mongo-shell__list mongo-shell__library-list">
            {visibleLibrary.length === 0 ? (
              <li className="mongo-shell__empty">No saved scripts. Save or import a library JSON.</li>
            ) : (
              visibleLibrary.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="mongo-shell__conn"
                    onClick={() => setScript(entry.script)}
                    title={entry.name}
                  >
                    <span className="mongo-shell__conn-name">{entry.name}</span>
                    <span className="mongo-shell__conn-uri">{entry.project}</span>
                  </button>
                  <button
                    type="button"
                    className="mongo-shell__library-delete"
                    aria-label={`Delete ${entry.name}`}
                    onClick={() => {
                      if (!window.confirm(`Delete "${entry.name}"?`)) return;
                      deleteMongoShellLibraryEntry(entry.id);
                      setLibrary(listMongoShellLibrary());
                    }}
                  >
                    ×
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="button-row mongo-shell__library-actions">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                downloadTextFile(
                  exportMongoShellLibraryJson(),
                  'mongosh-library.json',
                  'application/json',
                )
              }
            >
              Export
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => libraryImportRef.current?.click()}
            >
              Import
            </button>
            <input
              ref={libraryImportRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                void importLibraryFile(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
          </div>
          <p className="mongo-shell__hint">Library stays in this browser. Export JSON to share.</p>
        </div>
      </aside>

      <div className="mongo-shell__workspace">
        <ResizableVerticalSplit
          bottomHeight={bottomHeight}
          onBottomHeightChange={setBottomHeight}
          defaultBottomRatio={0.5}
          minTop={180}
          minBottom={140}
          top={
            <div className="mongo-shell__editor-pane">
              <div className="mongo-shell__toolbar">
                <div className="mongo-shell__toolbar-actions mongo-shell__run-bar">
                  <button
                    type="button"
                    className="mongo-shell__run-btn"
                    disabled={running || !selected}
                    onClick={() => void run('all')}
                    title="Run"
                  >
                    <span className="mongo-shell__run-icon" aria-hidden>
                      ▶
                    </span>
                    {running ? 'Running…' : 'Run'}
                  </button>
                  <button
                    type="button"
                    className="mongo-shell__tool-btn"
                    disabled={running || !selected}
                    onClick={() => void run('selection')}
                    title="Run selected text"
                  >
                    <span aria-hidden>{'</>'}</span> Run Selected
                  </button>
                  <button
                    type="button"
                    className="mongo-shell__tool-btn"
                    disabled={running || !selected}
                    onClick={() => void run('toLine')}
                    title="Run from start through the current line"
                  >
                    <span aria-hidden>↓</span> Run to Line
                  </button>
                  <button
                    type="button"
                    className="mongo-shell__tool-btn"
                    disabled={running || connections.length === 0}
                    aria-expanded={replicateOpen}
                    onClick={() => {
                      if (replicateOpen) setReplicateOpen(false);
                      else openReplicatePanel();
                    }}
                    title="Copy a collection between two saved connections"
                  >
                    Replicate collection
                  </button>
                  <button
                    type="button"
                    className="mongo-shell__save-btn"
                    disabled={!script.trim()}
                    onClick={saveScript}
                    title="Download script as .js"
                  >
                    Save Script
                  </button>
                  <button
                    type="button"
                    className="mongo-shell__tool-btn"
                    disabled={!script.trim()}
                    onClick={saveToLibrary}
                    title="Save to script library"
                  >
                    Save to Library
                  </button>
                  <button
                    type="button"
                    className="mongo-shell__tool-btn"
                    onClick={() => loadInputRef.current?.click()}
                    title="Load script from file"
                  >
                    Load Script
                  </button>
                  <input
                    ref={loadInputRef}
                    type="file"
                    accept=".js,.mjs,.cjs,.mongodb,.txt,text/javascript,text/plain"
                    hidden
                    onChange={(e) => {
                      void loadScriptFile(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                  <div className="mongo-shell__history-wrap">
                    <button
                      type="button"
                      className="mongo-shell__tool-btn mongo-shell__history-btn"
                      aria-expanded={historyOpen}
                      aria-haspopup="listbox"
                      title="Recent scripts"
                      onClick={() => {
                        setHistory(listMongoShellHistory());
                        setHistoryOpen((o) => !o);
                      }}
                    >
                      <span aria-hidden>↺</span>
                    </button>
                    {historyOpen ? (
                      <ul className="mongo-shell__history" role="listbox" aria-label="Recent scripts">
                        {history.length === 0 ? (
                          <li className="mongo-shell__history-empty">No recent scripts</li>
                        ) : (
                          history.map((entry) => (
                            <li key={entry.id}>
                              <button
                                type="button"
                                role="option"
                                onClick={() => {
                                  setScript(entry.script);
                                  setHistoryOpen(false);
                                }}
                              >
                                {entry.preview}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    ) : null}
                  </div>
                </div>
                <span className="mongo-shell__toolbar-title">
                  {selected ? selected.name : 'Shell'}
                </span>
              </div>
              {replicateOpen ? (
                <div className="mongo-shell__replicate" aria-label="Replicate collection">
                  <div className="mongo-shell__replicate-grid">
                    <label>
                      Source connection
                      <select
                        value={replicateSourceId ?? ''}
                        onChange={(e) => {
                          const id = e.target.value || null;
                          setReplicateSourceId(id);
                          const conn = connections.find((c) => c.id === id);
                          const fromUri = conn ? databaseFromMongoUri(conn.uri) : undefined;
                          if (fromUri) setReplicateSourceDb(fromUri);
                          setReplicateCollections([]);
                          setReplicateSourceColl('');
                        }}
                      >
                        {connections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Source database
                      <input
                        value={replicateSourceDb}
                        onChange={(e) => {
                          setReplicateSourceDb(e.target.value);
                          setReplicateCollections([]);
                        }}
                        spellCheck={false}
                      />
                    </label>
                    <label>
                      Source collection
                      <select
                        value={replicateSourceColl}
                        onChange={(e) => {
                          const name = e.target.value;
                          setReplicateSourceColl(name);
                          setReplicateTargetColl((prev) => prev || name);
                        }}
                        disabled={replicateCollections.length === 0}
                      >
                        {replicateCollections.length === 0 ? (
                          <option value="">Load collections…</option>
                        ) : (
                          replicateCollections.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    <label>
                      Target connection
                      <select
                        value={replicateTargetId ?? ''}
                        onChange={(e) => {
                          const id = e.target.value || null;
                          setReplicateTargetId(id);
                          const conn = connections.find((c) => c.id === id);
                          const fromUri = conn ? databaseFromMongoUri(conn.uri) : undefined;
                          if (fromUri) setReplicateTargetDb(fromUri);
                        }}
                      >
                        {connections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Target database
                      <input
                        value={replicateTargetDb}
                        onChange={(e) => setReplicateTargetDb(e.target.value)}
                        spellCheck={false}
                      />
                    </label>
                    <label>
                      Target collection
                      <input
                        value={replicateTargetColl}
                        onChange={(e) => setReplicateTargetColl(e.target.value)}
                        placeholder={replicateSourceColl || 'same as source'}
                        spellCheck={false}
                      />
                    </label>
                    <label>
                      Batch size
                      <input
                        type="number"
                        min={1}
                        step={100}
                        value={replicateBatchSize}
                        onChange={(e) =>
                          setReplicateBatchSize(Math.max(1, Number(e.target.value) || 1000))
                        }
                      />
                    </label>
                  </div>
                  <p className="mongo-shell__hint">
                    Save two connections first. Loads collection names from the source DB, then
                    inserts a batched <code>find</code> → <code>insertMany</code> script (15m
                    timeout when run from here).
                  </p>
                  <div className="button-row">
                    <button
                      type="button"
                      className="secondary"
                      disabled={running || replicateCollectionsLoading || !replicateSourceId}
                      onClick={() => void loadReplicateCollections()}
                    >
                      {replicateCollectionsLoading ? 'Loading…' : 'Load collections'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={running || !replicateSourceColl}
                      onClick={insertReplicateScript}
                    >
                      Insert script
                    </button>
                    <button
                      type="button"
                      className="primary"
                      disabled={running || !replicateSourceColl || !replicateTargetId}
                      onClick={() => void runReplicate()}
                    >
                      {running ? 'Replicating…' : 'Run replicate'}
                    </button>
                    <button type="button" className="tertiary" onClick={() => setReplicateOpen(false)}>
                      Close
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="mongo-shell__editor-wrap" ref={editorWrapRef}>
                <Editor
                  value={script}
                  onValueChange={(next) => {
                    setScript(next);
                    requestAnimationFrame(() => {
                      refreshSuggestions(next, editorRef.current?.selectionStart ?? next.length);
                    });
                  }}
                  highlight={highlightShellScript}
                  onKeyDown={onEditorKeyDown}
                  onBlur={() => {
                    // Delay so suggestion click can fire first
                    window.setTimeout(() => closeSuggestions(), 120);
                  }}
                  padding={12}
                  tabSize={2}
                  insertSpaces
                  className="mongo-shell__editor"
                  preClassName="mongo-shell__editor-pre language-javascript"
                  textareaClassName="mongo-shell__editor-textarea"
                  textareaId="mongo-shell-script"
                  aria-label="mongosh script"
                  style={SHELL_EDITOR_STYLE}
                />
                {suggestions.length > 0 ? (
                  <ul className="mongo-shell__completions" role="listbox" aria-label="Completions">
                    {suggestions.map((item, index) => (
                      <li key={item.label}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === activeSuggestion}
                          className={
                            index === activeSuggestion
                              ? 'mongo-shell__completion active'
                              : 'mongo-shell__completion'
                          }
                          onMouseDown={(e) => {
                            e.preventDefault();
                            acceptSuggestion(item);
                          }}
                        >
                          <span className="mongo-shell__completion-label">{item.label}</span>
                          {item.detail ? (
                            <span className="mongo-shell__completion-detail">{item.detail}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <p className="mongo-shell__hint mongo-shell__editor-hint">
                Tab / ⌘Space: collections, methods, fields, operators. Refresh schema after DB changes.
              </p>
            </div>
          }
          bottom={
            <div className="mongo-shell__results-pane">
              <div className="mongo-shell__result-tabs" role="tablist" aria-label="Shell results">
                {resultTabs.length === 0 ? (
                  <span className="mongo-shell__result-tab mongo-shell__result-tab--empty">
                    Shell result
                  </span>
                ) : (
                  resultTabs.map((tab) => (
                    <div
                      key={tab.id}
                      className={
                        tab.id === activeResultId
                          ? 'mongo-shell__result-tab-wrap active'
                          : 'mongo-shell__result-tab-wrap'
                      }
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab.id === activeResultId}
                        className={
                          tab.id === activeResultId
                            ? 'mongo-shell__result-tab active'
                            : 'mongo-shell__result-tab'
                        }
                        onClick={() => {
                          setActiveResultId(tab.id);
                          setRunError(tab.error ?? '');
                        }}
                      >
                        {tab.title}
                      </button>
                      <button
                        type="button"
                        className="mongo-shell__result-tab-close"
                        aria-label={`Close ${tab.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          closeResultTab(tab.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
              {runError ? <p className="mongo-shell__hint mongo-shell__hint--warn">{runError}</p> : null}
              {activeResult?.kind === 'docs' && activeResult.documents ? (
                <MongoShellResultTree documents={activeResult.documents} />
              ) : (
                <pre className="mongo-shell__output">
                  {activeResult
                    ? [activeResult.result.stdout, activeResult.result.stderr]
                        .filter(Boolean)
                        .join('\n') || '(no output)'
                    : 'Run a script to see mongosh output here. Each run opens a new tab.'}
                </pre>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
