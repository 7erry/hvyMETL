import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MongoLogo } from './components/MongoLogo';
import { CopyButton } from './components/CopyButton';
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
import { ManagerView } from './components/ManagerView';
import { SchemaImportPanel } from './components/SchemaImportPanel';
import { SchemaImportModal } from './components/SchemaImportModal';
import { DiagramStatusFooter } from './components/DiagramStatusFooter';
import { FooterDiagramLegend } from './components/FooterDiagramLegend';
import { CollapsiblePanel } from './components/CollapsiblePanel';
import { edgesForPlan } from './migrationPlanDisplay';
import { CardinalityOverridesPanel } from './components/CardinalityOverridesPanel';
import { AuthGate } from './components/AuthGate';
import { FALLBACK_DIALECTS } from './dialectConstants';
import { RoleToggle } from './components/RoleToggle';
import { useAccess } from './auth/HostedAuthProvider';
import { profileRequestBody } from './customProfileShared';
import { emptyModelTokenUsage, mergeModelTokenUsage } from './modelUsage';
import {
  applyCardinalityOverrides,
  pruneCardinalityOverrides,
  pruneForceEmbedOverrides,
} from './cardinalityOverrides';
import {
  downloadJson,
  downloadText,
  checkApiHealth,
  exportMigration,
  exportPrompts,
  fetchDialects,
  fetchProfiles,
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
  fetchWorkspace,
  saveWorkspace,
  describeApiError,
  openSwaggerUi,
} from './api';
import {
  defaultSessionState,
  loadSessionState,
  saveSessionState,
  type MigrationArtifacts,
  type SessionState,
} from './sessionState';
import { mergeWorkspaceIntoSession, sessionToWorkspace } from './workspaceSync';
import {
  fieldsForCollection,
  designMetaFromPlan,
  formatTransformSummary,
  initialCollectionPositions,
  parseMigrationPlan,
} from './migrationPlanDisplay';
import { layoutSqlModel } from './graphLayout';
import { pickCsvDirectory } from './directoryPicker';
import type { CollectionPlan, MigrationPlan } from './migrationPlanTypes';
import type { PipelineExecutionDetail } from './transformationSummaryTypes';
import type { Dialect, Profile, SqlStructuralModel } from './types';

