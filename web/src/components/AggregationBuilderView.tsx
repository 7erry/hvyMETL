import {
  useCallback,
  useEffect,
  useMemo,
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
import { previewPipeline } from '../aggregation/mockPreview';
import { SAMPLE_COLLECTION, SAMPLE_DOCS } from '../aggregation/seedDocs';
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
import { useT } from '../i18n/LocaleContext';
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

export function AggregationBuilderView(): ReactElement {
  const t = useT();
  const [stages, setStages] = useState<PipelineStage[]>(() => [createStage('match')]);
  const [selectedId, setSelectedId] = useState<string | null>(() => stages[0]?.id ?? null);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [bottomTab, setBottomTab] = useState<BottomTab>('preview');
  const [bottomHeight, setBottomHeight] = useState(280);
  const [previewStageId, setPreviewStageId] = useState<string | null>(null);
  const [runDocs, setRunDocs] = useState<Record<string, unknown>[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const selected = stages.find((s) => s.id === selectedId) ?? null;

  const compiled = useMemo(() => compilePipeline(stages), [stages]);
  const preview = useMemo(() => {
    const through = previewStageId ?? selectedId;
    return previewPipeline(stages, SAMPLE_DOCS, through);
  }, [stages, previewStageId, selectedId]);

  const activePreviewStep = useMemo(() => {
    if (!preview.ok || preview.steps.length === 0) {
      return { input: SAMPLE_DOCS, output: SAMPLE_DOCS, op: '(seed)' };
    }
    const through = previewStageId ?? selectedId;
    const step =
      preview.steps.find((s) => s.stageId === through) ?? preview.steps[preview.steps.length - 1];
    return step;
  }, [preview, previewStageId, selectedId]);

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

  const runMock = useCallback(() => {
    const result = previewPipeline(stages, SAMPLE_DOCS, null);
    if (!result.ok) {
      setRunError(result.error);
      setRunDocs(null);
      setBottomTab('results');
      return;
    }
    setRunError(null);
    setRunDocs(result.final);
    setBottomTab('results');
  }, [stages]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F5') {
        event.preventDefault();
        runMock();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runMock]);

  const filteredPalette = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    return STAGE_PALETTE.filter((item) => {
      if (!q) return true;
      return item.kind.includes(q) || item.mongoOp.includes(q);
    });
  }, [paletteQuery]);

  const queryCode = useMemo(() => {
    if (!compiled.ok) return `// ${compiled.error}`;
    return formatPipelineAsCode(SAMPLE_COLLECTION, compiled.pipeline);
  }, [compiled]);

  return (
    <div className="agg-builder">
      <div className="agg-builder__topbar">
        <div className="agg-builder__breadcrumb">
          <span>learningPlatform</span>
          <span>/</span>
          <span>{SAMPLE_COLLECTION}</span>
          <span>/</span>
          <strong>{t('aggregation.title')}</strong>
        </div>
        <button type="button" className="primary agg-builder__run" onClick={runMock}>
          {t('aggregation.run')} (F5)
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
                return (
                  <div key={category} className="agg-palette__section">
                    <h3>
                      {category === 'filter'
                        ? t('aggregation.catFilter')
                        : category === 'transformation'
                          ? t('aggregation.catTransform')
                          : t('aggregation.catJoins')}
                    </h3>
                    <ul>
                      {items.map((item) => (
                        <li key={item.kind}>
                          <button
                            type="button"
                            className="agg-palette__item"
                            draggable
                            onDragStart={(e) => onPaletteDragStart(e, item.kind)}
                            onDoubleClick={() => addStage(item.kind)}
                            onClick={() => addStage(item.kind)}
                          >
                            <span className="agg-palette__op">{item.mongoOp}</span>
                            <span>{stageKindLabel(item.kind)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
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
            <div className="agg-bottom__tabs" role="tablist">
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

            {bottomTab !== 'code' ? (
              <div className="agg-stepper" role="navigation" aria-label="Pipeline stages">
                {stages
                  .filter((s) => s.enabled)
                  .map((stage) => (
                    <button
                      key={stage.id}
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
                      ${stage.kind}
                    </button>
                  ))}
              </div>
            ) : null}

            <div className="agg-bottom__body">
              {bottomTab === 'code' ? (
                <pre className="agg-code">{queryCode}</pre>
              ) : null}
              {bottomTab === 'results' ? (
                runError ? (
                  <p className="agg-error">{runError}</p>
                ) : runDocs ? (
                  <DocsTable docs={runDocs} />
                ) : (
                  <p className="agg-empty">{t('aggregation.runHint')}</p>
                )
              ) : null}
              {bottomTab === 'preview' ? (
                !preview.ok ? (
                  <p className="agg-error">{preview.error}</p>
                ) : (
                  <div className="agg-preview-split">
                    <div className="agg-preview-pane">
                      <h3>{t('aggregation.input')}</h3>
                      <MongoShellResultTree documents={activePreviewStep.input} />
                    </div>
                    <div className="agg-preview-pane">
                      <h3>{t('aggregation.output')}</h3>
                      <DocsTable docs={activePreviewStep.output} />
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
