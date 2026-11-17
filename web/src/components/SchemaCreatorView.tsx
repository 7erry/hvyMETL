import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  type OnNodeDrag,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { layoutSqlModel, SCHEMA_CREATOR_LAYOUT_OPTIONS } from '../graphLayout';
import { useT } from '../i18n/LocaleContext';
import {
  cloneCreatorModel,
  emptyCreatorModel,
  finalizeCreatorModel,
  makeColumn,
  makeTable,
  uniqueColumnName,
  uniqueTableName,
  updateColumnSqlType,
} from '../schemaCreator/schemaCreatorModel';
import { structuralModelToDdl } from '../schemaCreator/structuralModelToDdl';
import type { SqlStructuralModel, TableModel } from '../types';
import {
  SchemaCreatorTableNode,
  type SchemaCreatorTableNodeData,
} from './SchemaCreatorTableNode';

const nodeTypes = { schemaCreatorTable: SchemaCreatorTableNode };

type SchemaCreatorViewProps = {
  /** Before · SQL model used to seed an empty creator draft. */
  initialModel: SqlStructuralModel | null;
  creatorModel: SqlStructuralModel | null;
  positions: Record<string, { x: number; y: number }>;
  viewport: { x: number; y: number; zoom: number } | null;
  onCreatorModelChange: (model: SqlStructuralModel | null) => void;
  onPositionsChange: (positions: Record<string, { x: number; y: number }>) => void;
  onViewportChange: (viewport: { x: number; y: number; zoom: number } | null) => void;
  onApplyAsBeforeSql: (ddl: string, model: SqlStructuralModel) => void | Promise<void>;
};

function parseHandleColumn(handleId: string | null | undefined): string | null {
  if (!handleId) return null;
  if (handleId.endsWith('-in')) return handleId.slice(0, -3);
  if (handleId.endsWith('-out')) return handleId.slice(0, -4);
  return handleId;
}

function edgesFromTables(tables: TableModel[]): Edge[] {
  const edges: Edge[] = [];
  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      edges.push({
        id: `${table.name}.${fk.column}->${fk.referencesTable}.${fk.referencesColumn}`,
        source: table.name,
        target: fk.referencesTable,
        sourceHandle: `${fk.column}-out`,
        targetHandle: `${fk.referencesColumn}-in`,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { strokeWidth: 1.5 },
      });
    }
  }
  return edges;
}

function seedTables(
  creatorModel: SqlStructuralModel | null,
  initialModel: SqlStructuralModel | null,
): TableModel[] {
  if (creatorModel?.tables?.length) return cloneCreatorModel(creatorModel).tables;
  if (initialModel?.tables?.length) return cloneCreatorModel(initialModel).tables;
  return [];
}