export default function App() {
  const access = useAccess();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [dialects, setDialects] = useState<Dialect[]>(FALLBACK_DIALECTS);
  const [apiConnected, setApiConnected] = useState(true);
  const [session, setSession] = useState<SessionState>(loadSessionState);
  const [status, setStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const [designingPlan, setDesigningPlan] = useState(false);
  const [explainingSummary, setExplainingSummary] = useState(false);
  const [designCsvFiles, setDesignCsvFiles] = useState<File[]>([]);
  const [designCsvLabel, setDesignCsvLabel] = useState<string | null>(null);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [customTelemetryOpen, setCustomTelemetryOpen] = useState(false);
  const [schemaImportModalOpen, setSchemaImportModalOpen] = useState(() => !session.model);
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
    sidebarWidth,
    canvasPanelOpen,
    csvSourcePath,
    relationshipConnectionType,
    relationshipNotation,
    customProfile,
    customTelemetryInput,
    uiRole,
    managerReviewAcceptances,
    managerCostInputs,
    cardinalityOverrides,
    forceEmbedOverrides,
  } = session;

  const profileFields = useMemo(
    () => profileRequestBody(profileId, customProfile),
    [profileId, customProfile],
  );

  const setSessionField = useCallback(<K extends keyof SessionState>(key: K, value: SessionState[K]) => {
    setSession((prev) => ({ ...prev, [key]: value }));
  }, []);

  const designModel = useMemo(
    () => (model ? applyCardinalityOverrides(model, cardinalityOverrides, forceEmbedOverrides) : null),
    [model, cardinalityOverrides, forceEmbedOverrides],
  );
  const hasCardinalityOverrides = useMemo(
    () => Object.keys(cardinalityOverrides).length > 0 || Object.keys(forceEmbedOverrides).length > 0,
    [cardinalityOverrides, forceEmbedOverrides],
  );

  const handleCardinalityOverridesChange = (
    overrides: SessionState['cardinalityOverrides'],
    nextForceEmbedOverrides = forceEmbedOverrides,
  ) => {
    setSession((prev) => ({
      ...prev,
      cardinalityOverrides: overrides,
      forceEmbedOverrides: nextForceEmbedOverrides,
      migrationArtifacts: null,
      collectionPositions: {},
      selectedCollection: null,
      managerReviewAcceptances: null,
      schemaPhase: 'before',
    }));
    const count = Object.keys(overrides).length + Object.keys(nextForceEmbedOverrides).length;
    setStatus(
      count > 0
        ? `Applied ${count} developer embed override${count === 1 ? '' : 's'}. Run design to regenerate embeds.`
        : 'Cleared developer embed overrides. Run design to regenerate the migration plan.',
    );
  };

  useEffect(() => {
    if (!access.apiReady) return;
    const params = new URLSearchParams(window.location.search);
    const openSwagger = params.get('openSwagger')?.trim();
    if (!openSwagger) return;

    params.delete('openSwagger');
    const remainder = params.toString();
    const nextPath = remainder ? `${window.location.pathname}?${remainder}` : window.location.pathname;
    window.history.replaceState({}, '', nextPath);

    const docsPath = openSwagger.startsWith('/') ? openSwagger : `/${openSwagger}`;
    void openSwaggerUi(docsPath).catch((error) => {
      setStatus(describeApiError(error));
    });
  }, [access.apiReady]);

  useEffect(() => {
    if (access.isLoading) return;
    let cancelled = false;
    const local = loadSessionState(access.userId);
    setSession(local);
    if (access.enabled && access.isAuthenticated) {
      void fetchWorkspace()
        .then((workspace) => {
          if (cancelled || !workspace || Object.keys(workspace).length === 0) return;
          setSession((prev) => mergeWorkspaceIntoSession(prev, workspace));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [access.userId, access.enabled, access.isAuthenticated, access.isLoading]);

  useEffect(() => {
    saveSessionState(session, access.userId);
    if (!access.enabled || !access.isAuthenticated || access.isLoading) return;
    const handle = window.setTimeout(() => {
      void saveWorkspace(sessionToWorkspace(session)).catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(handle);
  }, [session, access.userId, access.enabled, access.isAuthenticated, access.isLoading]);

  useEffect(() => {
    if (!access.enabled || access.isLoading || !access.isAuthenticated) return;
    if (access.isAdmin) return;
    if (uiRole === 'developer' && !access.canUseDeveloper) {
      setSessionField('uiRole', access.preferredRole);
    } else if (uiRole === 'manager' && !access.canUseManager) {
      setSessionField('uiRole', access.preferredRole);
    }
  }, [
    access.canUseDeveloper,
    access.canUseManager,
    access.enabled,
    access.isAdmin,
    access.isAuthenticated,
    access.isLoading,
    access.preferredRole,
    setSessionField,
    uiRole,
  ]);

  useEffect(() => {
    const needsAuth = access.serverAuthRequired || access.enabled;
    if (needsAuth && !access.apiReady) return;

    void (async () => {
      const healthy = await checkApiHealth();
      setApiConnected(healthy);
      if (!healthy) {
        setDialects(FALLBACK_DIALECTS);
        setStatus(
          access.enabled
            ? 'API health check failed. Confirm the hvyMETL server is running.'
            : 'API health check failed — using offline dialect list. Run npm run dev:ui from the repo root.',
        );
        return;
      }
      try {
        const [p, d] = await Promise.all([fetchProfiles(), fetchDialects()]);
        setProfiles(p);
        setDialects(d);
      } catch (e) {
        setDialects(FALLBACK_DIALECTS);
        const message = describeApiError(e);
        const authFailure = /401|403|authentication required|forbidden/i.test(message);
        if (authFailure && needsAuth) {
          setApiConnected(true);
          setStatus('Sign in required to load server profiles and dialects.');
          return;
        }
        setApiConnected(false);
        setStatus(
          needsAuth
            ? `Cannot reach hvyMETL API (${message}).`
            : `Cannot reach hvyMETL API (${message}). Run npm run dev:ui from the repo root and open http://localhost:3847`,
        );
      }
    })();
  }, [access.apiReady, access.enabled, access.serverAuthRequired]);

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
      positions: layoutSqlModel(nextModel),
      collectionPositions: {},
      selectedTable: null,
      selectedCollection: null,
      migrationArtifacts: null,
      managerReviewAcceptances: null,
      cardinalityOverrides: {},
      forceEmbedOverrides: {},
      schemaPhase: 'before',
      view: 'diagram',
    }));
    const profileLabel = profiles.find((p) => p.id === inferredProfileId)?.label;
    if (inferredProfileId && profileLabel) {
      setStatus(`Imported ${nextModel.tables.length} tables. Workload profile: ${profileLabel} (auto-detected).`);
    } else {
      setStatus(`Imported ${nextModel.tables.length} tables.`);
    }
    setSchemaImportModalOpen(false);
  }, [profiles]);

  const handleImportQuery = async (ddlText = ddl) => {
    try {
      setStatus('Importing schema…');
      const { model: m, inferred } = await importDdl(ddlText, dialect);
      await applySchema(ddlText, m, inferred?.profileId);
    } catch (e) {
      setStatus(`Import failed: ${describeApiError(e)}`);
    }
  };

  const handleDdlFileUpload = async (file: File) => {
    try {
      setStatus(`Reading ${file.name}…`);
      const text = await file.text();
      setSessionField('ddl', text);
      await handleImportQuery(text);
    } catch (e) {
      setStatus(`DDL import failed: ${describeApiError(e)}`);
    }
  };

  const handleSqliteUpload = async (file: File) => {
    try {
      setStatus('Reading SQLite database…');
      const { model: m, ddl: d, inferred } = await importSqlite(file);
      setSessionField('dialect', 'sqlite');
      await applySchema(d, m, inferred?.profileId);
    } catch (e) {
      setStatus(`SQLite import failed: ${describeApiError(e)}`);
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

  const profileInfo = useMemo(() => {
    if (profileId === 'custom' && customProfile) {
      return {
        label: customProfile.label,
        readPercent: customProfile.telemetry.readPercent,
        writePercent: customProfile.telemetry.writePercent,
      };
    }
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return null;
    return {
      label: profile.label,
      readPercent: profile.telemetry.readPercent,
      writePercent: profile.telemetry.writePercent,
    };
  }, [profileId, customProfile, profiles]);

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
      cardinalityOverrides: pruneCardinalityOverrides(next, prev.cardinalityOverrides),
      forceEmbedOverrides: pruneForceEmbedOverrides(next, prev.forceEmbedOverrides),
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
      cardinalityOverrides: pruneCardinalityOverrides(next, prev.cardinalityOverrides),
      forceEmbedOverrides: pruneForceEmbedOverrides(next, prev.forceEmbedOverrides),
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
      model: designModel ?? model,
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
      model: designModel ?? model ?? undefined,
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
            cardinalityOverrides: {},
            forceEmbedOverrides: {},
            selectedTable: null,
            view: 'diagram',
          }));
          setStatus(`Diagram imported. Workload profile: ${inferred.label} (auto-detected).`);
        } catch (e) {
          setStatus(`Invalid diagram file: ${describeApiError(e)}`);
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
          cardinalityOverrides: pruneCardinalityOverrides(data.model ?? prev.model, prev.cardinalityOverrides),
          forceEmbedOverrides: pruneForceEmbedOverrides(data.model ?? prev.model, prev.forceEmbedOverrides),
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
        setStatus(`Invalid MongoDB diagram file: ${describeApiError(e)}`);
      }
    };
    reader.readAsText(file);
  };

  const handleRefreshExplanation = async () => {
    if (!designModel || !migrationPlan) return;
    try {
      setExplainingSummary(true);
      const summary = await explainDesignTransformation({
        model: designModel,
        ddl,
        dialect,
        ...profileFields,
        cardinalityOverrides,
        forceEmbedOverrides,
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
      setStatus(`Explain failed: ${describeApiError(e)}`);
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
      designMeta: designModel ? designMetaFromPlan(designModel, plan) : undefined,
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
    if (designModel) {
      void explainDesignTransformation({
        model: designModel,
        ddl,
        dialect,
        ...profileFields,
        cardinalityOverrides,
        forceEmbedOverrides,
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
    if (!designModel) return;
    try {
      setDesigningPlan(true);
      setStatus('Running ML/RAG design engine for MongoDB schema…');
      const designRequest = {
        model: designModel,
        ddl,
        dialect,
        ...profileFields,
        cardinalityOverrides,
        forceEmbedOverrides,
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
          modelTokenUsage: result.modelTokenUsage
            ? mergeModelTokenUsage(prev.migrationArtifacts?.modelTokenUsage ?? emptyModelTokenUsage(), result.modelTokenUsage)
            : prev.migrationArtifacts?.modelTokenUsage,
          generatedAt: new Date().toISOString(),
          repositories: prev.migrationArtifacts?.repositories,
          pipelineResult: prev.migrationArtifacts?.pipelineResult,
          apiArtifacts: result.apiArtifacts ?? null,
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
        setStatus(hasCardinalityOverrides
          ? `${summary}. Developer embed overrides applied where provided; add CSV or a .db file for measured row counts.`
          : `${summary}. Add CSV exports (or import a .db file) so embed/subset/bucket patterns can fold tables.`);
      } else {
        setStatus(`${summary}. ${meta.csvEnriched ? 'CSV-enriched' : 'Introspection stats'} · ${result.retrievalStrategy ?? 'RAG'}.`);
      }
    } catch (e) {
      setStatus(`Design failed: ${describeApiError(e)}`);
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
      setStatus(`CSV folder pick failed: ${describeApiError(e)}`);
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
    if (!designModel) return;
    try {
      setExporting(true);
      setStatus('Generating AI-powered migration export…');
      const result = await exportMigration(designModel, profileFields, ddl, {
        dialect,
        cardinalityOverrides,
        forceEmbedOverrides,
      });
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
      setStatus(`Export failed: ${describeApiError(e)}`);
    } finally {
      setExporting(false);
    }
  };

  const handlePipelineComplete = (result: PipelineRunResult) => {
    if (result.migrationPlanJson && result.designReportMarkdown) {
      const plan = result.migrationPlanJson as MigrationPlan;
      const meta = designModel ? designMetaFromPlan(designModel, plan) : undefined;
      setSession((prev) => ({
        ...prev,
        migrationArtifacts: {
          planJson: JSON.stringify(result.migrationPlanJson, null, 2),
          designReportMarkdown: result.designReportMarkdown,
          prompts: [],
          retrievalStrategy: result.retrievalStrategy,
          designMeta: meta,
          modelTokenUsage: result.modelTokenUsage
            ? mergeModelTokenUsage(prev.migrationArtifacts?.modelTokenUsage ?? emptyModelTokenUsage(), result.modelTokenUsage)
            : prev.migrationArtifacts?.modelTokenUsage,
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
        },
      }));
    }
    setStatus(result.ok ? 'Full pipeline completed.' : `Pipeline finished with errors: ${result.errors.join('; ')}`);
  };

  const handleSignOffExport = () => {
    if (!migrationArtifacts?.planJson) return;
    downloadJson('migration-plan.json', {
      ...(migrationPlan ?? JSON.parse(migrationArtifacts.planJson)),
      managerReview: managerReviewAcceptances ?? undefined,
    });
    if (migrationArtifacts.designReportMarkdown?.trim()) {
      downloadText('design-report.md', migrationArtifacts.designReportMarkdown, 'text/markdown');
    }
    setStatus('Migration blueprint exported (plan + design report).');
  };

  const handleClearSession = () => {
    const next = defaultSessionState();
    setSession(next);
    saveSessionState(next);
    setSchemaImportModalOpen(true);
    setStatus('Session cleared.');
  };

  const diagramLegend = useMemo(() => {
    if (view !== 'diagram' || uiRole !== 'developer') return null;
    if (schemaPhase === 'before' && model) {
      return (
        <FooterDiagramLegend
          variant="sql"
          stats={`${model.tables.length} tbl · ${model.relationships.length} rel`}
        />
      );
    }
    if (schemaPhase === 'after' && migrationPlan) {
      const links = edgesForPlan(migrationPlan).length;
      return (
        <FooterDiagramLegend
          variant="mongo"
          stats={`${migrationPlan.collections.length} coll · ${links} link${links === 1 ? '' : 's'}`}
        />
      );
    }
    return null;
  }, [view, uiRole, schemaPhase, model, migrationPlan]);

  return (
    <AuthGate>
    <div
      className={uiRole === 'manager' ? 'app-root app--manager' : 'app-root'}
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <header className="app-header">
        <MongoLogo />
        <div className="app-header__actions">
          {access.isAdmin ? (
            <RoleToggle role={uiRole} onChange={(role) => setSessionField('uiRole', role)} />
          ) : (
            <span className="role-toggle role-toggle--locked" aria-label="Assigned role">
              {uiRole === 'manager' ? 'Manager' : 'Developer'}
            </span>
          )}
          {uiRole === 'developer' ? (
            <>
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
              <button type="button" className="tertiary" onClick={() => setCustomTelemetryOpen(true)}>
                Custom workload
              </button>
            </>
          ) : null}
          {view === 'diagram' && !model ? (
            <button type="button" className="primary" onClick={() => setSchemaImportModalOpen(true)}>
              Import schema
            </button>
          ) : null}
          {view === 'migration' ? (
            <button type="button" className="tertiary" onClick={() => setSessionField('view', 'diagram')}>
              Back to dashboard
            </button>
          ) : uiRole === 'developer' ? (
            <>
              <button type="button" className="primary" onClick={() => setPipelineOpen(true)} disabled={!model}>
                Run pipeline
              </button>
              <button type="button" className="secondary" onClick={() => void handleAiExport()} disabled={!model || exporting}>
                {exporting ? 'Exporting…' : 'Export migration'}
              </button>
            </>
          ) : null}
          {uiRole === 'developer' ? (
            <span className="app-header__cli-hint">
              CLI: <code>npm run hvymetl</code>
              <CopyButton text="npm run hvymetl" label="Copy" className="app-header__cli-copy" />
            </span>
          ) : null}
          {access.enabled ? (
            <div className="auth-user">
              <span>{access.userName}</span>
              <button type="button" className="tertiary" onClick={access.logout}>
                Sign out
              </button>
            </div>
          ) : null}
          <a className="terms-link" href="/terms">
            Terms
          </a>
        </div>
      </header>

      <div className="app-body">
        {view === 'diagram' ? (
          uiRole === 'manager' ? (
            <ManagerView
              model={model}
              migrationPlan={migrationPlan}
              migrationArtifacts={migrationArtifacts}
              schemaPhase={schemaPhase}
              sidebarWidth={sidebarWidth}
              onSidebarWidthChange={(width) => setSessionField('sidebarWidth', width)}
              onSchemaPhaseChange={handleSchemaPhaseChange}
              onRunPipeline={() => setPipelineOpen(true)}
              onGenerateReport={() => void handleAiExport()}
              onSignOffExport={handleSignOffExport}
              onOpenMigrationView={() => setSessionField('view', 'migration')}
              exporting={exporting}
              statusMessage={status}
              pipelineOpen={pipelineOpen}
              profileInfo={profileInfo}
              managerReviewAcceptances={managerReviewAcceptances}
              onReviewAcceptancesChange={(acceptances) =>
                setSessionField('managerReviewAcceptances', acceptances)
              }
              managerCostInputs={managerCostInputs}
              onManagerCostInputsChange={(inputs) => setSessionField('managerCostInputs', inputs)}
              dialects={dialects}
              dialect={dialect}
              ddl={ddl}
              apiConnected={apiConnected}
              onDialectChange={(value) => setSessionField('dialect', value)}
              onDdlChange={(value) => setSessionField('ddl', value)}
              onImportQuery={() => void handleImportQuery()}
              onSchemaFile={(file) => void handleSchemaFileUpload(file)}
            />
          ) : (
          <ResizableSplit
            sidebarWidth={sidebarWidth}
            onSidebarWidthChange={(width) => setSessionField('sidebarWidth', width)}
            stackedSidebarMode={!model ? 'import' : 'default'}
            sidebar={
              <div className="sidebar-scroll">
                {schemaPhase === 'before' ? (
                  <>
                    <CollapsiblePanel title="Instant Schema Import" defaultOpen={!model}>
                      <SchemaImportPanel
                        dialects={dialects}
                        dialect={dialect}
                        ddl={ddl}
                        apiConnected={apiConnected}
                        onDialectChange={(value) => setSessionField('dialect', value)}
                        onDdlChange={(value) => setSessionField('ddl', value)}
                        onImportQuery={() => void handleImportQuery()}
                        onSchemaFile={(file) => void handleSchemaFileUpload(file)}
                        framed={false}
                      />
                    </CollapsiblePanel>
                    {model ? (
                      <CollapsiblePanel title="Embed Overrides">
                        <CardinalityOverridesPanel
                          model={model}
                          overrides={cardinalityOverrides}
                          forceEmbedOverrides={forceEmbedOverrides}
                          onChange={handleCardinalityOverridesChange}
                        />
                      </CollapsiblePanel>
                    ) : null}
                  </>
                ) : (
                  <CollapsiblePanel title="MongoDB Target Schema" defaultOpen>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', opacity: 0.85 }}>
                      AI/RAG migration plan — collections, embeds, indexes, and pattern decisions before Atlas import.
                    </p>
                    <p className="pipeline-hint" style={{ margin: '0 0 0.5rem' }}>
                      Export SQL table data as CSV so row counts and relationship cardinality drive embed, subset, and
                      bucket folding. SQLite .db imports include stats automatically.
                    </p>
                    <div className="button-row" style={{ marginBottom: '0.5rem' }}>
                      <button type="button" className="secondary" onClick={() => void handlePickDesignCsv()}>
                        Choose CSVs
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
                          className="secondary"
                          onClick={() =>
                            downloadJson('migration-plan.json', {
                              ...(migrationPlan ?? JSON.parse(migrationArtifacts!.planJson)),
                              managerReview: managerReviewAcceptances ?? undefined,
                            })
                          }
                        >
                          Download plan
                        </button>
                      ) : null}
                    </div>
                  </CollapsiblePanel>
                )}

                {schemaPhase === 'after' ? (
                  <CollapsiblePanel title="Transformation Summary" defaultOpen>
                    <TransformationSummaryPanel
                      summary={migrationArtifacts?.transformationSummary ?? null}
                      onRefresh={() => void handleRefreshExplanation()}
                      refreshing={explainingSummary}
                      framed={false}
                    />
                  </CollapsiblePanel>
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
                              className="btn-icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicate(t.name);
                              }}
                              title="Duplicate table"
                              aria-label={`Duplicate ${t.name}`}
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
                  <CollapsiblePanel title="Share Diagram">
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', opacity: 0.85 }}>
                      Export or import SQL table layout and positions.
                    </p>
                    <div className="button-row column">
                      <button type="button" className="secondary block" onClick={handleExportDiagram} disabled={!model}>
                        Export diagram
                      </button>
                      <button type="button" className="secondary block" onClick={() => diagramFileInputRef.current?.click()}>
                        Import diagram
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
                  </CollapsiblePanel>
                ) : (
                  <CollapsiblePanel title="Share Diagram">
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', opacity: 0.85 }}>
                      Export or import MongoDB collection layout, migration plan, and canvas positions.
                    </p>
                    <div className="button-row column">
                      <button
                        type="button"
                        className="secondary block"
                        onClick={handleExportMongoDiagram}
                        disabled={!migrationPlan}
                      >
                        Export diagram
                      </button>
                      <button
                        type="button"
                        className="secondary block"
                        onClick={() => mongoDiagramFileInputRef.current?.click()}
                      >
                        Import diagram
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
                  </CollapsiblePanel>
                )}

                <CollapsiblePanel title="Pipeline History">
                  <PipelineHistoryPanel onLoadExecution={handleLoadPipelineExecution} framed={false} />
                </CollapsiblePanel>

                <CollapsiblePanel title="Session">
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', opacity: 0.8 }}>
                    Your work is saved in this browser tab. Refreshing keeps schema, layout, and migration artifacts.
                  </p>
                  <button type="button" className="danger secondary block" onClick={handleClearSession}>
                    Clear session
                  </button>
                </CollapsiblePanel>
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
                        <span className="schema-phase-bar__warn">
                          {' · '}
                          {hasCardinalityOverrides ? 'developer overrides applied' : 'add CSV for folding'}
                        </span>
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
                <DiagramStatusFooter status={status} legend={diagramLegend} />
              </>
            }
          />
          )
        ) : (
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {migrationArtifacts ? (
              <MigrationArtifactsView
                artifacts={migrationArtifacts}
                onChange={(next) => setSessionField('migrationArtifacts', next)}
                onBack={() => setSessionField('view', 'diagram')}
              />
            ) : null}
            <DiagramStatusFooter status={status} />
          </main>
        )}
      </div>

      {designModel ? (
        <PipelinePanel
          open={pipelineOpen}
          onClose={() => setPipelineOpen(false)}
          model={designModel}
          ddl={ddl}
          profileFields={profileFields}
          cardinalityOverrides={cardinalityOverrides}
          forceEmbedOverrides={forceEmbedOverrides}
          dialect={dialect}
          dialectLabel={dialectLabel}
          csvSourcePath={csvSourcePath}
          onCsvSourcePathChange={(path) => setSessionField('csvSourcePath', path)}
          onComplete={handlePipelineComplete}
        />
      ) : null}

      <SchemaImportModal
        open={!model && schemaImportModalOpen}
        dialects={dialects}
        dialect={dialect}
        ddl={ddl}
        apiConnected={apiConnected}
        onDialectChange={(value) => setSessionField('dialect', value)}
        onDdlChange={(value) => setSessionField('ddl', value)}
        onImportQuery={() => void handleImportQuery()}
        onSchemaFile={(file) => void handleSchemaFileUpload(file)}
        onClose={() => setSchemaImportModalOpen(false)}
      />

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
    </AuthGate>
  );
}
