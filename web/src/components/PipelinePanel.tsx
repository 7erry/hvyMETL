import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fatalCsvSchemaMismatch } from '../csvSchemaValidation';
import {
  downloadPipelineResults,
  describeApiError,
  fetchPipelineConfig,
  runPipeline,
  runPipelineWithCsv,
  saveTenantSecrets,
  uploadPipelineCsvFiles,
  type PipelineConfigStatus,
  type PipelineProgressEvent,
  type PipelineRunResult,
} from '../api';
import { pickCsvDirectory, pickCsvFiles } from '../directoryPicker';
import {
  hydratePipelineSettingsFromConfig,
  isCsvToAtlasServerConfigured,
  csvToAtlasUserOverridePath,
  isEnvMongoPlaceholder,
  isEnvModelKeyPlaceholder,
  isLikelyLocalFilesystemPath,
  modelKeyInputValue,
  modelKeyOverrideForFetch,
  mongoUriInputValue,
  mongoUriOverrideForFetch,
  resolveHostedCsvSourcePath,
} from '../pipelineFormHelpers';
import {
  PIPELINE_PROGRESS_STAGES,
  stageStatus,
  type PipelineProgressStage,
} from '../pipelineStages';
import type { ProfileRequestFields } from '../customProfileShared';
import type { SqlStructuralModel } from '../types';

type PipelinePanelProps = {
  open: boolean;
  onClose: () => void;
  model: SqlStructuralModel;
  ddl: string;
  profileFields: ProfileRequestFields;
  cardinalityOverrides?: Record<string, number>;
  forceEmbedOverrides?: Record<string, boolean>;
  dialect: string;
  dialectLabel: string;
  csvSourcePath: string | null;
  onCsvSourcePathChange: (path: string) => void;
  onComplete: (result: PipelineRunResult) => void;
  onPipelineFailure?: (errors: string[]) => void;
};

type PipelineForm = {
  mongoUri: string;
  mongodbModelKey: string;
  csvToAtlasPath: string;
  targetDb: string;
  csvSourcePath: string;
  drop: boolean;
  generateMockCsv: boolean;
  mockBaseRows: number;
  mockChildMultiplier: number;
  mockSeed: number;
};

type DataSourceMode = 'real' | 'mock';

