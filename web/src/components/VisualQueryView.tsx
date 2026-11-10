import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import Editor from 'react-simple-code-editor';
import {
  newId,
  type MatchCompareOp,
  type MatchLogic,
  type MatchNode,
} from '../aggregation/types';
import { describeApiError, runMongoshScript } from '../api';
import { useT } from '../i18n/LocaleContext';
import {
  MONGO_SHELL_LIST_DATABASES_SCRIPT,
  mongoShellListCollectionsScript,
} from '../mongoShellCompletions';
import {
  databaseFromMongoUri,
  listMongoShellConnections,
  type MongoShellConnection,
} from '../mongoShellConnections';
import {
  collectionNamesFromShellOutput,
  databaseNamesFromShellOutput,
} from '../mongoShellReplicate';
import { resolveShellResultDocuments } from '../mongoShellResultModel';
import { highlightPrismCode } from '../prismHighlight';
import {
  buildFindScript,
  compileFindQuery,
  findStateToJsonText,
  formatFindAsShell,
} from '../visualQuery/compileFind';
import {
  createProjectionRow,
  createSortRow,
  defaultFindQueryState,
  type FindQueryState,
  type ProjectionRow,
  type SortRow,
} from '../visualQuery/types';
import { MongoShellResultTree } from './MongoShellResultTree';

const COMPARE_OPS: MatchCompareOp[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin'];
const LOGICS: MatchLogic[] = ['and', 'or', 'nor'];

const EDITOR_STYLE = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '0.82rem',
  lineHeight: '1.45',
  minHeight: '12rem',
  outline: 0,
} as const;

function highlightJson(code: string): string {
  return highlightPrismCode(code, 'json');
}

function updateMatchNode(root: MatchNode, id: string, patch: Partial<MatchNode>): MatchNode {
  if (root.id === id) {
    return { ...root, ...patch } as MatchNode;
  }
  if (root.kind !== 'group') return root;
  return {
    ...root,
    children: root.children.map((child) => updateMatchNode(child, id, patch)),
  };
}

function removeMatchNode(root: MatchNode, id: string): MatchNode {
  if (root.kind !== 'group') return root;
  return {
    ...root,
    children: root.children
      .filter((child) => child.id !== id)
      .map((child) => removeMatchNode(child, id)),
  };
}

function addMatchChild(root: MatchNode, groupId: string, child: MatchNode): MatchNode {
  if (root.kind === 'group' && root.id === groupId) {
    return { ...root, children: [...root.children, child] };
  }
  if (root.kind !== 'group') return root;
  return {
    ...root,
    children: root.children.map((c) => addMatchChild(c, groupId, child)),
  };
}

