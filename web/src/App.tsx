import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MongoLogo } from './components/MongoLogo';
import { MigrationArtifactsView } from './components/MigrationArtifactsView';
import { SchemaCanvas, deleteTableFromModel, duplicateTableInModel } from './components/SchemaCanvas';
import { MongoSchemaCanvas } from './components/MongoSchemaCanvas';
import { TableDetails } from './components/TableDetails';
import { CollectionDetails } from './components/CollectionDetails';
import { TransformationSummaryPanel } from './components/TransformationSummaryPanel';
import { PipelineHistoryPanel } from './components/PipelineHistoryPanel';
import { SchemaPhaseToggle } from './components/SchemaPhaseToggle';
import type { SchemaPhase } from './components/SchemaPhaseToggle';
import { ResizableSplit } from './components/ResizableSplit';
import { PipelinePanel } from './components/PipelinePanel';
import { CustomTelemetryModal } from './components/CustomTelemetryModal';
import { profileRequestBody } from './customProfileShared';
import {
  downloadJson,
  exportMigration,
  exportPrompts,
  fetchDialects,
  fetchProfiles,
  fetchTemplates,
  importDdl,
  importSqlite,
  runDesign,
  runDesignWithCsv,
  explainDesignTransformation,
  type DesignMeta,
  type DiagramExport,
  type MongoDiagramExport,
  type PipelineRunResult,
  inferProfile,
  type ProfileInference,
} from './api';
import {
  defaultSessionState,
  loadSessionState,
  saveSessionState,
  type MigrationArtifacts,
  type SessionState,
} from './sessionState';
import {
  fieldsForCollection,
  designMetaFromPlan,
  formatTransformSummary,
  initialCollectionPositions,
  parseMigrationPlan,
} from './migrationPlanDisplay';
import { pickCsvDirectory } from './directoryPicker';
import type { CollectionPlan, MigrationPlan } from './migrationPlanTypes';
import type { PipelineExecutionDetail } from './transformationSummaryTypes';
import type { Dialect, Profile, SqlStructuralModel } from './types';

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [dialects, setDialects] = useState<Dialect[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; ddl: string; model: SqlStructuralModel; inferred?: ProfileInference }[]>([]);
  const [session, setSession] = useState<SessionState>(loadSessionState);
  const [status, setStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const [designingPlan, setDesigningPlan] = useState(false);
  const [explainingSummary, setExplainingSummary] = useState(false);
  const [designCsvFiles, setDesignCsvFiles] = useState<File[]>([]);
  const [designCsvLabel, setDesignCsvLabel] = useState<string | null>(null);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [customTelemetryOpen, setCustomTelemetryOpen] = useState(false);
  const schemaFileInputRef = useRef<HTMLInputElement>(null);
  const diagramFileInputRef = useRef<HTMLInputElement>(null);
  const mongoDiagramFileInputRef = useRef<HTMLInputElement>(null);

  const {
    profileId,
    dialect,
    ddl,
    model,
    positions,
    collectionPositions,
    snapToGrid,
    selectedTable,
    selectedCollection,
    schemaPhase,
    view,
    migrationArtifacts,
    selectedTemplateId,
    sidebarWidth,
    canvasPanelOpen,
    csvSourcePath,
    relationshipConnectionType,
    relationshipNotation,
    customProfile,
    customTelemetryInput,
  } = session;

  const profileFields = useMemo(
    () => profileRequestBody(profileId, customProfile),
    [profileId, customProfile],
  );

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

  const migrationPlan = useMemo(
    () => parseMigrationPlan(migrationArtifacts?.planJson),
    [migrationArtifacts?.planJson],
  );

  const selectedCollectionPlan = useMemo(
    () => migrationPlan?.collections.find((c) => c.name === selectedCollection) ?? null,
    [migrationPlan, selectedCollection],
  );

  const selectedCollectionFields = useMemo(
    () => (selectedCollectionPlan ? fieldsForCollection(selectedCollectionPlan) : []),
    [selectedCollectionPlan],
  );

  const effectiveCollectionPositions = useMemo(() => {
    if (!migrationPlan) return collectionPositions;
    return initialCollectionPositions(migrationPlan, positions, collectionPositions);
  }, [migrationPlan, positions, collectionPositions]);

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

  const applySchema = useCallback(async (nextDdl: string, nextModel: SqlStructuralModel, inferredProfileId?: string) => {
    setSession((prev) => ({
      ...prev,
      ddl: nextDdl,
      model: nextModel,
      profileId: inferredProfileId ?? prev.profileId,
      positions: {},
      collectionPositions: {},
      selectedTable: null,
      selectedCollection: null,
      migrationArtifacts: null,
      schemaPhase: 'before',
      view: 'diagram',
    }));
    const profileLabel = profiles.find((p) => p.id === inferredProfileId)?.label;
    if (inferredProfileId && profileLabel) {
      setStatus(`Imported ${nextModel.tables.length} tables. Workload profile: ${profileLabel} (auto-detected).`);
    } else {
      setStatus(`Imported ${nextModel.tables.length} tables.`);
    }
  }, [profiles]);

  const handleImportQuery = async (ddlText = ddl) => {
    try {
      setStatus('Importing schema…');
      const { model: m, inferred } = await importDdl(ddlText, dialect);
      await applySchema(ddlText, m, inferred?.profileId);
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
      const { model: m, ddl: d, inferred } = await importSqlite(file);
      setSessionField('dialect', 'sqlite');
      await applySchema(d, m, inferred?.profileId);
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
    await applySchema(t.ddl, t.model, t.inferred?.profileId);
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
    setStatus('SQL diagram exported.');
  };

  const handleExportMongoDiagram = () => {
    if (!migrationPlan || !migrationArtifacts?.planJson) return;
    const payload: MongoDiagramExport = {
      version: 1,
      phase: 'after',
      name: migrationPlan.source,
      dialect,
      profileId: migrationPlan.profileId,
      plan: migrationPlan,
      collectionPositions: effectiveCollectionPositions,
      designMeta: migrationArtifacts.designMeta,
      designReportMarkdown: migrationArtifacts.designReportMarkdown,
      retrievalStrategy: migrationArtifacts.retrievalStrategy,
      ddl: ddl || undefined,
      model: model ?? undefined,
      exportedAt: new Date().toISOString(),
    };
    downloadJson(`hvymetl-mongo-diagram-${Date.now()}.json`, payload);
    setStatus('MongoDB diagram exported.');
  };

  const handleImportDiagram = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        try {
          const data = JSON.parse(String(reader.result)) as DiagramExport;
          const inferred = await inferProfile(data.model);
          setSession((prev) => ({
            ...prev,
            dialect: data.dialect,
            ddl: data.ddl,
            model: data.model,
            profileId: inferred.profileId,
            positions: data.positions ?? {},
            selectedTable: null,
            view: 'diagram',
          }));
          setStatus(`Diagram imported. Workload profile: ${inferred.label} (auto-detected).`);
        } catch (e) {
          setStatus(`Invalid diagram file: ${String(e)}`);
        }
      })();
    };
    reader.readAsText(file);
  };

  const handleImportMongoDiagram = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as MongoDiagramExport;
        if (data.version !== 1 || data.phase !== 'after' || !data.plan?.collections?.length) {
          throw new Error('Not a valid MongoDB diagram export (version 1, phase after, plan required).');
        }
        const planJson = JSON.stringify(data.plan, null, 2);
        setSession((prev) => ({
          ...prev,
          dialect: data.dialect ?? prev.dialect,
          ddl: data.ddl ?? prev.ddl,
          model: data.model ?? prev.model,
          profileId: data.profileId ?? data.plan.profileId ?? prev.profileId,
          collectionPositions: data.collectionPositions ?? {},
          selectedCollection: null,
          schemaPhase: 'after',
          view: 'diagram',
          migrationArtifacts: {
            planJson,
            designReportMarkdown: data.designReportMarkdown ?? '',
            prompts: prev.migrationArtifacts?.prompts ?? [],
            retrievalStrategy: data.retrievalStrategy ?? prev.migrationArtifacts?.retrievalStrategy,
            designMeta: data.designMeta,
            generatedAt: new Date().toISOString(),
            repositories: prev.migrationArtifacts?.repositories,
            pipelineResult: prev.migrationArtifacts?.pipelineResult,
          },
        }));
        const summary = data.designMeta
          ? formatTransformSummary(data.designMeta)
          : `${data.plan.collections.length} MongoDB collections`;
        setStatus(`MongoDB diagram imported · ${summary}.`);
      } catch (e) {
        setStatus(`Invalid MongoDB diagram file: ${String(e)}`);
      }
    };
    reader.readAsText(file);
  };

  const handleRefreshExplanation = async () => {
    if (!model || !migrationPlan) return;
    try {
      setExplainingSummary(true);
      const summary = await explainDesignTransformation({
        model,
        ddl,
        dialect,
        ...profileFields,
        plan: migrationPlan,
        csvSourcePath:
          designCsvFiles.length === 0 && csvSourcePath?.trim() ? csvSourcePath.trim() : undefined,
      });
      setSession((prev) => ({
        ...prev,
        migrationArtifacts: prev.migrationArtifacts
          ? { ...prev.migrationArtifacts, transformationSummary: summary }
          : null,
      }));
      setStatus('Transformation summary updated.');
    } catch (e) {
      setStatus(`Explain failed: ${String(e)}`);
    } finally {
      setExplainingSummary(false);
    }
  };

  const handleLoadPipelineExecution = (execution: PipelineExecutionDetail) => {
    const plan = execution.migrationPlan as MigrationPlan;
    const artifacts: MigrationArtifacts = {
      planJson: JSON.stringify(plan, null, 2),
      designReportMarkdown: execution.designReport,
      prompts: [],
      retrievalStrategy: execution.retrievalStrategy,
      generatedAt: execution.completedAt,
      designMeta: model ? designMetaFromPlan(model, plan) : undefined,
      pipelineResult: {
        ok: execution.ok,
        imports: execution.imports.map((entry) => ({
          collection: entry.collection,
          ok: entry.ok,
          insertedCount: entry.insertedCount,
          error: entry.error,
        })),
        outDir: execution.outDir,
      },
    };
    setSession((prev) => ({
      ...prev,
      migrationArtifacts: artifacts,
      schemaPhase: 'after',
      selectedCollection: null,
      collectionPositions: initialCollectionPositions(plan, prev.positions, {}),
    }));
    setStatus(`Loaded pipeline run ${execution.executionId}.`);
    if (model) {
      void explainDesignTransformation({
        model,
        ddl,
        dialect,
        ...profileFields,
        plan,
      }).then((summary) => {
        setSession((prev) => ({
          ...prev,
          migrationArtifacts: prev.migrationArtifacts
            ? { ...prev.migrationArtifacts, transformationSummary: summary }
            : null,
        }));
      });
    }
  };

  const handleGeneratePlan = async () => {
    if (!model) return;
    try {
      setDesigningPlan(true);
      setStatus('Running ML/RAG design engine for MongoDB schema…');
      const designRequest = {
        model,
        ddl,
        dialect,
        ...profileFields,
        csvSourcePath:
          designCsvFiles.length === 0 && csvSourcePath?.trim() ? csvSourcePath.trim() : undefined,
      };
      const result =
        designCsvFiles.length > 0
          ? await runDesignWithCsv(designCsvFiles, designRequest)
          : await runDesign(designRequest);
      const planJson = JSON.stringify(result.plan, null, 2);
      const meta = result.designMeta as DesignMeta;
      setSession((prev) => ({
        ...prev,
        migrationArtifacts: {
          planJson,
          designReportMarkdown: result.designReport ?? prev.migrationArtifacts?.designReportMarkdown ?? '',
          prompts: prev.migrationArtifacts?.prompts ?? [],
          retrievalStrategy: result.retrievalStrategy ?? prev.migrationArtifacts?.retrievalStrategy,
          designMeta: meta,
          transformationSummary: result.transformationSummary,
          generatedAt: new Date().toISOString(),
          repositories: prev.migrationArtifacts?.repositories,
          pipelineResult: prev.migrationArtifacts?.pipelineResult,
          apiArtifacts: result.apiArtifacts ?? prev.migrationArtifacts?.apiArtifacts,
        },
        collectionPositions: initialCollectionPositions(
          result.plan as { collections: CollectionPlan[] },
          prev.positions,
          {},
        ),
        selectedCollection: null,
        schemaPhase: 'after',
      }));
      const summary = formatTransformSummary(meta);
      if (!meta.hasRowStats) {
        setStatus(
          `${summary}. Add CSV exports (or import a .db file) so embed/subset/bucket patterns can fold tables.`,
        );
      } else {
        setStatus(`${summary}. ${meta.csvEnriched ? 'CSV-enriched' : 'Introspection stats'} · ${result.retrievalStrategy ?? 'RAG'}.`);
      }
    } catch (e) {
      setStatus(`Design failed: ${String(e)}`);
    } finally {
      setDesigningPlan(false);
    }
  };

  const handlePickDesignCsv = async () => {
    try {
      const pick = await pickCsvDirectory();
      if (!pick) return;
      setDesignCsvFiles(pick.files);
      setDesignCsvLabel(pick.label);
      setStatus(`Selected ${pick.files.length} CSV file(s) from ${pick.label} for design enrichment.`);
    } catch (e) {
      setStatus(`CSV folder pick failed: ${String(e)}`);
    }
  };

  const handleSchemaPhaseChange = (phase: SchemaPhase) => {
    setSessionField('schemaPhase', phase);
    if (phase === 'after' && model && (!migrationPlan || !migrationArtifacts?.designMeta)) {
      void handleGeneratePlan();
    }
  };

  const handlePlanJsonChange = (planJson: string) => {
    setSession((prev) => ({
      ...prev,
      migrationArtifacts: {
        planJson,
        designReportMarkdown: prev.migrationArtifacts?.designReportMarkdown ?? '',
        prompts: prev.migrationArtifacts?.prompts ?? [],
        retrievalStrategy: prev.migrationArtifacts?.retrievalStrategy,
        generatedAt: prev.migrationArtifacts?.generatedAt ?? new Date().toISOString(),
        repositories: prev.migrationArtifacts?.repositories,
        pipelineResult: prev.migrationArtifacts?.pipelineResult,
      },
    }));
  };

  const handleAiExport = async () => {
    if (!model) return;
    try {
      setExporting(true);
      setStatus('Generating AI-powered migration export…');
      const result = await exportMigration(model, profileFields, ddl);
      const promptsResult = await exportPrompts(ddl, profileFields);
      const artifacts: MigrationArtifacts = {
        planJson: JSON.stringify(result.migrationPlanJson ?? result.plan, null, 2),
        designReportMarkdown: result.designReportMarkdown ?? '',
        prompts: (promptsResult.prompts ?? []).map((p: { fileName: string; content: string }) => ({
          fileName: p.fileName,
          content: p.content,
        })),
        retrievalStrategy: promptsResult.retrievalStrategy,
        generatedAt: new Date().toISOString(),
        apiArtifacts: result.apiArtifacts ?? undefined,
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
      const plan = result.migrationPlanJson as MigrationPlan;
      const meta = model ? designMetaFromPlan(model, plan) : undefined;
      const artifacts: MigrationArtifacts = {
        planJson: JSON.stringify(result.migrationPlanJson, null, 2),
        designReportMarkdown: result.designReportMarkdown,
        prompts: [],
        retrievalStrategy: result.retrievalStrategy,
        designMeta: meta,
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
        apiArtifacts: result.apiArtifacts ?? undefined,
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
          <select
            value={profileId}
            onChange={(e) => {
              const next = e.target.value;
              setSessionField('profileId', next);
              if (next === 'custom' && !customProfile) {
                setCustomTelemetryOpen(true);
              }
            }}
            aria-label="Workload profile"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom Workload</option>
          </select>
          <button type="button" className="ghost" onClick={() => setCustomTelemetryOpen(true)}>
            Custom telemetry
          </button>
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
                {schemaPhase === 'before' ? (
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
                ) : (
                  <div className="panel" style={{ marginBottom: '0.75rem' }}>
                    <h3>MongoDB Target Schema</h3>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', opacity: 0.85 }}>
                      AI/RAG migration plan — collections, embeds, indexes, and pattern decisions before Atlas import.
                    </p>
                    <p className="pipeline-hint" style={{ margin: '0 0 0.5rem' }}>
                      Export SQL table data as CSV so row counts and relationship cardinality drive embed, subset, and
                      bucket folding. SQLite .db imports include stats automatically.
                    </p>
                    <div className="button-row" style={{ marginBottom: '0.5rem' }}>
                      <button type="button" className="ghost" onClick={() => void handlePickDesignCsv()}>
                        Choose CSV folder
                      </button>
                    </div>
                    {designCsvLabel && designCsvFiles.length > 0 ? (
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', opacity: 0.85 }}>
                        {designCsvLabel} · {designCsvFiles.length} file(s)
                      </p>
                    ) : csvSourcePath ? (
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', opacity: 0.85 }}>
                        Server CSV path: {csvSourcePath}
                      </p>
                    ) : null}
                    <textarea
                      value={migrationArtifacts?.planJson ?? ''}
                      onChange={(e) => handlePlanJsonChange(e.target.value)}
                      placeholder="Run design to generate migration-plan.json…"
                      rows={10}
                      spellCheck={false}
                    />
                    <div className="button-row">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => void handleGeneratePlan()}
                        disabled={!model || designingPlan}
                      >
                        {designingPlan ? 'Designing…' : 'Refresh design'}
                      </button>
                      {migrationPlan ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            downloadJson('migration-plan.json', JSON.parse(migrationArtifacts!.planJson))
                          }
                        >
                          Download plan
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}

                {schemaPhase === 'after' ? (
                  <TransformationSummaryPanel
                    summary={migrationArtifacts?.transformationSummary ?? null}
                    onRefresh={() => void handleRefreshExplanation()}
                    refreshing={explainingSummary}
                  />
                ) : null}

                {schemaPhase === 'before' ? (
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
                ) : null}

                {schemaPhase === 'before' && selectedTableModel && (
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

                {schemaPhase === 'after' && selectedCollectionPlan && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <CollectionDetails
                      collection={selectedCollectionPlan}
                      fields={selectedCollectionFields}
                      onClose={() => setSessionField('selectedCollection', null)}
                    />
                  </div>
                )}

                <details
                  className="panel panel-dropdown"
                  open={canvasPanelOpen}
                  onToggle={(e) => setSessionField('canvasPanelOpen', e.currentTarget.open)}
                  style={{ marginBottom: '0.75rem' }}
                >
                  <summary className="panel-dropdown__summary">
                    Canvas · {schemaPhase === 'before' ? 'SQL tables' : 'MongoDB collections'}
                  </summary>
                  <div className="panel-dropdown__body">
                    <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={snapToGrid}
                        onChange={(e) => setSessionField('snapToGrid', e.target.checked)}
                      />
                      Snap to grid (hold Shift for free move)
                    </label>
                    {schemaPhase === 'before' && model && (
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
                    {schemaPhase === 'after' && migrationPlan && (
                      <ul className="canvas-table-list">
                        {migrationPlan.collections.map((c) => (
                          <li
                            key={c.name}
                            className={selectedCollection === c.name ? 'selected' : ''}
                            onClick={() => setSessionField('selectedCollection', c.name)}
                          >
                            <span>{c.name}</span>
                            <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>{c.sourceTable}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>

                {schemaPhase === 'before' ? (
                  <div className="panel" style={{ marginBottom: '0.75rem' }}>
                    <h3>Share Diagram</h3>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', opacity: 0.85 }}>
                      Export or import SQL table layout and positions.
                    </p>
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
                ) : (
                  <div className="panel" style={{ marginBottom: '0.75rem' }}>
                    <h3>Share Diagram</h3>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', opacity: 0.85 }}>
                      Export or import MongoDB collection layout, migration plan, and canvas positions.
                    </p>
                    <div className="button-row column">
                      <button
                        type="button"
                        className="primary block"
                        onClick={handleExportMongoDiagram}
                        disabled={!migrationPlan}
                      >
                        Export diagram JSON
                      </button>
                      <button
                        type="button"
                        className="primary block"
                        onClick={() => mongoDiagramFileInputRef.current?.click()}
                      >
                        Import diagram JSON
                      </button>
                      <input
                        ref={mongoDiagramFileInputRef}
                        type="file"
                        accept=".json"
                        hidden
                        aria-hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImportMongoDiagram(f);
                          e.target.value = '';
                        }}
                      />
                    </div>
                  </div>
                )}

                <PipelineHistoryPanel onLoadExecution={handleLoadPipelineExecution} />

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
                <div className="schema-phase-bar">
                  <SchemaPhaseToggle
                    phase={schemaPhase}
                    onChange={handleSchemaPhaseChange}
                    hasAfter={Boolean(migrationPlan)}
                  />
                  {schemaPhase === 'after' && migrationPlan ? (
                    <span className="schema-phase-bar__meta">
                      {migrationArtifacts?.designMeta
                        ? formatTransformSummary(migrationArtifacts.designMeta)
                        : `${migrationPlan.collections.length} collections`}
                      {' · '}
                      profile {migrationPlan.profileId}
                      {migrationArtifacts?.designMeta && !migrationArtifacts.designMeta.hasRowStats ? (
                        <span className="schema-phase-bar__warn"> · add CSV for folding</span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
                {schemaPhase === 'before' ? (
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
                ) : (
                  <MongoSchemaCanvas
                    plan={migrationPlan}
                    snapToGrid={snapToGrid}
                    connectionType={relationshipConnectionType}
                    relationshipNotation={relationshipNotation}
                    onConnectionTypeChange={(type) => setSessionField('relationshipConnectionType', type)}
                    onRelationshipNotationChange={(notation) => setSessionField('relationshipNotation', notation)}
                    onPositionsChange={(p) => setSessionField('collectionPositions', p)}
                    positions={effectiveCollectionPositions}
                    selectedCollection={selectedCollection}
                    onSelectCollection={(name) => setSessionField('selectedCollection', name)}
                    onGeneratePlan={() => void handleGeneratePlan()}
                    generating={designingPlan}
                  />
                )}
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
          profileFields={profileFields}
          dialect={dialect}
          dialectLabel={dialectLabel}
          csvSourcePath={csvSourcePath}
          onCsvSourcePathChange={(path) => setSessionField('csvSourcePath', path)}
          onComplete={handlePipelineComplete}
        />
      ) : null}

      <CustomTelemetryModal
        open={customTelemetryOpen}
        initial={customTelemetryInput}
        onClose={() => setCustomTelemetryOpen(false)}
        onApply={(profile, input) => {
          setSession((prev) => ({
            ...prev,
            profileId: 'custom',
            customProfile: profile,
            customTelemetryInput: input,
          }));
          setStatus(
            `Custom profile: ${profile.telemetry.readPercent}:${profile.telemetry.writePercent} R:W, readPreference=${profile.readPreference}, compression=${profile.compression}.`,
          );
        }}
      />
    </div>
  );
}