export function PipelinePanel({
  open,
  onClose,
  model,
  ddl,
  profileFields,
  cardinalityOverrides,
  forceEmbedOverrides,
  dialect,
  dialectLabel,
  csvSourcePath,
  onCsvSourcePathChange,
  onComplete,
  onPipelineFailure,
}: PipelinePanelProps) {
  const [config, setConfig] = useState<PipelineConfigStatus | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgressEvent | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PipelineRunResult | null>(null);
  const [csvFiles, setCsvFiles] = useState<File[]>([]);
  const [csvDirectoryLabel, setCsvDirectoryLabel] = useState<string | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [uploadedCsvCount, setUploadedCsvCount] = useState(0);
  const [showEnvDetails, setShowEnvDetails] = useState(false);
  const [form, setForm] = useState<PipelineForm>({
    mongoUri: '',
    mongodbModelKey: '',
    csvToAtlasPath: '',
    targetDb: 'csv_to_atlas',
    csvSourcePath: csvSourcePath ?? '',
    drop: true,
    generateMockCsv: false,
    mockBaseRows: 500,
    mockChildMultiplier: 3,
    mockSeed: 42,
  });
  const [downloadingZip, setDownloadingZip] = useState(false);
  const formRef = useRef(form);
  formRef.current = form;
  const configRef = useRef(config);
  configRef.current = config;

  const persistTenantSecrets = useCallback(async (fields: Pick<PipelineForm, 'mongoUri' | 'mongodbModelKey'>) => {
    if (!config?.serverManagedCsvToAtlas) return;
    const mongoUri = mongoUriOverrideForFetch(fields.mongoUri);
    const mongodbModelKey = modelKeyOverrideForFetch(fields.mongodbModelKey);
    if (!mongoUri && !mongodbModelKey) return;
    try {
      await saveTenantSecrets({
        ...(mongoUri ? { mongoUri } : {}),
        ...(mongodbModelKey ? { mongodbModelKey } : {}),
      });
    } catch {
      // Non-blocking; pipeline run also persists credentials.
    }
  }, [config?.serverManagedCsvToAtlas]);

  const schemaTableNames = useMemo(() => model.tables.map((table) => table.name), [model]);

  const refreshConfig = useCallback(async (options?: { showLoading?: boolean }) => {
    const current = formRef.current;
    const cfg = configRef.current;
    const showLoading = options?.showLoading ?? !cfg;
    if (showLoading) setLoadingConfig(true);
    try {
      const status = await fetchPipelineConfig({
        schemaDialect: dialect,
        csvSourcePath: current.csvSourcePath || csvSourcePath || undefined,
        csvToAtlasPath: isCsvToAtlasServerConfigured(cfg, csvToAtlasUserOverridePath(current.csvToAtlasPath, cfg))
          ? undefined
          : current.csvToAtlasPath.trim() || undefined,
        generateMockCsv: current.generateMockCsv,
        mongoUri: mongoUriOverrideForFetch(current.mongoUri),
        mongodbModelKey: modelKeyOverrideForFetch(current.mongodbModelKey),
        expectedTables: schemaTableNames,
      });
      setConfig(status);
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      if (showLoading) setLoadingConfig(false);
    }
  }, [dialect, csvSourcePath, schemaTableNames]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setResult(null);
    setProgress(null);
    setCsvFiles([]);
    setCsvDirectoryLabel(null);
    setUploadedCsvCount(0);
    setShowEnvDetails(false);
    const savedCsvPath = resolveHostedCsvSourcePath(csvSourcePath, false);
    const savedCsvIsGeneratedMock = /(?:^|[/\\])mock-csv(?:[/\\])?$/i.test(savedCsvPath);
    const noCsv = !savedCsvPath || savedCsvIsGeneratedMock;
    setForm((prev) => ({
      ...prev,
      csvSourcePath: savedCsvIsGeneratedMock ? '' : prev.csvSourcePath || savedCsvPath,
      generateMockCsv: noCsv ? true : prev.generateMockCsv,
    }));

    void (async () => {
      setLoadingConfig(true);
      try {
        const status = await fetchPipelineConfig({
          schemaDialect: dialect,
          csvSourcePath: savedCsvIsGeneratedMock ? undefined : savedCsvPath || undefined,
          generateMockCsv: noCsv ? true : undefined,
          expectedTables: model.tables.map((table) => table.name),
        });
        setConfig(status);
        const hostedSavedPath = resolveHostedCsvSourcePath(
          savedCsvIsGeneratedMock ? '' : savedCsvPath,
          Boolean(status.requiresCsvUpload),
        );
        setForm((prev) => ({
          ...prev,
          ...hydratePipelineSettingsFromConfig(prev, status, hostedSavedPath),
        }));
      } catch (e) {
        setError(describeApiError(e));
      } finally {
        setLoadingConfig(false);
      }
    })();
  }, [open, csvSourcePath, dialect, model.tables]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void refreshConfig();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    open,
    form.mongoUri,
    form.mongodbModelKey,
    form.csvToAtlasPath,
    form.csvSourcePath,
    form.generateMockCsv,
    refreshConfig,
  ]);

  const dataSourceMode: DataSourceMode = form.generateMockCsv ? 'mock' : 'real';
  const requiresCsvUpload = Boolean(config?.requiresCsvUpload);
  const serverManagedCsvToAtlas = Boolean(config?.serverManagedCsvToAtlas);
  const csvToAtlasOverridePath = csvToAtlasUserOverridePath(form.csvToAtlasPath, config);
  const serverConfiguredCsvToAtlas = isCsvToAtlasServerConfigured(config, csvToAtlasOverridePath);
  const effectiveCsvPath =
    form.csvSourcePath.trim() ||
    resolveHostedCsvSourcePath(csvSourcePath, requiresCsvUpload) ||
    config?.csvSourcePath ||
    '';
  const hasCsvSource = Boolean(
    config?.hasCsvSource || effectiveCsvPath || csvFiles.length > 0 || uploadedCsvCount > 0,
  );
  const useMockCsv = form.generateMockCsv;
  const mockGeneratorReady = Boolean(config?.mockCsvGenerator?.ok);

  const envMongoUri = Boolean(config?.hasMongoUri);
  const envCsvToAtlas = Boolean(config?.hasCsvToAtlas);
  const formMongoUri = form.mongoUri.trim();
  const hasMongoUriInput = Boolean(formMongoUri && !isEnvMongoPlaceholder(formMongoUri));
  const formModelKey = form.mongodbModelKey.trim();
  const hasModelKeyInput = Boolean(formModelKey && !isEnvModelKeyPlaceholder(formModelKey));
  const mongoReachable = Boolean(config?.mongoConnectivity?.ok);
  const hasMongoUri = mongoReachable;
  const hasCsvToAtlasInput = Boolean(csvToAtlasOverridePath);
  const hasCsvToAtlas = envCsvToAtlas || hasCsvToAtlasInput || serverConfiguredCsvToAtlas;

  const csvSourceHint = `Export tables from ${dialectLabel} as CSV files named after the table or collection (e.g. products.csv).`;

  const resolveMongoUriOverride = (): string | undefined => {
    if (hasMongoUriInput) return formMongoUri;
    return undefined;
  };

  const resolveModelKeyOverride = (): string | undefined => {
    if (hasModelKeyInput) return formModelKey;
    return undefined;
  };

  useEffect(() => {
    if (!open || !serverManagedCsvToAtlas) return;
    const timer = window.setTimeout(() => {
      void persistTenantSecrets(formRef.current);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [open, serverManagedCsvToAtlas, form.mongoUri, form.mongodbModelKey, persistTenantSecrets]);

  const setDataSourceMode = (mode: DataSourceMode) => {
    setForm((prev) => ({
      ...prev,
      generateMockCsv: mode === 'mock',
    }));
    if (mode === 'mock') {
      setCsvFiles([]);
      setCsvDirectoryLabel(null);
      setUploadedCsvCount(0);
    }
  };

  const rejectCsvIfSchemaMismatch = (fileNames: string[]): boolean => {
    const fatal = fatalCsvSchemaMismatch(fileNames, schemaTableNames);
    if (fatal) {
      setError(fatal);
      return true;
    }
    return false;
  };

  const uploadCsvFilesToServer = useCallback(
    async (files: File[], label: string) => {
      if (rejectCsvIfSchemaMismatch(files.map((file) => file.name))) return;
      setCsvUploading(true);
      setError('');
      try {
        const uploaded = await uploadPipelineCsvFiles(files);
        setUploadedCsvCount(uploaded.fileCount);
        setCsvDirectoryLabel(label);
        setCsvFiles([]);
        setForm((prev) => ({ ...prev, csvSourcePath: uploaded.csvSourcePath, generateMockCsv: false }));
        onCsvSourcePathChange(uploaded.csvSourcePath);
        const current = formRef.current;
        const status = await fetchPipelineConfig({
          schemaDialect: dialect,
          csvSourcePath: uploaded.csvSourcePath,
          csvToAtlasPath: serverConfiguredCsvToAtlas ? undefined : current.csvToAtlasPath.trim() || undefined,
          generateMockCsv: false,
          mongoUri: mongoUriOverrideForFetch(current.mongoUri),
          mongodbModelKey: modelKeyOverrideForFetch(current.mongodbModelKey),
          expectedTables: schemaTableNames,
        });
        setConfig(status);
      } catch (e) {
        setError(describeApiError(e));
      } finally {
        setCsvUploading(false);
      }
    },
    [dialect, onCsvSourcePathChange, schemaTableNames, serverConfiguredCsvToAtlas],
  );

  useEffect(() => {
    if (!csvSourcePath || !open) return;
    if (requiresCsvUpload && isLikelyLocalFilesystemPath(csvSourcePath)) return;
    if (/(?:^|[/\\])mock-csv(?:[/\\])?$/i.test(csvSourcePath)) return;
    setForm((prev) => (prev.csvSourcePath ? prev : { ...prev, csvSourcePath }));
  }, [csvSourcePath, open, requiresCsvUpload]);

  const handlePickCsvDirectory = async () => {
    try {
      const picked = await pickCsvDirectory();
      if (!picked) return;

      if (picked.files.length === 0) {
        setError('No CSV files found in that folder.');
        return;
      }

      setError('');
      if (requiresCsvUpload) {
        await uploadCsvFilesToServer(picked.files, picked.label);
        return;
      }

      if (rejectCsvIfSchemaMismatch(picked.files.map((file) => file.name))) return;

      setCsvFiles(picked.files);
      setCsvDirectoryLabel(picked.label);
      setUploadedCsvCount(0);
      setForm((prev) => ({ ...prev, csvSourcePath: '', generateMockCsv: false }));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(String(e));
    }
  };

  const handlePickCsvFiles = async () => {
    try {
      const files = await pickCsvFiles();
      if (!files?.length) return;
      setError('');
      if (requiresCsvUpload) {
        await uploadCsvFilesToServer(files, `${files.length} selected file${files.length === 1 ? '' : 's'}`);
        return;
      }
      if (rejectCsvIfSchemaMismatch(files.map((file) => file.name))) return;
      setCsvFiles(files);
      setCsvDirectoryLabel(`${files.length} selected file${files.length === 1 ? '' : 's'}`);
      setUploadedCsvCount(0);
      setForm((prev) => ({ ...prev, csvSourcePath: '', generateMockCsv: false }));
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCsvSourcePathChange = (value: string) => {
    if (requiresCsvUpload) return;
    setCsvDirectoryLabel(null);
    setCsvFiles([]);
    setUploadedCsvCount(0);
    setForm((prev) => ({ ...prev, csvSourcePath: value, generateMockCsv: false }));
  };

  const csvSourceDisplay =
    csvDirectoryLabel && (csvFiles.length > 0 || uploadedCsvCount > 0)
      ? `${csvDirectoryLabel} (${csvFiles.length || uploadedCsvCount} CSV file${
          (csvFiles.length || uploadedCsvCount) === 1 ? '' : 's'
        }${uploadedCsvCount > 0 ? ' on server' : ''})`
      : form.csvSourcePath;

  const envChecks = useMemo(() => {
    if (!config) return [];
    return [
      { id: 'dialect', label: `Schema dialect (${dialectLabel})`, ok: true },
      {
        id: 'mongo',
        label: config.mongoUriMasked
          ? `MongoDB reachable (${config.mongoUriMasked})`
          : 'MongoDB connection (MONGODB_URI)',
        ok: mongoReachable,
      },
      {
        id: 'csvToAtlas',
        label: config.csvToAtlasResolvedPath
          ? `csvToAtlas (${config.csvToAtlasLabel ?? config.csvToAtlasResolvedPath})`
          : 'csvToAtlas import tool (CSV_TO_ATLAS_PATH)',
        ok: hasCsvToAtlas,
      },
      ...(useMockCsv
        ? [
            {
              id: 'mockGenerator',
              label: config.mockCsvGenerator?.ok
                ? `Mock CSV generator (${config.mockCsvGenerator.python ?? 'python3'})`
                : 'Mock CSV generator (Python + deps)',
              ok: mockGeneratorReady,
            },
          ]
        : [
            {
              id: 'data',
              label: requiresCsvUpload ? 'CSV files uploaded to studio server' : 'CSV export folder or server path',
              ok: hasCsvSource,
            },
          ]),
    ];
  }, [config, dialectLabel, mongoReachable, hasCsvToAtlas, useMockCsv, hasCsvSource, mockGeneratorReady, requiresCsvUpload]);

  const passedChecks = envChecks.filter((check) => check.ok).length;
  const envReady = envChecks.length > 0 && passedChecks === envChecks.length;

  const canRun = useMemo(() => {
    if (running || csvUploading || !model) return false;
    if (!hasMongoUri) return false;
    if (!hasCsvToAtlas) return false;
    if (useMockCsv && !mockGeneratorReady) return false;
    if (!hasCsvSource && !useMockCsv) return false;
    return true;
  }, [running, csvUploading, model, hasMongoUri, hasCsvToAtlas, hasCsvSource, useMockCsv, mockGeneratorReady]);

  const handleRun = async () => {
    setRunning(true);
    setError('');
    setResult(null);
    setProgress({ stage: 'validating', message: 'Starting pipeline…' });
    try {
      const overrides = {
        ...profileFields,
        model,
        ddl,
        cardinalityOverrides,
        forceEmbedOverrides,
        dialect,
        targetDb: form.targetDb.trim() || undefined,
        drop: form.drop,
        mongoUri: resolveMongoUriOverride(),
        mongodbModelKey: resolveModelKeyOverride(),
        csvToAtlasPath: serverConfiguredCsvToAtlas ? undefined : form.csvToAtlasPath.trim() || undefined,
        csvSourcePath: useMockCsv || csvFiles.length > 0 ? undefined : effectiveCsvPath || undefined,
        generateMockCsv: useMockCsv,
        mockCsvOptions: useMockCsv
          ? {
              baseRowsPerTable: form.mockBaseRows,
              childMultiplier: form.mockChildMultiplier,
              seed: form.mockSeed,
            }
          : undefined,
      };

      const onProgress = (event: PipelineProgressEvent) => setProgress(event);

      const pipelineResult =
        csvFiles.length > 0 && !useMockCsv
          ? await runPipelineWithCsv(csvFiles, overrides, onProgress)
          : await runPipeline(overrides, onProgress);

      setResult(pipelineResult);
      if (pipelineResult.csvSourcePath && !useMockCsv) {
        onCsvSourcePathChange(pipelineResult.csvSourcePath);
      } else if (useMockCsv) {
        onCsvSourcePathChange('');
      }
      onComplete(pipelineResult);
      if (!pipelineResult.ok && pipelineResult.errors.length > 0) {
        onPipelineFailure?.(pipelineResult.errors);
      }
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const activeStage: PipelineProgressStage | null = running ? (progress?.stage ?? 'validating') : null;

  if (!open) return null;

  return (
    <div className="pipeline-overlay" role="dialog" aria-modal="true" aria-labelledby="pipeline-title">
      <div className="pipeline-modal panel">
        <header className="pipeline-modal__header">
          <div>
            <h2 id="pipeline-title">Run Full Pipeline</h2>
            <p className="pipeline-modal__subtitle">Design your MongoDB schema and import data to Atlas.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} disabled={running} aria-label="Close pipeline dialog">
            ✕
          </button>
        </header>

        {loadingConfig ? (
          <p className="pipeline-hint">Loading configuration…</p>
        ) : config ? (
          <div
            className={[
              'pipeline-env-banner',
              envReady ? 'pipeline-env-banner--ok' : 'pipeline-env-banner--warn',
            ].join(' ')}
          >
            <div className="pipeline-env-banner__main">
              <span className="pipeline-env-banner__icon" aria-hidden="true">{envReady ? '✓' : '!'}</span>
              <div className="pipeline-env-banner__text">
                <strong>
                  {envReady
                    ? `Environment ready (${dialectLabel} → Atlas)`
                    : 'Environment needs attention'}
                </strong>
                <span>
                  {passedChecks}/{envChecks.length} pre-flight checks passed
                </span>
              </div>
              <button
                type="button"
                className="tertiary pipeline-env-banner__toggle"
                onClick={() => setShowEnvDetails((open) => !open)}
                aria-expanded={showEnvDetails}
              >
                {showEnvDetails ? 'Hide settings' : 'View settings'}
              </button>
            </div>
            {showEnvDetails ? (
              <div className="pipeline-env-details">
                <ul className="pipeline-status pipeline-status--compact">
                  {envChecks.map((check) => (
                    <li key={check.id} className={check.ok ? 'ok' : 'missing'}>
                      {check.label} {check.ok ? '✓' : '— required'}
                    </li>
                  ))}
                </ul>
                <div className="pipeline-env-details__fields">
                  <div className="pipeline-env-field">
                    <div className="pipeline-env-field__header">
                      <code className="pipeline-env-field__name">MONGODB_URI</code>
                      {envMongoUri || config.tenantSecrets?.hasMongoUri ? (
                        <span className="pipeline-field-badge">configured</span>
                      ) : null}
                    </div>
                    <input
                      type="password"
                      value={mongoUriInputValue(form.mongoUri)}
                      placeholder={
                        envMongoUri || config.tenantSecrets?.hasMongoUri
                          ? 'Enter to override saved URI'
                          : 'mongodb+srv://…'
                      }
                      onChange={(e) => setForm((prev) => ({ ...prev, mongoUri: e.target.value }))}
                      disabled={running}
                      autoComplete="off"
                    />
                    <p
                      className={[
                        'pipeline-env-field__current',
                        config.mongoUriMasked || envMongoUri || config.tenantSecrets?.hasMongoUri
                          ? ''
                          : 'pipeline-env-field__current--empty',
                      ].join(' ')}
                    >
                      {config.mongoUriMasked ??
                        (config.tenantSecrets?.mongoUriMasked
                          ? config.tenantSecrets.mongoUriMasked
                          : envMongoUri
                            ? 'Configured in .env'
                            : 'Not set')}
                    </p>
                  </div>

                  <div className="pipeline-env-field">
                    <div className="pipeline-env-field__header">
                      <code className="pipeline-env-field__name">MONGODB_MODEL_KEY</code>
                      {config.hasModelKey || config.tenantSecrets?.hasMongodbModelKey ? (
                        <span className="pipeline-field-badge">configured</span>
                      ) : null}
                    </div>
                    <input
                      type="password"
                      value={modelKeyInputValue(form.mongodbModelKey)}
                      placeholder={
                        config.hasModelKey || config.tenantSecrets?.hasMongodbModelKey
                          ? 'Enter to override saved key'
                          : 'al-… (Atlas Model API key)'
                      }
                      onChange={(e) => setForm((prev) => ({ ...prev, mongodbModelKey: e.target.value }))}
                      disabled={running}
                      autoComplete="off"
                    />
                    <p
                      className={[
                        'pipeline-env-field__current',
                        config.mongodbModelKeyMasked ||
                        config.hasModelKey ||
                        config.tenantSecrets?.hasMongodbModelKey
                          ? ''
                          : 'pipeline-env-field__current--empty',
                      ].join(' ')}
                    >
                      {config.mongodbModelKeyMasked ??
                        (config.tenantSecrets?.mongodbModelKeyMasked
                          ? config.tenantSecrets.mongodbModelKeyMasked
                          : config.hasModelKey
                            ? 'Configured in .env'
                            : 'Not set')}
                    </p>
                  </div>

                  {!serverConfiguredCsvToAtlas ? (
                    <div className="pipeline-env-field">
                      <div className="pipeline-env-field__header">
                        <code className="pipeline-env-field__name">CSV_TO_ATLAS_PATH</code>
                        {envCsvToAtlas ? <span className="pipeline-field-badge">configured</span> : null}
                      </div>
                      <input
                        type="text"
                        value={form.csvToAtlasPath}
                        placeholder="/path/to/csvToAtlas (clone root or dist/)"
                        onChange={(e) => setForm((prev) => ({ ...prev, csvToAtlasPath: e.target.value }))}
                        disabled={running}
                      />
                      <p
                        className={[
                          'pipeline-env-field__current',
                          config.csvToAtlasResolvedPath || form.csvToAtlasPath.trim() ? '' : 'pipeline-env-field__current--empty',
                        ].join(' ')}
                      >
                        {config.csvToAtlasResolvedPath ??
                          (form.csvToAtlasPath.trim() || 'Not set — clone root with package.json, or dist/ containing cli.js')}
                      </p>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="tertiary pipeline-env-details__refresh"
                  onClick={() => void refreshConfig({ showLoading: true })}
                  disabled={loadingConfig || running}
                >
                  {loadingConfig ? 'Refreshing…' : 'Refresh checks'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {config?.mongoConnectivity && !config.mongoConnectivity.ok ? (
          <div className="pipeline-error pipeline-mongo-connectivity">
            <p><strong>{config.mongoConnectivity.message}</strong></p>
            {config.hostedUrl && config.serverEgressIp ? (
              <p className="pipeline-hint">
                Allow Atlas Network Access for the studio server IP: <strong>{config.serverEgressIp}</strong>
              </p>
            ) : null}
            {config.mongoConnectivity.hint ? (
              <pre className="pipeline-hint">{config.mongoConnectivity.hint}</pre>
            ) : null}
          </div>
        ) : null}

        {config?.csvSchemaWarnings?.length ? (
          <div className="pipeline-warn">
            {config.csvSchemaWarnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}

        {config?.csvToAtlasValidation.warnings?.length ? (
          <div className="pipeline-warn">
            {config.csvToAtlasValidation.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        ) : null}

        {config && !config.hasCsvToAtlas && config.csvToAtlasValidation.errors?.length ? (
          <div className="pipeline-error">
            {config.csvToAtlasValidation.errors.map((e) => (
              <p key={e} style={{ margin: '0.25rem 0' }}>{e}</p>
            ))}
          </div>
        ) : null}

        <section className="pipeline-section">
          <h3 className="pipeline-section__title">Data source</h3>
          <div className="pipeline-data-toggle" role="radiogroup" aria-label="Data source">
            <button
              type="button"
              role="radio"
              aria-checked={dataSourceMode === 'real'}
              className={dataSourceMode === 'real' ? 'active' : ''}
              onClick={() => setDataSourceMode('real')}
              disabled={running}
            >
              Use real CSV data
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={dataSourceMode === 'mock'}
              className={dataSourceMode === 'mock' ? 'active' : ''}
              onClick={() => setDataSourceMode('mock')}
              disabled={running}
            >
              Generate mock data
            </button>
          </div>

          {dataSourceMode === 'real' ? (
            <div className="pipeline-card">
              <p className="pipeline-hint">{csvSourceHint}</p>
              {requiresCsvUpload ? (
                <p className="pipeline-hint">
                  On <strong>{config?.hostedUrl ?? 'hvymetl.studio'}</strong>, CSV files from your computer are
                  uploaded to the studio server before csvToAtlas import runs.
                </p>
              ) : null}
              <label>
                {requiresCsvUpload ? 'CSV exports' : 'CSV folder'}
                <div className="pipeline-path-row">
                  <input
                    type="text"
                    value={csvSourceDisplay}
                    placeholder={
                      requiresCsvUpload
                        ? 'Choose folder or CSV files to upload…'
                        : 'Choose folder… or enter server path'
                    }
                    onChange={(e) => handleCsvSourcePathChange(e.target.value)}
                    disabled={running || csvUploading || requiresCsvUpload}
                    readOnly={requiresCsvUpload}
                  />
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void handlePickCsvDirectory()}
                    disabled={running || csvUploading}
                  >
                    {csvUploading ? 'Uploading…' : 'Choose folder'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void handlePickCsvFiles()}
                    disabled={running || csvUploading}
                  >
                    Choose files
                  </button>
                </div>
                {csvUploading ? (
                  <span className="pipeline-hint">Uploading CSV files to the studio server…</span>
                ) : csvDirectoryLabel && (csvFiles.length > 0 || uploadedCsvCount > 0) ? (
                  <span className="pipeline-hint">
                    {uploadedCsvCount > 0
                      ? `${uploadedCsvCount} file(s) ready on server${effectiveCsvPath ? `: ${effectiveCsvPath}` : ''}`
                      : `${csvFiles.length} file(s) selected locally: ${csvFiles.map((f) => f.name).join(', ')}`}
                  </span>
                ) : (
                  <span className="pipeline-hint">
                    {requiresCsvUpload
                      ? 'Pick a folder or individual .csv files from your machine. They will be uploaded before import.'
                      : 'Upload from this browser, or type a path on the machine running the API server.'}
                  </span>
                )}
              </label>
            </div>
          ) : config?.mockCsvGenerator?.ok ? (
            <div className="pipeline-card pipeline-mock-ready">
              <p className="pipeline-hint">
                Mock CSVs will be generated from your DDL using{' '}
                <code>{config.mockCsvGenerator.python ?? 'python3'}</code>
                {config.mockCsvGenerator.version ? ` (${config.mockCsvGenerator.version})` : ''}.
              </p>
            </div>
          ) : (
            <div className="pipeline-prereq-banner">
              <strong>Server prerequisite</strong>
              <p>
                {config?.mockCsvGenerator?.message ??
                  'Mock CSV generation needs Python 3 on the machine running the API server.'}
              </p>
              {config?.mockCsvGenerator?.hint ? (
                <pre className="pipeline-hint">{config.mockCsvGenerator.hint}</pre>
              ) : (
                <p>
                  Install dependencies: <code>pip install -r generators/requirements.txt</code>
                </p>
              )}
            </div>
          )}

          {dataSourceMode === 'mock' ? (
              <div className="pipeline-card">
                <h4 className="pipeline-card__title">Mock generation settings</h4>
                <div className="pipeline-mock-grid">
                  <label>
                    <span className="pipeline-field-label">Sample size (rows)</span>
                    <input
                      type="number"
                      min={10}
                      max={50000}
                      value={form.mockBaseRows}
                      disabled={running}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, mockBaseRows: Number(e.target.value) || 500 }))
                      }
                    />
                  </label>
                  <label>
                    <span className="pipeline-field-label">
                      Child rows per parent
                      <span
                        className="pipeline-field-tip"
                        title="Multiplier applied to child tables based on parent row count (e.g. 3× means ~3 child rows per parent row)."
                      >
                        ⓘ
                      </span>
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      step={0.5}
                      value={form.mockChildMultiplier}
                      disabled={running}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, mockChildMultiplier: Number(e.target.value) || 3 }))
                      }
                    />
                  </label>
                  <label>
                    <span className="pipeline-field-label">Random seed</span>
                    <input
                      type="number"
                      value={form.mockSeed}
                      disabled={running}
                      onChange={(e) => setForm((prev) => ({ ...prev, mockSeed: Number(e.target.value) || 42 }))}
                    />
                  </label>
                </div>
              </div>
          ) : null}
        </section>

        <section className="pipeline-section">
          <h3 className="pipeline-section__title">Destination</h3>
          <div className="pipeline-card">
            <label>
              Target database
              <input
                type="text"
                value={form.targetDb}
                onChange={(e) => setForm((prev) => ({ ...prev, targetDb: e.target.value }))}
                disabled={running}
              />
            </label>
            <label className="pipeline-checkbox">
              <input
                type="checkbox"
                checked={form.drop}
                disabled={running}
                onChange={(e) => setForm((prev) => ({ ...prev, drop: e.target.checked }))}
              />
              Wipe existing collections before importing
            </label>
          </div>
        </section>

        {error ? <p className="pipeline-error">{error}</p> : null}

        {running ? (
          <div className="pipeline-progress" role="status" aria-live="polite" aria-busy="true">
            <div className="pipeline-progress__header">
              <span className="pipeline-progress__spinner" aria-hidden="true" />
              <p className="pipeline-progress__message">{progress?.message ?? 'Running pipeline…'}</p>
            </div>
            {progress?.stage === 'importing' && progress.current && progress.total ? (
              <p className="pipeline-progress__detail">
                Collection {progress.current} of {progress.total}
                {progress.collection ? `: ${progress.collection}` : ''}
              </p>
            ) : null}
            <ol className="pipeline-progress__steps">
              {PIPELINE_PROGRESS_STAGES.filter((entry) => entry.stage !== 'done').map((entry) => {
                const status = stageStatus(entry.stage, activeStage);
                return (
                  <li key={entry.stage} className={`pipeline-progress__step pipeline-progress__step--${status}`}>
                    <span className="pipeline-progress__step-icon" aria-hidden="true">
                      {status === 'done' ? '✓' : status === 'active' ? '●' : '○'}
                    </span>
                    {entry.label}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        {result ? (
          <div className="pipeline-result">
            <p>{result.ok ? 'Pipeline completed successfully.' : 'Pipeline finished with errors.'}</p>
            <ul>
              {result.imports.map((imp) => (
                <li key={imp.collection} className={imp.ok ? 'ok' : 'missing'}>
                  {imp.collection}: {imp.ok ? `${imp.insertedCount ?? '?'} docs` : imp.error}
                </li>
              ))}
            </ul>
            {result.errors.length ? (
              <ul className="pipeline-error-list">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
            <p className="pipeline-hint">Output: {result.paths.outDir}</p>
            {result.runId ? (
              <button
                type="button"
                className="secondary"
                disabled={downloadingZip}
                onClick={() => {
                  setDownloadingZip(true);
                  void downloadPipelineResults(result.runId!)
                    .catch((e) => setError(String(e)))
                    .finally(() => setDownloadingZip(false));
                }}
              >
                {downloadingZip ? 'Preparing download…' : 'Download results (.zip)'}
              </button>
            ) : null}
          </div>
        ) : null}

        <footer className="pipeline-modal__footer">
          <button type="button" className="secondary" onClick={onClose} disabled={running}>
            Cancel
          </button>
          <div className="pipeline-modal__footer-actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (result?.ok) {
                  onClose();
                } else {
                  void handleRun();
                }
              }}
              disabled={running || (!result?.ok && !canRun)}
            >
              {running ? 'Running…' : result?.ok ? 'Done' : result ? 'Run again' : 'Run pipeline'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