export function SchemaCreatorView({
  initialModel,
  creatorModel,
  positions,
  viewport,
  onCreatorModelChange,
  onPositionsChange,
  onViewportChange,
  onApplyAsBeforeSql,
}: SchemaCreatorViewProps): ReactElement {
  const t = useT();
  const [tables, setTables] = useState<TableModel[]>(() => seedTables(creatorModel, initialModel));
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<SchemaCreatorTableNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const skipModelPersistRef = useRef(true);
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  useEffect(() => {
    if (skipModelPersistRef.current) {
      skipModelPersistRef.current = false;
      // Seed session when opening creator for the first time from Before · SQL.
      if (!creatorModel?.tables?.length && tables.length > 0) {
        onCreatorModelChange(finalizeCreatorModel(tables));
      }
      return;
    }
    onCreatorModelChange(tables.length ? finalizeCreatorModel(tables) : null);
    // creatorModel intentionally omitted — writing it would re-trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once from initial tables only
  }, [tables, onCreatorModelChange]);

  const mutateTable = useCallback((tableName: string, updater: (table: TableModel) => TableModel | null) => {
    setTables((prev) => {
      const next: TableModel[] = [];
      for (const table of prev) {
        if (table.name !== tableName) {
          next.push(table);
          continue;
        }
        const updated = updater(table);
        if (updated) next.push(updated);
      }
      return next;
    });
  }, []);

  const onRenameTable = useCallback((tableName: string, nextName: string) => {
    const trimmed = nextName.trim() || tableName;
    let finalName = trimmed;
    setTables((prev) => {
      const collision = prev.some(
        (table) => table.name !== tableName && table.name.toLowerCase() === trimmed.toLowerCase(),
      );
      finalName = collision ? uniqueTableName(prev.map((table) => table.name), trimmed) : trimmed;
      return prev.map((table) => {
        if (table.name === tableName) return { ...table, name: finalName };
        return {
          ...table,
          foreignKeys: table.foreignKeys.map((fk) =>
            fk.referencesTable === tableName ? { ...fk, referencesTable: finalName } : fk,
          ),
        };
      });
    });
    setSelectedTable((prev) => (prev === tableName ? finalName : prev));
    const pos = positionsRef.current[tableName];
    if (pos && finalName !== tableName) {
      const nextPositions = { ...positionsRef.current };
      delete nextPositions[tableName];
      nextPositions[finalName] = pos;
      onPositionsChange(nextPositions);
    }
  }, [onPositionsChange]);

  const onDeleteTable = useCallback((tableName: string) => {
    setTables((prev) =>
      prev
        .filter((table) => table.name !== tableName)
        .map((table) => ({
          ...table,
          foreignKeys: table.foreignKeys.filter((fk) => fk.referencesTable !== tableName),
        })),
    );
    setSelectedTable((prev) => (prev === tableName ? null : prev));
    if (positionsRef.current[tableName]) {
      const nextPositions = { ...positionsRef.current };
      delete nextPositions[tableName];
      onPositionsChange(nextPositions);
    }
  }, [onPositionsChange]);

  const onAddColumn = useCallback(
    (tableName: string) => {
      mutateTable(tableName, (table) => ({
        ...table,
        columns: [...table.columns, makeColumn(uniqueColumnName(table.columns.map((c) => c.name)))],
      }));
    },
    [mutateTable],
  );

  const onRenameColumn = useCallback(
    (tableName: string, columnName: string, nextName: string) => {
      const trimmed = nextName.trim() || columnName;
      setTables((prev) =>
        prev.map((table) => {
          if (table.name === tableName) {
            const collision = table.columns.some(
              (col) => col.name !== columnName && col.name.toLowerCase() === trimmed.toLowerCase(),
            );
            const finalName = collision
              ? uniqueColumnName(table.columns.map((c) => c.name), trimmed)
              : trimmed;
            return {
              ...table,
              columns: table.columns.map((col) => (col.name === columnName ? { ...col, name: finalName } : col)),
              primaryKey: table.primaryKey.map((name) => (name === columnName ? finalName : name)),
              foreignKeys: table.foreignKeys.map((fk) =>
                fk.column === columnName ? { ...fk, column: finalName } : fk,
              ),
            };
          }
          return {
            ...table,
            foreignKeys: table.foreignKeys.map((fk) =>
              fk.referencesTable === tableName && fk.referencesColumn === columnName
                ? { ...fk, referencesColumn: trimmed }
                : fk,
            ),
          };
        }),
      );
    },
    [],
  );

  const onChangeColumnType = useCallback(
    (tableName: string, columnName: string, sqlType: string) => {
      mutateTable(tableName, (table) => ({
        ...table,
        columns: table.columns.map((col) =>
          col.name === columnName ? updateColumnSqlType(col, sqlType) : col,
        ),
      }));
    },
    [mutateTable],
  );

  const onTogglePk = useCallback(
    (tableName: string, columnName: string) => {
      mutateTable(tableName, (table) => {
        const columns = table.columns.map((col) =>
          col.name === columnName ? { ...col, isPrimaryKey: !col.isPrimaryKey, nullable: col.isPrimaryKey } : col,
        );
        return {
          ...table,
          columns,
          primaryKey: columns.filter((col) => col.isPrimaryKey).map((col) => col.name),
        };
      });
    },
    [mutateTable],
  );

  const onDeleteColumn = useCallback((tableName: string, columnName: string) => {
    setTables((prev) =>
      prev.map((table) => {
        if (table.name === tableName) {
          if (table.columns.length <= 1) return table;
          const columns = table.columns.filter((col) => col.name !== columnName);
          return {
            ...table,
            columns,
            primaryKey: table.primaryKey.filter((name) => name !== columnName),
            foreignKeys: table.foreignKeys.filter((fk) => fk.column !== columnName),
          };
        }
        return {
          ...table,
          foreignKeys: table.foreignKeys.filter(
            (fk) => !(fk.referencesTable === tableName && fk.referencesColumn === columnName),
          ),
        };
      }),
    );
  }, []);

  const callbacks = useMemo(
    () => ({
      onRenameTable,
      onDeleteTable,
      onAddColumn,
      onRenameColumn,
      onChangeColumnType,
      onTogglePk,
      onDeleteColumn,
    }),
    [onRenameTable, onDeleteTable, onAddColumn, onRenameColumn, onChangeColumnType, onTogglePk, onDeleteColumn],
  );

  useEffect(() => {
    const draftModel = finalizeCreatorModel(tables);
    const autoLayout = layoutSqlModel(draftModel, SCHEMA_CREATOR_LAYOUT_OPTIONS);
    const nextPositions = { ...positionsRef.current };
    let positionsDirty = false;

    setNodes((prev) => {
      const live = new Map(prev.map((node) => [node.id, node.position]));
      return tables.map((table) => {
        const existing = nextPositions[table.name] ?? live.get(table.name);
        const position = existing ?? autoLayout[table.name] ?? { x: 80, y: 60 };
        if (!nextPositions[table.name]) {
          nextPositions[table.name] = position;
          positionsDirty = true;
        }
        return {
          id: table.name,
          type: 'schemaCreatorTable',
          position,
          data: {
            table,
            selected: selectedTable === table.name,
            ...callbacks,
          },
          selected: selectedTable === table.name,
        } satisfies Node<SchemaCreatorTableNodeData>;
      });
    });
    setEdges(edgesFromTables(tables));

    if (positionsDirty) {
      const keep = new Set(tables.map((table) => table.name));
      for (const key of Object.keys(nextPositions)) {
        if (!keep.has(key)) {
          delete nextPositions[key];
          positionsDirty = true;
        }
      }
      onPositionsChange(nextPositions);
    }
  }, [tables, selectedTable, callbacks, setNodes, setEdges, onPositionsChange]);

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      onPositionsChange({ ...positionsRef.current, [node.id]: { x: node.position.x, y: node.position.y } });
    },
    [onPositionsChange],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const sourceTable = connection.source;
      const targetTable = connection.target;
      const sourceColumn = parseHandleColumn(connection.sourceHandle);
      const targetColumn = parseHandleColumn(connection.targetHandle);
      if (!sourceTable || !targetTable || !sourceColumn || !targetColumn) return;
      if (sourceTable === targetTable) {
        setStatus(t('schemaCreator.selfFkBlocked'));
        return;
      }
      setTables((prev) =>
        prev.map((table) => {
          if (table.name !== sourceTable) return table;
          const without = table.foreignKeys.filter((fk) => fk.column !== sourceColumn);
          return {
            ...table,
            foreignKeys: [
              ...without,
              { column: sourceColumn, referencesTable: targetTable, referencesColumn: targetColumn },
            ],
          };
        }),
      );
      setEdges((eds) => addEdge({ ...connection, markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 } }, eds));
      setStatus(null);
    },
    [setEdges, t],
  );

  const handleAddTable = useCallback(() => {
    setTables((prev) => {
      const name = uniqueTableName(prev.map((table) => table.name));
      setSelectedTable(name);
      return [...prev, makeTable(name)];
    });
    setStatus(null);
  }, []);

  const handleApply = useCallback(async () => {
    try {
      setApplying(true);
      const model = finalizeCreatorModel(tables);
      const ddl = structuralModelToDdl(model);
      await onApplyAsBeforeSql(ddl, model);
      setStatus(t('schemaCreator.applied'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setApplying(false);
    }
  }, [tables, onApplyAsBeforeSql, t]);

  const handleReset = useCallback(() => {
    skipModelPersistRef.current = true;
    const next = initialModel?.tables?.length ? cloneCreatorModel(initialModel).tables : emptyCreatorModel().tables;
    setTables(next);
    setSelectedTable(null);
    setStatus(null);
    onCreatorModelChange(next.length ? finalizeCreatorModel(next) : null);
    onPositionsChange({});
    onViewportChange(null);
    skipModelPersistRef.current = false;
  }, [initialModel, onCreatorModelChange, onPositionsChange, onViewportChange]);

  const handleMoveEnd = useCallback(
    (_: unknown, next: Viewport) => {
      onViewportChange({ x: next.x, y: next.y, zoom: next.zoom });
    },
    [onViewportChange],
  );

  return (
    <div className="schema-creator">
      <aside className="schema-creator__sidebar" aria-label={t('schemaCreator.tables')}>
        <div className="schema-creator__sidebar-header">
          <h2>{t('schemaCreator.tables')}</h2>
          <button type="button" className="primary" onClick={handleAddTable}>
            {t('schemaCreator.addTable')}
          </button>
        </div>
        {tables.length === 0 ? (
          <p className="schema-creator__empty">{t('schemaCreator.empty')}</p>
        ) : (
          <ul className="schema-creator__table-list">
            {tables.map((table) => (
              <li key={table.name}>
                <button
                  type="button"
                  className={selectedTable === table.name ? 'schema-creator__table-btn active' : 'schema-creator__table-btn'}
                  onClick={() => setSelectedTable(table.name)}
                >
                  {table.name}
                  <span>{table.columns.length}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="schema-creator__hint">{t('schemaCreator.fkHint')}</p>
      </aside>
      <section className="schema-creator__canvas" aria-label={t('schemaCreator.title')}>
        <div className="schema-creator__toolbar">
          <div>
            <h1>{t('schemaCreator.title')}</h1>
            <p>{t('schemaCreator.subtitle')}</p>
          </div>
          <div className="schema-creator__toolbar-actions">
            <button type="button" className="tertiary" onClick={handleReset}>
              {t('schemaCreator.reset')}
            </button>
            <button type="button" className="primary" disabled={applying || tables.length === 0} onClick={() => void handleApply()}>
              {applying ? t('common.loading') : t('schemaCreator.useAsBeforeSql')}
            </button>
          </div>
        </div>
        {status ? <p className="schema-creator__status" role="status">{status}</p> : null}
        <div className="schema-creator__flow">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedTable(node.id)}
            onPaneClick={() => setSelectedTable(null)}
            fitView={!viewport}
            defaultViewport={viewport ?? { x: 0, y: 0, zoom: 1 }}
            onMoveEnd={handleMoveEnd}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#00684A" />
            <Controls />
            <MiniMap
              pannable
              zoomable
              nodeColor="#023430"
              maskColor="rgba(0, 30, 43, 0.8)"
              style={{ background: '#112733' }}
            />
          </ReactFlow>
        </div>
      </section>
    </div>
  );
}
