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
import { columnTypeClass } from '../typeHighlight';
import {
  buildFindScript,
  buildSampleFieldsScript,
  fieldNamesFromShellOutput,
  filterJsonText,
  formatFindAsShell,
  projectionJsonText,
  projectionStateFromJson,
  resolveCompiledFind,
  sortJsonText,
  sortRowsFromJson,
} from '../visualQuery/compileFind';
import {
  createProjectionRow,
  createSortRow,
  defaultFindQueryState,
  type FindQueryState,
  type ProjectionRow,
} from '../visualQuery/types';
import { MongoShellResultTree } from './MongoShellResultTree';
import { SavedMongoConnectionField } from './SavedMongoConnectionField';

const COMPARE_OPS: MatchCompareOp[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin'];
const LOGICS: MatchLogic[] = ['and', 'or', 'nor'];

const LINE_EDITOR_STYLE = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '0.78rem',
  lineHeight: '1.4',
  minHeight: '1.6rem',
  outline: 0,
} as const;

type QueryTab = {
  id: string;
  collection: string;
  query: FindQueryState;
  filterOverride: string | null;
};

function makeTab(collection = ''): QueryTab {
  return { id: newId(), collection, query: defaultFindQueryState(), filterOverride: null };
}

function highlightJson(code: string): string {
  return highlightPrismCode(code, 'json');
}

function logicLabel(logic: MatchLogic): string {
  switch (logic) {
    case 'and':
      return 'And';
    case 'or':
      return 'Or';
    case 'nor':
      return 'Nor';
    default: {
      const _exhaustive: never = logic;
      return _exhaustive;
    }
  }
}

function valueTypeLabel(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === 'true' || trimmed === 'false') return 'Bool';
  if (trimmed === 'null') return 'Null';
  if (trimmed !== '' && Number.isFinite(Number(trimmed))) return 'Double';
  return 'String';
}

function JsonLine({
  value,
  ariaLabel,
  onDraft,
}: {
  value: string;
  ariaLabel: string;
  onDraft: (text: string) => void;
}): ReactElement {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rootRef.current?.contains(document.activeElement)) return;
    focused.current = false;
    setDraft(value);
  }, [value]);

  return (
    <div
      ref={rootRef}
      className="vq-line__editor"
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setDraft(value);
      }}
    >
      <Editor
        value={draft}
        onValueChange={(next) => {
          setDraft(next);
          if (focused.current) onDraft(next);
        }}
        highlight={highlightJson}
        padding={6}
        style={LINE_EDITOR_STYLE}
        aria-label={ariaLabel}
      />
    </div>
  );
}

