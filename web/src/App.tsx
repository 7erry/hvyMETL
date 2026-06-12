import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MongoLogo } from './components/MongoLogo';
import { MigrationArtifactsView } from './components/MigrationArtifactsView';
import { SchemaCanvas, deleteTableFromModel, duplicateTableInModel } from './components/SchemaCanvas';
import { TableDetails } from './components/TableDetails';
import { ResizableSplit } from './components/ResizableSplit';
import { PipelinePanel } from './components/PipelinePanel';
import {
  downloadJson,
  exportMigration,
  exportPrompts,
  fetchDialects,
  fetchProfiles,
  fetchTemplates,
  importDdl,
  importSqlite,
  type DiagramExport,
  type PipelineRunResult,
} from './api';
import {
  defaultSessionState,
  loadSessionState,
  saveSessionState,
  type MigrationArtifacts,
  type SessionState,
} from './sessionState';
import type { Dialect, Profile, SqlStructuralModel } from './types';

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [dialects, setDialects] = useState<Dialect[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; ddl: string; model: SqlStructuralModel }[]>([]);
  const [session, setSession] = useState<SessionState>(loadSessionState);
  const [status, setStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const schemaFileInputRef = useRef<HTMLInputElement>(null);
  const diagramFileInputRef = useRef<HTMLInputElement>(null);

  const {
    profileId,
    dialect,
    ddl,
    model,
    positions,
    snapToGrid,
    selectedTable,
    view,
    migrationArtifacts,
    selectedTemplateId,
    sidebarWidth,
    canvasPanelOpen,
    csvSourcePath,
    relationshipConnectionType,
    relationshipNotation,
  } = session;

  const setSessionField = useCallback(<K extends keyof SessionState>(key: K, value: SessionState[K]) => {
    setSession((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    saveSessionState(session);
  }, [session]);

  useEffect(() => {
    void Promise.all([fetchProfiles(), fetchDialects(), fetchTemplates()]).then(([p, d, t]) => {
      setProfiles(p);
      setDialects(d);
      setTemplates(t);
    });
  }, []);

  const selectedTableModel = useMemo(
    () => model?.tables.find((t) => t.name === selectedTable) ?? null,
    [model, selectedTable],
  );

  const incomingReferences = useMemo(() => {
    if (!model || !selectedTable) return [];
    const refs: { fromTable: string; column: string; referencesColumn: string }[] = [];
    for (const table of model.tables) {
      for (const fk of table.foreignKeys) {
        if (fk.referencesTable === selectedTable) {
          refs.push({
            fromTable: table.name,
            column: fk.column,
            referencesColumn: fk.referencesColumn,
          });
        }
      }
    }
    return refs;
  }, [model, selectedTable]);

  const applySchema = useCallback(async (nextDdl: string, nextModel: SqlStructuralModel) => {
    setSession((prev) => ({
      ...prev,
      ddl: nextDdl,
      model: nextModel,
      positions: {},
      selectedTable: null,
      view: 'diagram',
    }));
    setStatus(`Imported ${nextModel.tables.length} tables.`);
  }, []);

  const handleImportQuery = async (ddlText = ddl) => {
    try {
      setStatus('Importing schema…');
      const { model: m } = await importDdl(ddlText, dialect);
      await applySchema(ddlText, m);
    } catch (e) {
      setStatus(`Import failed: ${String(e)}`);
    }
  };

  const handleDdlFileUpload = async (file: File) => {
    try {
      setStatus(`Reading ${file.name}…`);
      const text = await file.text();
      setSessionField('ddl', text);
      await handleImportQuery(text);
    } catch (e) {
      setStatus(`DDL import failed: ${String(e)}`);
    }
  };

  const handleSqliteUpload = async (file: File) => {
    try {
      setStatus('Reading SQLite database…');
      const { model: m, ddl: d } = await importSqlite(file);
      setSessionField('dialect', 'sqlite');
      await applySchema(d, m);
    } catch (e) {
      setStatus(`SQLite import failed: ${String(e)}`);
    }
  };

  /** Route uploaded schema files to SQLite introspection or DDL parse by extension. */
  const handleSchemaFileUpload = async (file: File) => {
    if (/\.(db|sqlite|sqlite3)$/i.test(file.name)) {
      await handleSqliteUpload(file);
      return;
    }
    await handleDdlFileUpload(file);
  };

  const handleTemplateLoad = async () => {
    const t = templates.find((x) => x.id === selectedTemplateId);
    if (!t) return;
    await applySchema(t.ddl, t.model);
    setStatus(`Loaded ${t.name} template.`);
  };

  const dialectLabel = useMemo(
    () => dialects.find((d) => d.id === dialect)?.label ?? dialect,
    [dialects, dialect],
  );

  const handleDuplicate = (tableName: string) => {
    if (!model) return;
    const { model: next, positions: nextPos } = duplicateTableInModel(model, tableName, positions);
    setSession((prev) => ({
      ...prev,
      model: next,
      positions: nextPos,
      selectedTable: next.tables.find((t) => t.name.startsWith(`${tableName}_copy`))?.name ?? tableName,
    }));
    setStatus(`Duplicated table ${tableName}.`);
  };

  const handleDelete = (tableName: string) => {
    if (!model) return;
    const { model: next, positions: nextPos } = deleteTableFromModel(model, tableName, positions);
    setSession((prev) => ({
      ...prev,
      model: next,
      positions: nextPos,
      selectedTable: prev.selectedTable === tableName ? null : prev.selectedTable,
    }));
    setStatus(`Deleted table ${tableName}.`);
  };

  const handleExportDiagram = () => {
    if (!model) return;
    const payload: DiagramExport = {
      version: 1,
      name: model.source,
      dialect,
      ddl,
      model,
      positions,
      exportedAt: new Date().toISOString(),
    };
    downloadJson(`hvymetl-diagram-${Date.now()}.json`, payload);
    setStatus('Diagram exported.');
  };

  const handleImportDiagram = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as DiagramExport;
        setSession((prev) => ({
          ...prev,
          dialect: data.dialect,
          ddl: data.ddl,
          model: data.model,
          positions: data.positions ?? {},
          selectedTable: null,
          view: 'diagram',
        }));
        setStatus('Diagram imported.');
      } catch (e) {
        setStatus(`Invalid diagram file: ${String(e)}`);
      }
    };
    reader.readAsText(file);
  };

  const handleAiExport = async () => {
    if (!model) return;
    try {
      setExporting(true);
      setStatus('Generating AI-powered migration export…');
      const result = await exportMigration(model, profileId, ddl);
      const promptsResult = await exportPrompts(ddl, profileId);
      const artifacts: MigrationArtifacts = {
        planJson: JSON.stringify(result.migrationPlanJson ?? result.plan, null, 2),
        designReportMarkdown: result.designReportMarkdown ?? '',
        prompts: (promptsResult.prompts ?? []).map((p: { fileName: string; content: string }) => ({
          fileName: p.fileName,
          content: p.content,
        })),
        retrievalStrategy: promptsResult.retrievalStrategy,
        generatedAt: new Date().toISOString(),
      };
      setSession((prev) => ({ ...prev, migrationArtifacts: artifacts, view: 'migration' }));
      setStatus(`Generated migration plan, design report, and ${artifacts.prompts.length} RAG prompts.`);
    } catch (e) {
      setStatus(`Export failed: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  const handlePipelineComplete = (result: PipelineRunResult) => {
    if (result.migrationPlanJson && result.designReportMarkdown) {
      const artifacts: MigrationArtifacts = {
        planJson: JSON.stringify(result.migrationPlanJson, null, 2),
        designReportMarkdown: result.designReportMarkdown,
        prompts: [],
        retrievalStrategy: result.retrievalStrategy,
        generatedAt: new Date().toISOString(),
        pipelineResult: {
          ok: result.ok,
          imports: result.imports.map((i) => ({
            collection: i.collection,
            ok: i.ok,
            insertedCount: i.insertedCount,
            error: i.error,
          })),
          outDir: result.paths.outDir,
        },
      };
      setSession((prev) => ({ ...prev, migrationArtifacts: artifacts }));
    }
    setStatus(result.ok ? 'Full pipeline completed.' : `Pipeline finished with errors: ${result.errors.join('; ')}`);
  };

  const handleClearSession = () => {
    const next = defaultSessionState();
    setSession(next);
    saveSessionState(next);
    setStatus('Session cleared.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.25rem',
          borderBottom: '1px solid #00684A',
          background: '#112733',
        }}
      >
        <MongoLogo />
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select value={profileId} onChange={(e) => setSessionField('profileId', e.target.value)} aria-label="Workload profile">
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {view === 'migration' ? (
            <button type="button" className="ghost" onClick={() => setSessionField('view', 'diagram')}>
              ← Diagram
            </button>
          ) : (
            <>
              <button type="button" className="primary" onClick={() => setPipelineOpen(true)} disabled={!model}>
                Run Full Pipeline
              </button>
              <button type="button" className="primary" onClick={() => void handleAiExport()} disabled={!model || exporting}>
                {exporting ? 'Generating…' : 'AI Migration Export'}
              </button>
            </>
          )}
          <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>CLI: npm run hvymetl</span>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {view === 'diagram' ? (
          <ResizableSplit
            sidebarWidth={sidebarWidth}
            onSidebarWidthChange={(width) => setSessionField('sidebarWidth', width)}
            sidebar={
              <div className="sidebar-scroll">
                <div className="panel" style={{ marginBottom: '0.75rem' }}>
                  <h3>Instant Schema Import</h3>
                  <label style={{ fontSize: '0.8rem' }}>Database dialect</label>
                  <select
                    value={dialect}
                    onChange={(e) => setSessionField('dialect', e.target.value)}
                    style={{ width: '100%', marginBottom: '0.5rem' }}
                  >
                    {dialects.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                        {!d.live ? ' (DDL paste)' : ''}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={ddl}
                    onChange={(e) => setSessionField('ddl', e.target.value)}
                    placeholder="Paste one CREATE TABLE query or full DDL script…"
                    rows={8}
                  />
                  <div className="button-row">
                    <button type="button" className="primary" onClick={() => void handleImportQuery()}>
                      Import Query
                    </button>
                    <button type="button" className="primary" onClick={() => schemaFileInputRef.current?.click()}>
                      Import file
                    </button>
                    <input
                      ref={schemaFileInputRef}
                      type="file"
                      accept=".sql,.ddl,.txt,.db,.sqlite,.sqlite3"
                      hidden
                      aria-hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleSchemaFileUpload(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                </div>

                <div className="panel" style={{ marginBottom: '0.75rem' }}>
                  <h3>Templates</h3>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSessionField('selectedTemplateId', e.target.value)}
                    style={{ width: '100%', marginBottom: '0.5rem' }}
                    aria-label="Schema template"
                  >
                    <option value="">Choose a template…</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="primary block"
                    onClick={() => void handleTemplateLoad()}
                    disabled={!selectedTemplateId}
                  >
                    Load template
                  </button>
                </div>

                {selectedTableModel && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <TableDetails
                      table={selectedTableModel}
                      incoming={incomingReferences}
                      onClose={() => setSessionField('selectedTable', null)}
                      onDuplicate={handleDuplicate}
                      onDelete={handleDelete}
                    />
                  </div>
                )}

                <details
                  className="panel panel-dropdown"
                  open={canvasPanelOpen}
                  onToggle={(e) => setSessionField('canvasPanelOpen', e.currentTarget.open)}
                  style={{ marginBottom: '0.75rem' }}
                >
                  <summary className="panel-dropdown__summary">Canvas</summary>
                  <div className="panel-dropdown__body">
                    <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={snapToGrid}
                        onChange={(e) => setSessionField('snapToGrid', e.target.checked)}
                      />
                      Snap to grid (hold Shift for free move)
                    </label>
                    {model && (
                      <ul className="canvas-table-list">
                        {model.tables.map((t) => (
                          <li
                            key={t.name}
                            className={selectedTable === t.name ? 'selected' : ''}
                            onClick={() => setSessionField('selectedTable', t.name)}
                          >
                            <span>{t.name}</span>
                            <button
                              type="button"
                              className="ghost"
                              style={{ padding: '0 0.35rem' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicate(t.name);
                              }}
                              title="Duplicate"
                            >
                              ⧉
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>

                <div className="panel" style={{ marginBottom: '0.75rem' }}>
                  <h3>Share Diagram</h3>
                  <div className="button-row column">
                    <button type="button" className="primary block" onClick={handleExportDiagram} disabled={!model}>
                      Export diagram JSON
                    </button>
                    <button type="button" className="primary block" onClick={() => diagramFileInputRef.current?.click()}>
                      Import diagram JSON
                    </button>
                    <input
                      ref={diagramFileInputRef}
                      type="file"
                      accept=".json"
                      hidden
                      aria-hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImportDiagram(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                </div>

                <div className="panel">
                  <h3>Session</h3>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', opacity: 0.8 }}>
                    Your work is saved in this browser tab. Refreshing keeps schema, layout, and migration artifacts.
                  </p>
                  <button type="button" className="primary block" onClick={handleClearSession}>
                    Clear session
                  </button>
                </div>
              </div>
            }
            main={
              <>
                <SchemaCanvas
                  model={model}
                  snapToGrid={snapToGrid}
                  connectionType={relationshipConnectionType}
                  relationshipNotation={relationshipNotation}
                  onConnectionTypeChange={(type) => setSessionField('relationshipConnectionType', type)}
                  onRelationshipNotationChange={(notation) => setSessionField('relationshipNotation', notation)}
                  onPositionsChange={(p) => setSessionField('positions', p)}
                  positions={positions}
                  onDuplicateTable={handleDuplicate}
                  selectedTable={selectedTable}
                  onSelectTable={(name) => setSessionField('selectedTable', name)}
                />
                <footer style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderTop: '1px solid #00684A', background: '#112733' }}>
                  {status || 'Ready — session persists on refresh. Broad database support via DDL import.'}
                </footer>
              </>
            }
          />
        ) : (
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {migrationArtifacts ? (
              <MigrationArtifactsView
                artifacts={migrationArtifacts}
                onChange={(next) => setSessionField('migrationArtifacts', next)}
                onBack={() => setSessionField('view', 'diagram')}
              />
            ) : null}
            <footer style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderTop: '1px solid #00684A', background: '#112733' }}>
              {status || 'Ready — session persists on refresh. Broad database support via DDL import.'}
            </footer>
          </main>
        )}
      </div>

      {model ? (
        <PipelinePanel
          open={pipelineOpen}
          onClose={() => setPipelineOpen(false)}
          model={model}
          ddl={ddl}
          profileId={profileId}
          dialect={dialect}
          dialectLabel={dialectLabel}
          csvSourcePath={csvSourcePath}
          onCsvSourcePathChange={(path) => setSessionField('csvSourcePath', path)}
          onComplete={handlePipelineComplete}
        />
      ) : null}
    </div>
  );
}