function MatchTreeEditor({
  node,
  onChange,
}: {
  node: MatchNode;
  onChange: (next: MatchNode) => void;
}): ReactElement {
  if (node.kind === 'group') {
    return (
      <div className="agg-match-group">
        <div className="agg-match-group__header">
          <span>Group</span>
          <select
            value={node.logic}
            aria-label="Match group logic"
            onChange={(e) =>
              onChange(updateMatchNode(node, node.id, { logic: e.target.value as MatchLogic }))
            }
          >
            {LOGICS.map((logic) => (
              <option key={logic} value={logic}>
                {logic.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="agg-match-group__body">
          {node.children.map((child) => (
            <div key={child.id} className="agg-match-row-wrap">
              <MatchTreeEditor
                node={child}
                onChange={(nextChild) => {
                  onChange({
                    ...node,
                    children: node.children.map((c) => (c.id === nextChild.id ? nextChild : c)),
                  });
                }}
              />
              <button
                type="button"
                className="agg-icon-btn"
                aria-label="Remove expression"
                onClick={() => onChange(removeMatchNode(node, child.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="agg-match-group__actions">
          <button
            type="button"
            className="tertiary"
            onClick={() =>
              onChange(
                addMatchChild(node, node.id, {
                  id: newId(),
                  kind: 'group',
                  logic: 'and',
                  children: [],
                }),
              )
            }
          >
            + Group
          </button>
          <button
            type="button"
            className="tertiary"
            onClick={() =>
              onChange(
                addMatchChild(node, node.id, {
                  id: newId(),
                  kind: 'expr',
                  field: '',
                  op: 'eq',
                  value: '',
                }),
              )
            }
          >
            + Expression
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="agg-match-expr">
      <input
        value={node.field}
        placeholder="field"
        aria-label="Field"
        onChange={(e) => onChange({ ...node, field: e.target.value })}
      />
      <select
        value={node.op}
        aria-label="Operator"
        onChange={(e) => onChange({ ...node, op: e.target.value as MatchCompareOp })}
      >
        {COMPARE_OPS.map((op) => (
          <option key={op} value={op}>
            {op === 'eq' ? 'equals' : op}
          </option>
        ))}
      </select>
      <input
        value={node.value}
        placeholder="value"
        aria-label="Value"
        onChange={(e) => onChange({ ...node, value: e.target.value })}
      />
    </div>
  );
}

export function VisualQueryView(): ReactElement {
  const t = useT();
  const [connections, setConnections] = useState<MongoShellConnection[]>(() =>
    listMongoShellConnections(),
  );
  const [connectionId, setConnectionId] = useState(() => listMongoShellConnections()[0]?.id ?? '');
  const [databases, setDatabases] = useState<string[]>([]);
  const [collections, setCollections] = useState<string[]>([]);
  const [database, setDatabase] = useState('');
  const [collection, setCollection] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [query, setQuery] = useState<FindQueryState>(() => defaultFindQueryState());
  const [runDocs, setRunDocs] = useState<Record<string, unknown>[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const selectedConnection = connections.find((c) => c.id === connectionId) ?? null;
  const canRun = Boolean(
    selectedConnection?.uri.trim() && database.trim() && collection.trim(),
  );

  const compiled = useMemo(() => compileFindQuery(query), [query]);
  const generatedShell = useMemo(() => {
    if (!compiled.ok) return compiled.error;
    return formatFindAsShell(collection || 'collection', compiled.compiled);
  }, [collection, compiled]);

  const refreshConnections = useCallback(() => {
    const next = listMongoShellConnections();
    setConnections(next);
    setConnectionId((prev) => (next.some((c) => c.id === prev) ? prev : (next[0]?.id ?? '')));
  }, []);

  useEffect(() => {
    refreshConnections();
  }, [refreshConnections]);

  const databaseRef = useRef(database);
  databaseRef.current = database;

  const fetchCollectionNames = useCallback(
    async (uri: string, sourceDbName: string): Promise<{ names: string[]; stdout: string }> => {
      const dbName = sourceDbName.trim();
      if (!dbName) return { names: [], stdout: '' };
      const next = await runMongoshScript({
        uri,
        script: mongoShellListCollectionsScript(dbName),
        dbName,
      });
      if (!next.ok) {
        throw new Error(
          next.stderr.trim() ||
            next.stdout.trim() ||
            `Could not list collections in "${dbName}".`,
        );
      }
      return {
        names: collectionNamesFromShellOutput(next.stdout),
        stdout: next.stdout,
      };
    },
    [],
  );

  const applyCollectionNames = useCallback((dbName: string, names: string[], stdout: string): void => {
    setCollections(names);
    setCollection((prev) => (prev && names.includes(prev) ? prev : (names[0] ?? '')));
    if (names.length === 0) {
      const preview = stdout.trim().slice(0, 240);
      setRunError(
        preview
          ? `No collections parsed for "${dbName}". mongosh said: ${preview}`
          : `No collections found in database "${dbName}".`,
      );
      return;
    }
    setRunError(null);
  }, []);

  const selectedUri = selectedConnection?.uri.trim() ?? '';

  useEffect(() => {
    if (!selectedUri) {
      setDatabases([]);
      setCollections([]);
      setDatabase('');
      setCollection('');
      return;
    }
    let cancelled = false;
    setCatalogLoading(true);
    void (async () => {
      try {
        const dbResult = await runMongoshScript({
          uri: selectedUri,
          script: MONGO_SHELL_LIST_DATABASES_SCRIPT,
        });
        if (cancelled) return;
        if (!dbResult.ok) {
          setRunError(
            dbResult.stderr.trim() ||
              dbResult.stdout.trim() ||
              'Could not list databases from this connection.',
          );
          setDatabases([]);
          setCollections([]);
          setCollection('');
          return;
        }
        const dbNames = databaseNamesFromShellOutput(dbResult.stdout);
        setDatabases(dbNames);
        if (dbNames.length === 0) {
          setCollections([]);
          setCollection('');
          setDatabase('');
          setRunError(
            dbResult.stdout.trim()
              ? 'Could not parse database names from mongosh output.'
              : 'No databases found on this connection.',
          );
          return;
        }
        const uriDb = databaseFromMongoUri(selectedUri) || '';
        const prev = databaseRef.current.trim();
        const nextDb =
          prev && dbNames.includes(prev)
            ? prev
            : uriDb && dbNames.includes(uriDb)
              ? uriDb
              : dbNames[0]!;
        setDatabase(nextDb);
        const { names, stdout } = await fetchCollectionNames(selectedUri, nextDb);
        if (cancelled) return;
        applyCollectionNames(nextDb, names, stdout);
      } catch (err) {
        if (!cancelled) {
          setRunError(describeApiError(err));
          setCollections([]);
          setCollection('');
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCollectionNames, connectionId, fetchCollectionNames, selectedUri]);

  const onDatabaseChange = useCallback(
    (nextDb: string): void => {
      setDatabase(nextDb);
      setCollections([]);
      setCollection('');
      if (!selectedUri || !nextDb.trim()) return;
      setCatalogLoading(true);
      setRunError(null);
      void (async () => {
        try {
          const { names, stdout } = await fetchCollectionNames(selectedUri, nextDb);
          applyCollectionNames(nextDb, names, stdout);
        } catch (err) {
          setRunError(describeApiError(err));
          setCollections([]);
          setCollection('');
        } finally {
          setCatalogLoading(false);
        }
      })();
    },
    [applyCollectionNames, fetchCollectionNames, selectedUri],
  );

  const patchQuery = useCallback((patch: Partial<FindQueryState>) => {
    setQuery((prev) => ({ ...prev, ...patch }));
  }, []);

  const setEditMode = useCallback((mode: FindQueryState['editMode']) => {
    setQuery((prev) => {
      if (mode === 'json' && prev.editMode === 'form') {
        return { ...prev, editMode: 'json', jsonText: findStateToJsonText(prev) };
      }
      return { ...prev, editMode: mode };
    });
  }, []);

  const updateProjection = useCallback((id: string, patch: Partial<ProjectionRow>) => {
    setQuery((prev) => ({
      ...prev,
      projection: prev.projection.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  }, []);

  const updateSort = useCallback((id: string, patch: Partial<SortRow>) => {
    setQuery((prev) => ({
      ...prev,
      sort: prev.sort.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  }, []);

  const resetQuery = useCallback(() => {
    setQuery(defaultFindQueryState());
    setRunDocs(null);
    setRunError(null);
  }, []);

  const runLive = useCallback(async () => {
    if (!selectedConnection?.uri.trim() || !database.trim() || !collection.trim()) {
      setRunError(t('query.selectTarget'));
      setRunDocs(null);
      return;
    }
    const next = compileFindQuery(query);
    if (!next.ok) {
      setRunError(next.error);
      setRunDocs(null);
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const script = buildFindScript(database, collection, next.compiled);
      const result = await runMongoshScript({
        uri: selectedConnection.uri,
        script,
        dbName: database.trim(),
      });
      if (!result.ok) {
        setRunError(
          result.timedOut
            ? 'mongosh timed out after 30s.'
            : result.stderr.trim() ||
                result.stdout.trim() ||
                `mongosh exited with code ${result.exitCode ?? '?'}`,
        );
        setRunDocs(null);
        return;
      }
      setRunDocs(resolveShellResultDocuments(result.stdout, true) ?? []);
    } catch (err) {
      setRunError(describeApiError(err));
      setRunDocs(null);
    } finally {
      setRunning(false);
    }
  }, [collection, database, query, selectedConnection, t]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F5') {
        event.preventDefault();
        void runLive();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runLive]);

  return (
    <div className="vq-builder">
      <div className="vq-builder__topbar">
        <div className="vq-builder__target">
          <label className="vq-builder__field">
            <span>{t('query.connection')}</span>
            <select
              value={connectionId}
              aria-label={t('query.connection')}
              onChange={(e) => setConnectionId(e.target.value)}
            >
              {connections.length === 0 ? (
                <option value="">{t('query.noConnections')}</option>
              ) : (
                connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.id}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="vq-builder__field">
            <span>{t('query.database')}</span>
            <select
              value={database}
              aria-label={t('query.database')}
              disabled={!selectedUri || catalogLoading}
              onChange={(e) => onDatabaseChange(e.target.value)}
            >
              {databases.length === 0 ? (
                <option value="">{catalogLoading ? '…' : t('query.noDatabases')}</option>
              ) : (
                databases.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="vq-builder__field">
            <span>{t('query.collection')}</span>
            <select
              value={collection}
              aria-label={t('query.collection')}
              disabled={!database || catalogLoading}
              onChange={(e) => setCollection(e.target.value)}
            >
              {collections.length === 0 ? (
                <option value="">{catalogLoading ? '…' : t('query.noCollections')}</option>
              ) : (
                collections.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
        <strong className="vq-builder__title">{t('query.title')}</strong>
        <button
          type="button"
          className="primary vq-builder__run"
          disabled={running || !canRun}
          onClick={() => void runLive()}
        >
          {running ? '…' : `${t('query.run')} (F5)`}
        </button>
      </div>

      <div className="vq-builder__main">
        <section className="vq-builder__results" aria-label={t('query.results')}>
          <div className="vq-builder__results-head">
            <h2>{t('query.results')}</h2>
            {runDocs ? (
              <span className="vq-builder__count">
                {runDocs.length} {t('query.docCount')}
              </span>
            ) : null}
          </div>
          {runError ? <p className="vq-builder__error">{runError}</p> : null}
          {runDocs ? (
            <MongoShellResultTree documents={runDocs} />
          ) : (
            <p className="agg-empty">
              {canRun ? t('query.runHint') : t('query.selectTarget')}
            </p>
          )}
        </section>

        <aside className="vq-builder__sidebar" aria-label={t('query.builder')}>
          <div className="vq-builder__mode">
            <button
              type="button"
              className={query.editMode === 'form' ? 'active' : undefined}
              onClick={() => setEditMode('form')}
            >
              {t('query.form')}
            </button>
            <button
              type="button"
              className={query.editMode === 'json' ? 'active' : undefined}
              onClick={() => setEditMode('json')}
            >
              {t('query.json')}
            </button>
          </div>

          {query.editMode === 'json' ? (
            <div className="vq-builder__json">
              <Editor
                value={query.jsonText}
                onValueChange={(jsonText) => patchQuery({ jsonText })}
                highlight={highlightJson}
                padding={10}
                style={EDITOR_STYLE}
                aria-label={t('query.json')}
              />
            </div>
          ) : (
            <>
              <section className="vq-panel">
                <h3>{t('query.filter')}</h3>
                <MatchTreeEditor
                  node={query.filter}
                  onChange={(filter) => patchQuery({ filter })}
                />
              </section>

              <section className="vq-panel">
                <label className="vq-panel__toggle">
                  <input
                    type="checkbox"
                    checked={query.projectionEnabled}
                    onChange={(e) => patchQuery({ projectionEnabled: e.target.checked })}
                  />
                  {t('query.projection')}
                </label>
                {query.projectionEnabled ? (
                  <div className="vq-rows">
                    {query.projection.map((row) => (
                      <div key={row.id} className="vq-row">
                        <input
                          value={row.field}
                          placeholder="field"
                          aria-label="Projection field"
                          onChange={(e) => updateProjection(row.id, { field: e.target.value })}
                        />
                        <select
                          value={row.include ? 'include' : 'exclude'}
                          aria-label="Include or exclude"
                          onChange={(e) =>
                            updateProjection(row.id, { include: e.target.value === 'include' })
                          }
                        >
                          <option value="include">{t('query.include')}</option>
                          <option value="exclude">{t('query.exclude')}</option>
                        </select>
                        <button
                          type="button"
                          className="agg-icon-btn"
                          aria-label="Remove projection"
                          onClick={() =>
                            setQuery((prev) => ({
                              ...prev,
                              projection: prev.projection.filter((r) => r.id !== row.id),
                            }))
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="tertiary"
                      onClick={() =>
                        setQuery((prev) => ({
                          ...prev,
                          projection: [...prev.projection, createProjectionRow()],
                        }))
                      }
                    >
                      + {t('query.projection')}
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="vq-panel">
                <h3>{t('query.sort')}</h3>
                <div className="vq-rows">
                  {query.sort.map((row) => (
                    <div key={row.id} className="vq-row">
                      <input
                        value={row.field}
                        placeholder="field"
                        aria-label="Sort field"
                        onChange={(e) => updateSort(row.id, { field: e.target.value })}
                      />
                      <select
                        value={row.direction}
                        aria-label="Sort direction"
                        onChange={(e) =>
                          updateSort(row.id, {
                            direction: Number(e.target.value) === -1 ? -1 : 1,
                          })
                        }
                      >
                        <option value={1}>{t('query.asc')}</option>
                        <option value={-1}>{t('query.desc')}</option>
                      </select>
                      <button
                        type="button"
                        className="agg-icon-btn"
                        aria-label="Remove sort"
                        onClick={() =>
                          setQuery((prev) => ({
                            ...prev,
                            sort: prev.sort.filter((r) => r.id !== row.id),
                          }))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="tertiary"
                    onClick={() =>
                      setQuery((prev) => ({
                        ...prev,
                        sort: [...prev.sort, createSortRow()],
                      }))
                    }
                  >
                    + {t('query.sort')}
                  </button>
                </div>
              </section>

              <section className="vq-panel vq-panel--inline">
                <label className="vq-builder__field">
                  <span>{t('query.skip')}</span>
                  <input
                    type="number"
                    min={0}
                    value={query.skip}
                    onChange={(e) => patchQuery({ skip: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="vq-builder__field">
                  <span>{t('query.limit')}</span>
                  <input
                    type="number"
                    min={1}
                    value={query.limit}
                    onChange={(e) => patchQuery({ limit: Number(e.target.value) || 1 })}
                  />
                </label>
              </section>
            </>
          )}

          <section className="vq-panel vq-panel--generated">
            <h3>{t('query.generated')}</h3>
            <pre className="vq-generated">{generatedShell}</pre>
          </section>

          <div className="vq-builder__actions">
            <button
              type="button"
              className="primary"
              disabled={running || !canRun}
              onClick={() => void runLive()}
            >
              {running ? '…' : `${t('query.run')} (F5)`}
            </button>
            <button type="button" className="tertiary" onClick={resetQuery}>
              {t('query.reset')}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