function FieldSelect({
  value,
  fields,
  ariaLabel,
  onChange,
}: {
  value: string;
  fields: string[];
  ariaLabel: string;
  onChange: (next: string) => void;
}): ReactElement {
  const options = value && !fields.includes(value) ? [value, ...fields] : fields;
  return (
    <select value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)}>
      <option value="">{fields.length === 0 ? '…' : 'field'}</option>
      {options.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
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
  fields,
  onChange,
  onRemove,
}: {
  node: MatchNode;
  fields: string[];
  onChange: (next: MatchNode) => void;
  onRemove?: () => void;
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
                {logicLabel(logic)}
              </option>
            ))}
          </select>
          {onRemove ? (
            <button type="button" className="agg-icon-btn" aria-label="Remove group" onClick={onRemove}>
              ×
            </button>
          ) : null}
        </div>
        <div className="agg-match-group__body">
          {node.children.map((child) => (
            <MatchTreeEditor
              key={child.id}
              node={child}
              fields={fields}
              onRemove={() => onChange(removeMatchNode(node, child.id))}
              onChange={(nextChild) => {
                onChange({
                  ...node,
                  children: node.children.map((c) => (c.id === nextChild.id ? nextChild : c)),
                });
              }}
            />
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

  const typeLabel = valueTypeLabel(node.value);
  return (
    <div className="vq-match-expr">
      <FieldSelect
        value={node.field}
        fields={fields}
        ariaLabel="Field"
        onChange={(field) => onChange({ ...node, field })}
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
      <button type="button" className="agg-icon-btn" aria-label="Remove expression" onClick={onRemove}>
        ×
      </button>
      <span className={`vq-type ${columnTypeClass(typeLabel)}`}>{typeLabel}</span>
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
  const [tabs, setTabs] = useState<QueryTab[]>(() => [makeTab()]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [runDocs, setRunDocs] = useState<Record<string, unknown>[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [fieldNames, setFieldNames] = useState<string[]>([]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]!;
  const activeTabIdRef = useRef(activeTab.id);
  activeTabIdRef.current = activeTab.id;
  const collection = activeTab.collection;
  const query = activeTab.query;

  const setActiveCollection = useCallback((nextCollection: string): void => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTabIdRef.current ? { ...tab, collection: nextCollection } : tab,
      ),
    );
  }, []);

  const selectedConnection = connections.find((c) => c.id === connectionId) ?? null;
  const canRun = Boolean(
    selectedConnection?.uri.trim() && database.trim() && collection.trim(),
  );

  const compiled = useMemo(
    () => resolveCompiledFind(query, activeTab.filterOverride),
    [activeTab.filterOverride, query],
  );
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
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabIdRef.current) return tab;
        const nextCollection =
          tab.collection && names.includes(tab.collection) ? tab.collection : (names[0] ?? '');
        return { ...tab, collection: nextCollection };
      }),
    );
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
      setActiveCollection('');
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
          setActiveCollection('');
          return;
        }
        const dbNames = databaseNamesFromShellOutput(dbResult.stdout);
        setDatabases(dbNames);
        if (dbNames.length === 0) {
          setCollections([]);
          setActiveCollection('');
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
          setActiveCollection('');
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCollectionNames, connectionId, fetchCollectionNames, selectedUri, setActiveCollection]);

  const onDatabaseChange = useCallback(
    (nextDb: string): void => {
      setDatabase(nextDb);
      setCollections([]);
      setActiveCollection('');
      setFieldNames([]);
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
          setActiveCollection('');
        } finally {
          setCatalogLoading(false);
        }
      })();
    },
    [applyCollectionNames, fetchCollectionNames, selectedUri, setActiveCollection],
  );

  useEffect(() => {
    if (!selectedUri || !database.trim() || !collection.trim()) {
      setFieldNames([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const script = buildSampleFieldsScript(database, collection);
        const next = await runMongoshScript({
          uri: selectedUri,
          script,
          dbName: database.trim(),
        });
        if (cancelled) return;
        if (!next.ok) {
          setFieldNames([]);
          return;
        }
        setFieldNames(fieldNamesFromShellOutput(next.stdout));
      } catch {
        if (!cancelled) setFieldNames([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collection, database, selectedUri]);

  const patchActiveTab = useCallback((patch: Partial<QueryTab>): void => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === activeTabIdRef.current ? { ...tab, ...patch } : tab)),
    );
  }, []);

  const patchQuery = useCallback((patch: Partial<FindQueryState>): void => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabIdRef.current) return tab;
        return {
          ...tab,
          query: { ...tab.query, ...patch },
          filterOverride: 'filter' in patch ? null : tab.filterOverride,
        };
      }),
    );
  }, []);

  const updateProjection = useCallback((id: string, patch: Partial<ProjectionRow>): void => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabIdRef.current) return tab;
        return {
          ...tab,
          query: {
            ...tab.query,
            projection: tab.query.projection.map((row) => (row.id === id ? { ...row, ...patch } : row)),
          },
        };
      }),
    );
  }, []);

  const setFirstSort = useCallback((direction: 1 | -1): void => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabIdRef.current) return tab;
        const sort =
          tab.query.sort.length === 0
            ? [createSortRow('_id', direction)]
            : tab.query.sort.map((row, index) =>
                index === 0 ? { ...row, direction, enabled: true } : row,
              );
        return { ...tab, query: { ...tab.query, sort } };
      }),
    );
  }, []);

  const resetQuery = useCallback(() => {
    patchActiveTab({ query: defaultFindQueryState(), filterOverride: null });
    setRunDocs(null);
    setRunError(null);
  }, [patchActiveTab]);

  const runLive = useCallback(async () => {
    if (!selectedConnection?.uri.trim() || !database.trim() || !collection.trim()) {
      setRunError(t('query.selectTarget'));
      setRunDocs(null);
      return;
    }
    const next = resolveCompiledFind(query, activeTab.filterOverride);
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
  }, [activeTab.filterOverride, collection, database, query, selectedConnection, t]);

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

  const formFilterJson = filterJsonText(query.filter);
  const sortJson = sortJsonText(query.sort);
  const projectionJson = projectionJsonText(query.projection, query.projectionEnabled);
  const queryJson = activeTab.filterOverride ?? formFilterJson;
  const firstSortDir = query.sort.find((row) => row.enabled)?.direction;
  const collectionChoices =
    collection && !collections.includes(collection) ? [collection, ...collections] : collections;

  const addTab = (): void => {
    const tab = makeTab(collection);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const closeTab = (id: string): void => {
    setTabs((prev) => (prev.length < 2 ? prev : prev.filter((tab) => tab.id !== id)));
    setActiveTabId((current) => (current === id ? null : current));
    setRunDocs(null);
  };

  return (
    <div className="vq-builder">
      <div className="vq-builder__main">
        <section className="vq-builder__results" aria-label={t('query.results')}>
          <div className="vq-tabs" role="tablist">
            {tabs.map((tab) => {
              const selected = tab.id === activeTab.id;
              return (
                <div
                  key={tab.id}
                  className={selected ? 'vq-tab vq-tab--active' : 'vq-tab'}
                  role="tab"
                  aria-selected={selected}
                >
                  <button
                    type="button"
                    className="vq-tab__name"
                    onClick={() => {
                      if (tab.id === activeTab.id) return;
                      setActiveTabId(tab.id);
                      setRunDocs(null);
                    }}
                  >
                    {tab.collection || '…'}
                  </button>
                  {tabs.length > 1 ? (
                    <button
                      type="button"
                      className="vq-tab__close"
                      aria-label="Close tab"
                      onClick={() => closeTab(tab.id)}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              );
            })}
            <button type="button" className="vq-tab__add" aria-label="New query tab" onClick={addTab}>
              +
            </button>
          </div>

          <div className="vq-crumb">
            <SavedMongoConnectionField
              connections={connections}
              connectionId={connectionId}
              onConnectionIdChange={setConnectionId}
              onConnectionsChange={setConnections}
              fieldClassName="vq-builder__field"
              label={t('query.connection')}
              emptyLabel={t('query.noConnections')}
            />
            <span className="vq-crumb__sep" aria-hidden="true">
              &gt;
            </span>
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
            <span className="vq-crumb__sep" aria-hidden="true">
              &gt;
            </span>
            <label className="vq-builder__field">
              <span>{t('query.collection')}</span>
              <select
                value={collection}
                aria-label={t('query.collection')}
                disabled={!database || catalogLoading}
                onChange={(e) => setActiveCollection(e.target.value)}
              >
                {collectionChoices.length === 0 ? (
                  <option value="">{catalogLoading ? '…' : t('query.noCollections')}</option>
                ) : (
                  collectionChoices.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>

          <div className="vq-query-row">
            <label className="vq-line">
              <span className="vq-line__label">{t('query.json')}</span>
              <JsonLine
                key={`${activeTab.id}-query`}
                value={queryJson}
                ariaLabel={t('query.json')}
                onDraft={(text) => patchActiveTab({ filterOverride: text === formFilterJson ? null : text })}
              />
            </label>
            <button
              type="button"
              className="primary vq-builder__run"
              disabled={running || !canRun}
              onClick={() => void runLive()}
            >
              {running ? '…' : `${t('query.run')} (F5)`}
            </button>
          </div>

          <div className="vq-line">
            <span className="vq-line__label">{t('query.sort')}</span>
            <div className="vq-sort-dir" role="group" aria-label={t('query.sort')}>
              <button
                type="button"
                className={firstSortDir === 1 ? 'active' : undefined}
                aria-label={t('query.asc')}
                onClick={() => setFirstSort(1)}
              >
                ↑
              </button>
              <button
                type="button"
                className={firstSortDir === -1 ? 'active' : undefined}
                aria-label={t('query.desc')}
                onClick={() => setFirstSort(-1)}
              >
                ↓
              </button>
            </div>
            <JsonLine
              key={`${activeTab.id}-sort`}
              value={sortJson}
              ariaLabel={t('query.sort')}
              onDraft={(text) => {
                const rows = sortRowsFromJson(text);
                if (rows) patchQuery({ sort: rows });
              }}
            />
          </div>

          <label className="vq-line">
            <span className="vq-line__label">{t('query.projection')}</span>
            <JsonLine
              key={`${activeTab.id}-projection`}
              value={projectionJson}
              ariaLabel={t('query.projection')}
              onDraft={(text) => {
                const next = projectionStateFromJson(text);
                if (next) patchQuery(next);
              }}
            />
          </label>

          <div className="vq-line vq-line--limits">
            <label className="vq-builder__field vq-builder__field--inline">
              <span>{t('query.limit')}</span>
              <input
                type="number"
                min={1}
                value={query.limit}
                aria-label={t('query.limit')}
                onChange={(e) => patchQuery({ limit: Number(e.target.value) || 1 })}
              />
            </label>
            <label className="vq-builder__field vq-builder__field--inline">
              <span>{t('query.skip')}</span>
              <input
                type="number"
                min={0}
                value={query.skip}
                aria-label={t('query.skip')}
                onChange={(e) => patchQuery({ skip: Number(e.target.value) || 0 })}
              />
            </label>
            {runDocs ? (
              <span className="vq-builder__count">
                {runDocs.length} {t('query.docCount')}
              </span>
            ) : null}
          </div>

          {runError ? <p className="vq-builder__error">{runError}</p> : null}
          <div className="vq-builder__result-body">
            {runDocs ? (
              <MongoShellResultTree documents={runDocs} />
            ) : (
              <p className="agg-empty">{canRun ? t('query.runHint') : t('query.selectTarget')}</p>
            )}
          </div>
        </section>

        <aside className="vq-builder__sidebar" aria-label={t('query.builder')}>
          <div className="vq-builder__sidebar-inner">
            <h2 className="vq-builder__title">{t('query.builder')}</h2>
            <section className="vq-panel">
              <h3>{t('query.filter')}</h3>
              <MatchTreeEditor
                node={query.filter}
                fields={fieldNames}
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
              <div className="vq-rows">
                {query.projection.map((row) => (
                  <div key={row.id} className="vq-row vq-row--projection">
                    <FieldSelect
                      value={row.field}
                      fields={fieldNames}
                      ariaLabel="Projection field"
                      onChange={(field) => updateProjection(row.id, { field })}
                    />
                    <select
                      value={row.include ? 'include' : 'exclude'}
                      aria-label="Include or exclude"
                      onChange={(e) => updateProjection(row.id, { include: e.target.value === 'include' })}
                    >
                      <option value="include">{t('query.include')}</option>
                      <option value="exclude">{t('query.exclude')}</option>
                    </select>
                    <button
                      type="button"
                      className="agg-icon-btn"
                      aria-label="Remove projection"
                      onClick={() =>
                        patchQuery({ projection: query.projection.filter((item) => item.id !== row.id) })
                      }
                    >
                      ×
                    </button>
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      aria-label="Enable projection field"
                      onChange={(e) => updateProjection(row.id, { enabled: e.target.checked })}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="tertiary"
                  onClick={() => patchQuery({ projection: [...query.projection, createProjectionRow()] })}
                >
                  + {t('query.projection')}
                </button>
              </div>
            </section>

            <section className="vq-panel vq-panel--generated">
              <h3>{t('query.generated')}</h3>
              <pre className="vq-generated">{generatedShell}</pre>
            </section>

            <div className="vq-builder__actions">
              <button type="button" className="tertiary" onClick={resetQuery}>
                {t('query.reset')}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
