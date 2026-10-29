import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactElement,
} from 'react';
import Editor from 'react-simple-code-editor';
import {
  compilePipeline,
  formatPipelineAsCode,
  stageKindLabel,
} from '../aggregation/compilePipeline';
import {
  buildAggregateScript,
  stagesBefore,
  stagesThrough,
} from '../aggregation/liveAggregate';
import {
  createStage,
  newId,
  STAGE_PALETTE,
  type MatchCompareOp,
  type MatchLogic,
  type MatchNode,
  type PipelineStage,
  type StageCategory,
  type StageKind,
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
import { MongoShellResultTree } from './MongoShellResultTree';
import { ResizableVerticalSplit } from './ResizableVerticalSplit';

type BottomTab = 'results' | 'preview' | 'code';

const COMPARE_OPS: MatchCompareOp[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin'];
const LOGICS: MatchLogic[] = ['and', 'or', 'nor'];

const CATEGORY_ORDER: StageCategory[] = ['filter', 'transformation', 'joins'];

const EDITOR_STYLE = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '0.82rem',
  lineHeight: '1.45',
  minHeight: '12rem',
  outline: 0,
} as const;

/** Compact glyph for palette / visual-map rows (no icon pack in app). */
function stageGlyph(kind: StageKind): string {
  switch (kind) {
    case 'match':
      return '⌕';
    case 'limit':
      return '↧';
    case 'skip':
      return '↥';
    case 'sample':
      return '⌁';
    case 'count':
      return '#';
    case 'project':
      return '▭';
    case 'addFields':
      return '+';
    case 'set':
      return '=';
    case 'unset':
      return '×';
    case 'sort':
      return '⇅';
    case 'unwind':
      return '⟲';
    case 'group':
      return 'Σ';
    case 'lookup':
      return '⤴';
    case 'unionWith':
      return '⋃';
    case 'out':
      return '⇩';
    case 'merge':
      return ' intern';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

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
                  const patched = {
                    ...node,
                    children: node.children.map((c) => (c.id === nextChild.id ? nextChild : c)),
                  };
                  onChange(patched);
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

function DocsTable({ docs }: { docs: Record<string, unknown>[] }): ReactElement {
  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const doc of docs.slice(0, 50)) {
      for (const k of Object.keys(doc)) keys.add(k);
    }
    return Array.from(keys);
  }, [docs]);

  if (docs.length === 0) {
    return <p className="agg-empty">No documents</p>;
  }

  return (
    <div className="agg-table-wrap">
      <table className="agg-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.slice(0, 100).map((doc, i) => (
            <tr key={String(doc._id ?? i)}>
              {columns.map((col) => (
                <td key={col}>
                  {doc[col] === undefined
                    ? ''
                    : typeof doc[col] === 'object'
                      ? JSON.stringify(doc[col])
                      : String(doc[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function runAggregateDocs(input: {
  uri: string;
  database: string;
  collection: string;
  stages: PipelineStage[];
}): Promise<{ ok: true; docs: Record<string, unknown>[] } | { ok: false; error: string }> {
  const compiled = compilePipeline(input.stages);
  if (!compiled.ok) return { ok: false, error: compiled.error };
  let script: string;
  try {
    script = buildAggregateScript(input.database, input.collection, compiled.pipeline);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  try {
    const next = await runMongoshScript({
      uri: input.uri,
      script,
      dbName: input.database.trim(),
    });
    if (!next.ok) {
      return {
        ok: false,
        error: next.timedOut
          ? 'mongosh timed out after 30s.'
          : next.stderr.trim() || next.stdout.trim() || `mongosh exited with code ${next.exitCode ?? '?'}`,
      };
    }
    const docs = resolveShellResultDocuments(next.stdout, true) ?? [];
    return { ok: true, docs };
  } catch (err) {
    return { ok: false, error: describeApiError(err) };
  }
}

export function AggregationBuilderView(): ReactElement {
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
  const [stages, setStages] = useState<PipelineStage[]>(() => [createStage('match')]);
  const [selectedId, setSelectedId] = useState<string | null>(() => stages[0]?.id ?? null);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [bottomTab, setBottomTab] = useState<BottomTab>('results');
  const [bottomHeight, setBottomHeight] = useState(280);
  const [previewStageId, setPreviewStageId] = useState<string | null>(null);
  const [runDocs, setRunDocs] = useState<Record<string, unknown>[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [previewInput, setPreviewInput] = useState<Record<string, unknown>[]>([]);
  const [previewOutput, setPreviewOutput] = useState<Record<string, unknown>[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewGen = useRef(0);

  const selected = stages.find((s) => s.id === selectedId) ?? null;
  const selectedConnection = connections.find((c) => c.id === connectionId) ?? null;
  const canRun = Boolean(
    selectedConnection?.uri.trim() && database.trim() && collection.trim(),
  );

  const compiled = useMemo(() => compilePipeline(stages), [stages]);

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

  /** Fetch collection names via the same mongosh helpers Shell replicate uses. */
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

  const addStage = useCallback(
    (kind: StageKind) => {
      const stage = createStage(kind);
      setStages((prev) => [...prev, stage]);
      setSelectedId(stage.id);
      setPreviewStageId(stage.id);
    },
    [],
  );

  const updateStage = useCallback((id: string, patch: Partial<PipelineStage>) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const removeStage = useCallback((id: string) => {
    setStages((prev) => {
      const next = prev.filter((s) => s.id !== id);
      setSelectedId((cur) => (cur === id ? (next[0]?.id ?? null) : cur));
      return next;
    });
  }, []);

  const moveStage = useCallback((id: string, dir: -1 | 1) => {
    setStages((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
  }, []);

  const onPaletteDragStart = (event: ReactDragEvent, kind: StageKind) => {
    event.dataTransfer.setData('text/agg-stage', kind);
    event.dataTransfer.effectAllowed = 'copy';
  };

  const onPipelineDrop = (event: ReactDragEvent) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('text/agg-stage') as StageKind;
    if (kind) addStage(kind);
  };

  const runLive = useCallback(async () => {
    if (!selectedConnection?.uri.trim() || !database.trim() || !collection.trim()) {
      setRunError(t('aggregation.selectTarget'));
      setRunDocs(null);
      setBottomTab('results');
      return;
    }
    setRunning(true);
    setRunError(null);
    const result = await runAggregateDocs({
      uri: selectedConnection.uri,
      database,
      collection,
      stages,
    });
    setRunning(false);
    setBottomTab('results');
    if (!result.ok) {
      setRunError(result.error);
      setRunDocs(null);
      return;
    }
    setRunDocs(result.docs);
  }, [collection, database, selectedConnection, stages, t]);

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

  // Live stage preview: aggregate through N−1 (input) and through N (output).
  useEffect(() => {
    if (bottomTab !== 'preview') return;
    if (!selectedConnection?.uri.trim() || !database.trim() || !collection.trim()) {
      setPreviewInput([]);
      setPreviewOutput([]);
      setPreviewError(t('aggregation.selectTarget'));
      setPreviewLoading(false);
      return;
    }
    const through = previewStageId ?? selectedId;
    const gen = ++previewGen.current;
    setPreviewLoading(true);
    setPreviewError(null);
    void (async () => {
      const inputResult = await runAggregateDocs({
        uri: selectedConnection.uri,
        database,
        collection,
        stages: stagesBefore(stages, through),
      });
      if (gen !== previewGen.current) return;
      if (!inputResult.ok) {
        setPreviewError(inputResult.error);
        setPreviewInput([]);
        setPreviewOutput([]);
        setPreviewLoading(false);
        return;
      }
      const outputResult = await runAggregateDocs({
        uri: selectedConnection.uri,
        database,
        collection,
        stages: stagesThrough(stages, through),
      });
      if (gen !== previewGen.current) return;
      if (!outputResult.ok) {
        setPreviewError(outputResult.error);
        setPreviewInput(inputResult.docs);
        setPreviewOutput([]);
        setPreviewLoading(false);
        return;
      }
      setPreviewInput(inputResult.docs);
      setPreviewOutput(outputResult.docs);
      setPreviewLoading(false);
    })();
  }, [
    bottomTab,
    collection,
    database,
    previewStageId,
    selectedConnection,
    selectedId,
    stages,
    t,
  ]);

  const filteredPalette = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    return STAGE_PALETTE.filter((item) => {
      if (!q) return true;
      return item.kind.includes(q) || item.mongoOp.includes(q);
    });
  }, [paletteQuery]);

  const queryCode = useMemo(() => {
    if (!compiled.ok) return `// ${compiled.error}`;
    const coll = collection.trim() || 'collection';
    return formatPipelineAsCode(coll, compiled.pipeline);
  }, [collection, compiled]);

  return (
    <div className="agg-builder">
      <div className="agg-builder__topbar">
        <div className="agg-builder__target">
          <label className="agg-builder__field">
            <span>{t('aggregation.connection')}</span>
            <select
              value={connectionId}
              aria-label={t('aggregation.connection')}
              onChange={(e) => setConnectionId(e.target.value)}
              onFocus={refreshConnections}
            >
              {connections.length === 0 ? (
                <option value="">{t('aggregation.noConnections')}</option>
              ) : (
                connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="agg-builder__field">
            <span>{t('aggregation.database')}</span>
            <select
              value={database}
              aria-label={t('aggregation.database')}
              disabled={!selectedConnection || catalogLoading || databases.length === 0}
              onChange={(e) => onDatabaseChange(e.target.value)}
            >
              {databases.length === 0 ? (
                <option value="">{catalogLoading ? '…' : t('aggregation.noDatabases')}</option>
              ) : (
                databases.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="agg-builder__field">
            <span>{t('aggregation.collection')}</span>
            <select
              value={collection}
              aria-label={t('aggregation.collection')}
              disabled={!database.trim() || catalogLoading || collections.length === 0}
              onChange={(e) => setCollection(e.target.value)}
            >
              {collections.length === 0 ? (
                <option value="">{catalogLoading ? '…' : t('aggregation.noCollections')}</option>
              ) : (
                collections.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))
              )}
            </select>
          </label>
          <strong className="agg-builder__title">{t('aggregation.title')}</strong>
        </div>
        <button
          type="button"
          className="primary agg-builder__run"
          disabled={running || !canRun}
          onClick={() => void runLive()}
        >
          {running ? '…' : `${t('aggregation.run')} (F5)`}
        </button>
      </div>

      <ResizableVerticalSplit
        bottomHeight={bottomHeight}
        onBottomHeightChange={setBottomHeight}
        minBottom={180}
        minTop={220}
        defaultBottomRatio={0.38}
        top={
          <div className="agg-builder__main">
            <aside className="agg-palette">
              <h2>{t('aggregation.stages')}</h2>
              <input
                className="agg-palette__search"
                value={paletteQuery}
                placeholder={t('aggregation.searchStages')}
                onChange={(e) => setPaletteQuery(e.target.value)}
              />
              {CATEGORY_ORDER.map((category) => {
                const items = filteredPalette.filter((p) => p.category === category);
                if (items.length === 0) return null;
                const title =
                  category === 'filter'
                    ? t('aggregation.catFilter')
                    : category === 'transformation'
                      ? t('aggregation.catTransform')
                      : t('aggregation.catJoins');
                return (
                  <details key={category} className="agg-palette__section" open>
                    <summary className="agg-palette__section-summary">{title}</summary>
                    <ul>
                      {items.map((item) => (
                        <li key={item.kind}>
                          <button
                            type="button"
                            className="agg-palette__item"
                            draggable
                            onDragStart={(e) => onPaletteDragStart(e, item.kind)}
                            onClick={() => addStage(item.kind)}
                            aria-label={`Add ${item.kind}`}
                          >
                            <span className="agg-palette__icon" aria-hidden="true">
                              {stageGlyph(item.kind)}
                            </span>
                            <span className="agg-palette__name">{item.kind}</span>
                            <span className="agg-palette__add" aria-hidden="true">
                              →
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </aside>

            <section
              className="agg-pipeline"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onPipelineDrop}
            >
              <header className="agg-pipeline__header">
                <h2>{t('aggregation.pipeline')}</h2>
                <span>
                  {stages.length} {t('aggregation.stageCount')}
                </span>
              </header>
              <ol className="agg-pipeline__list">
                {stages.map((stage, index) => (
                  <li key={stage.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      className={
                        selectedId === stage.id
                          ? 'agg-stage-card active'
                          : stage.enabled
                            ? 'agg-stage-card'
                            : 'agg-stage-card disabled'
                      }
                      onClick={() => {
                        setSelectedId(stage.id);
                        setPreviewStageId(stage.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedId(stage.id);
                          setPreviewStageId(stage.id);
                        }
                      }}
                    >
                      <span className="agg-stage-card__index">{index + 1}</span>
                      <span className="agg-stage-card__name">{stageKindLabel(stage.kind)}</span>
                      <span className="agg-stage-card__actions">
                        <button
                          type="button"
                          className="agg-icon-btn"
                          title="Move up"
                          aria-label="Move up"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveStage(stage.id, -1);
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="agg-icon-btn"
                          title="Move down"
                          aria-label="Move down"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveStage(stage.id, 1);
                          }}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className={`agg-icon-btn${stage.enabled ? '' : ' off'}`}
                          title={stage.enabled ? 'Disable' : 'Enable'}
                          aria-label={stage.enabled ? 'Disable stage' : 'Enable stage'}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateStage(stage.id, { enabled: !stage.enabled });
                          }}
                        >
                          ⏻
                        </button>
                        <button
                          type="button"
                          className="agg-icon-btn"
                          title="Remove"
                          aria-label="Remove stage"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeStage(stage.id);
                          }}
                        >
                          ⌫
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="agg-pipeline__hint">{t('aggregation.addHint')}</p>
            </section>

            <aside className="agg-inspector">
              {selected ? (
                <>
                  <header className="agg-inspector__header">
                    <h2>
                      {stages.findIndex((s) => s.id === selected.id) + 1}{' '}
                      {stageKindLabel(selected.kind)}
                    </h2>
                    <button
                      type="button"
                      className="agg-icon-btn"
                      aria-label={t('common.close')}
                      onClick={() => setSelectedId(null)}
                    >
                      ×
                    </button>
                  </header>
                  <div className="agg-inspector__modes" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      className={selected.editMode === 'form' ? 'active' : ''}
                      disabled={selected.kind !== 'match'}
                      onClick={() => updateStage(selected.id, { editMode: 'form' })}
                    >
                      {t('aggregation.form')}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={selected.editMode === 'json' ? 'active' : ''}
                      onClick={() => updateStage(selected.id, { editMode: 'json' })}
                    >
                      {t('aggregation.json')}
                    </button>
                  </div>
                  <div className="agg-inspector__body">
                    {selected.kind === 'match' && selected.editMode === 'form' && selected.matchTree ? (
                      <MatchTreeEditor
                        node={selected.matchTree}
                        onChange={(tree) => updateStage(selected.id, { matchTree: tree })}
                      />
                    ) : (
                      <Editor
                        value={selected.jsonText}
                        onValueChange={(code) => updateStage(selected.id, { jsonText: code })}
                        highlight={highlightJson}
                        padding={10}
                        style={EDITOR_STYLE}
                        className="agg-json-editor"
                      />
                    )}
                    {selected.kind !== 'match' && selected.editMode === 'form' ? (
                      <p className="agg-hint">{t('aggregation.jsonOnlyHint')}</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="agg-empty">{t('aggregation.selectStage')}</p>
              )}
            </aside>
          </div>
        }
        bottom={
          <div className="agg-bottom">
            <div className="agg-bottom__tabs">
              <div className="agg-bottom__tablist" role="tablist">
                {(
                  [
                    ['results', t('aggregation.tabResults')],
                    ['preview', t('aggregation.tabPreview')],
                    ['code', t('aggregation.tabCode')],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    className={bottomTab === id ? 'active' : ''}
                    onClick={() => setBottomTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="agg-stepper" role="navigation" aria-label="Pipeline stages">
                {stages
                  .filter((s) => s.enabled)
                  .map((stage, index) => (
                    <span key={stage.id} className="agg-stepper__pair">
                      {index > 0 ? (
                        <span className="agg-stepper__sep" aria-hidden="true">
                          ›
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className={
                          (previewStageId ?? selectedId) === stage.id
                            ? 'agg-stepper__item active'
                            : 'agg-stepper__item'
                        }
                        onClick={() => {
                          setPreviewStageId(stage.id);
                          setSelectedId(stage.id);
                          setBottomTab('preview');
                        }}
                      >
                        <span className="agg-stepper__icon" aria-hidden="true">
                          {stageGlyph(stage.kind)}
                        </span>
                        ${stage.kind}
                      </button>
                    </span>
                  ))}
              </div>
            </div>

            <div className="agg-bottom__body">
              {bottomTab === 'code' ? (
                <pre className="agg-code">{queryCode}</pre>
              ) : null}
              {bottomTab === 'results' ? (
                runError ? (
                  <p className="agg-error">{runError}</p>
                ) : runDocs ? (
                  <MongoShellResultTree documents={runDocs} />
                ) : (
                  <p className="agg-empty">
                    {canRun ? t('aggregation.runHint') : t('aggregation.selectTarget')}
                  </p>
                )
              ) : null}
              {bottomTab === 'preview' ? (
                previewError ? (
                  <p className="agg-error">{previewError}</p>
                ) : previewLoading ? (
                  <p className="agg-empty">…</p>
                ) : (
                  <div className="agg-preview-split">
                    <div className="agg-preview-pane">
                      <h3>{t('aggregation.input')}</h3>
                      <MongoShellResultTree documents={previewInput} />
                    </div>
                    <div className="agg-preview-pane">
                      <h3>{t('aggregation.output')}</h3>
                      <DocsTable docs={previewOutput} />
                    </div>
                  </div>
                )
              ) : null}
            </div>
          </div>
        }
      />
    </div>
  );
}
