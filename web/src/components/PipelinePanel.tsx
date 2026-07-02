import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchPipelineConfig,
  runPipeline,
  runPipelineWithCsv,
  type PipelineConfigStatus,
  type PipelineProgressEvent,
  type PipelineRunResult,
} from '../api';
import { pickCsvDirectory } from '../directoryPicker';
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
  dialect: string;
  dialectLabel: string;
  csvSourcePath: string | null;
  onCsvSourcePathChange: (path: string) => void;
  onComplete: (result: PipelineRunResult) => void;
};

type PipelineForm = {
  mongoUri: string;
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
  dialect,
  dialectLabel,
  csvSourcePath,
  onCsvSourcePathChange,
  onComplete,
}: PipelinePanelProps) {
  const [config, setConfig] = useState<PipelineConfigStatus | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgressEvent | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PipelineRunResult | null>(null);
  const [csvFiles, setCsvFiles] = useState<File[]>([]);
  const [csvDirectoryLabel, setCsvDirectoryLabel] = useState<string | null>(null);
  const [showEnvDetails, setShowEnvDetails] = useState(false);
  const [form, setForm] = useState<PipelineForm>({
    mongoUri: '',
    csvToAtlasPath: '',
    targetDb: 'csv_to_atlas',
    csvSourcePath: csvSourcePath ?? '',
    drop: true,
    generateMockCsv: false,
    mockBaseRows: 500,
    mockChildMultiplier: 3,
    mockSeed: 42,
  });

  const refreshConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const mongoUriOverride =
        form.mongoUri.trim() && form.mongoUri !== '(configured in .env)' ? form.mongoUri.trim() : undefined;
      const status = await fetchPipelineConfig({
        schemaDialect: dialect,
        csvSourcePath: form.csvSourcePath || csvSourcePath || undefined,
        csvToAtlasPath: form.csvToAtlasPath.trim() || undefined,
        generateMockCsv: form.generateMockCsv,
        mongoUri: mongoUriOverride,
      });
      setConfig(status);
      setForm((prev) => ({
        ...prev,
        targetDb: prev.targetDb || status.defaultTargetDb,
        csvSourcePath: prev.csvSourcePath || csvSourcePath || status.csvSourcePath || '',
        mongoUri:
          prev.mongoUri && prev.mongoUri !== '(configured in .env)'
            ? prev.mongoUri
            : prev.mongoUri || (status.hasMongoUri ? '(configured in .env)' : ''),
        csvToAtlasPath:
          prev.csvToAtlasPath || status.csvToAtlasResolvedPath || status.csvToAtlasLabel || '',
      }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingConfig(false);
    }
  }, [dialect, csvSourcePath, form.csvSourcePath, form.csvToAtlasPath, form.generateMockCsv, form.mongoUri]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setResult(null);
    setProgress(null);
    setCsvFiles([]);
    setCsvDirectoryLabel(null);
    setShowEnvDetails(false);
    const savedCsvPath = csvSourcePath?.trim() ?? '';
    const savedCsvIsGeneratedMock = /(?:^|[/\\])mock-csv(?:[/\\])?$/i.test(savedCsvPath);
    const noCsv = !savedCsvPath || savedCsvIsGeneratedMock;
    setForm((prev) => ({
      ...prev,
      csvSourcePath: savedCsvIsGeneratedMock ? '' : prev.csvSourcePath,
      generateMockCsv: noCsv ? true : prev.generateMockCsv,
    }));
    void refreshConfig();
    // Only re-run when the panel opens — path changes use the debounced validator below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !form.csvToAtlasPath.trim()) return;
    const timer = window.setTimeout(() => {
      void refreshConfig();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [open, form.csvToAtlasPath, refreshConfig]);

  useEffect(() => {
    if (csvSourcePath && open && !/(?:^|[/\\])mock-csv(?:[/\\])?$/i.test(csvSourcePath)) {
      setForm((prev) => (prev.csvSourcePath ? prev : { ...prev, csvSourcePath }));
    }
  }, [csvSourcePath, open]);

  const dataSourceMode: DataSourceMode = form.generateMockCsv ? 'mock' : 'real';
  const effectiveCsvPath = form.csvSourcePath.trim() || csvSourcePath || config?.csvSourcePath || '';
  const hasCsvSource = Boolean(config?.hasCsvSource || effectiveCsvPath || csvFiles.length > 0);
  const useMockCsv = form.generateMockCsv;
  const mockGeneratorReady = Boolean(config?.mockCsvGenerator?.ok);

  const envMongoUri = Boolean(config?.hasMongoUri);
  const envCsvToAtlas = Boolean(config?.hasCsvToAtlas);
  const formMongoUri = form.mongoUri.trim();
  const hasMongoUriInput = Boolean(formMongoUri && formMongoUri !== '(configured in .env)');
  const mongoReachable = Boolean(config?.mongoConnectivity?.ok);
  const hasMongoUri = mongoReachable;
  const hasCsvToAtlasInput = Boolean(form.csvToAtlasPath.trim());
  const hasCsvToAtlas = envCsvToAtlas || hasCsvToAtlasInput;

  const csvSourceHint = `Export tables from ${dialectLabel} as CSV files named after the table or collection (e.g. products.csv).`;

  const resolveMongoUriOverride = (): string | undefined => {
    if (hasMongoUriInput) return formMongoUri;
    return undefined;
  };

  const setDataSourceMode = (mode: DataSourceMode) => {
    setForm((prev) => ({
      ...prev,
      generateMockCsv: mode === 'mock',
    }));
    if (mode === 'mock') {
      setCsvFiles([]);
      setCsvDirectoryLabel(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    void refreshConfig();
  }, [form.generateMockCsv, open, refreshConfig]);

  const handlePickCsvDirectory = async () => {
    try {
      const picked = await pickCsvDirectory();
      if (!picked) return;

      if (picked.files.length === 0) {
        setError('No CSV files found in that folder.');
        return;
      }

      setError('');
      setCsvFiles(picked.files);
      setCsvDirectoryLabel(picked.label);
      setForm((prev) => ({ ...prev, csvSourcePath: '', generateMockCsv: false }));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(String(e));
    }
  };

  const handleCsvSourcePathChange = (value: string) => {
    setCsvDirectoryLabel(null);
    setCsvFiles([]);
    setForm((prev) => ({ ...prev, csvSourcePath: value, generateMockCsv: false }));
  };

  const csvSourceDisplay =
    csvDirectoryLabel && csvFiles.length > 0
      ? `${csvDirectoryLabel} (${csvFiles.length} CSV file${csvFiles.length === 1 ? '' : 's'})`
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
      { id: 'csvToAtlas', label: 'csvToAtlas import tool', ok: hasCsvToAtlas },
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
              label: 'CSV export folder or server path',
              ok: hasCsvSource,
            },
          ]),
    ];
  }, [config, dialectLabel, mongoReachable, hasCsvToAtlas, useMockCsv, hasCsvSource, mockGeneratorReady]);

  const passedChecks = envChecks.filter((check) => check.ok).length;
  const envReady = envChecks.length > 0 && passedChecks === envChecks.length;

  const canRun = useMemo(() => {
    if (running || !model) return false;
    if (!hasMongoUri) return false;
    if (!hasCsvToAtlas) return false;
    if (useMockCsv && !mockGeneratorReady) return false;
    if (!hasCsvSource && !useMockCsv) return false;
    return true;
  }, [running, model, hasMongoUri, hasCsvToAtlas, hasCsvSource, useMockCsv, mockGeneratorReady]);

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
        dialect,
        targetDb: form.targetDb.trim() || undefined,
        drop: form.drop,
        mongoUri: resolveMongoUriOverride(),
        csvToAtlasPath: form.csvToAtlasPath.trim() || undefined,
        csvSourcePath:
          useMockCsv || csvFiles.length > 0 ? undefined : effectiveCsvPath ? effectiveCsvPath : undefined,
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
    } catch (e) {
      setError(String(e));
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
                  <label>
                    MongoDB URI
                    {envMongoUri ? <span className="pipeline-field-badge">.env configured</span> : null}
                    <input
                      type="password"
                      value={form.mongoUri === '(configured in .env)' ? '' : form.mongoUri}
                      placeholder={envMongoUri ? 'Leave empty to use .env, or enter to override' : 'mongodb+srv://…'}
                      onChange={(e) => setForm((prev) => ({ ...prev, mongoUri: e.target.value }))}
                      disabled={running}
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    csvToAtlas path
                    {envCsvToAtlas ? <span className="pipeline-field-badge">.env configured</span> : null}
                    <input
                      type="text"
                      value={form.csvToAtlasPath}
                      placeholder="/path/to/csvToAtlas (clone root or dist/)"
                      onChange={(e) => setForm((prev) => ({ ...prev, csvToAtlasPath: e.target.value }))}
                      disabled={running}
                    />
                    <span className="pipeline-hint">Clone root with package.json, or path to dist/ containing cli.js</span>
                  </label>
                </div>
                <button
                  type="button"
                  className="tertiary pipeline-env-details__refresh"
                  onClick={() => void refreshConfig()}
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
            {config.mongoConnectivity.hint ? (
              <pre className="pipeline-hint">{config.mongoConnectivity.hint}</pre>
            ) : null}
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
              <label>
                CSV folder
                <div className="pipeline-path-row">
                  <input
                    type="text"
                    value={csvSourceDisplay}
                    placeholder="Choose folder… or enter server path"
                    onChange={(e) => handleCsvSourcePathChange(e.target.value)}
                    disabled={running}
                  />
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void handlePickCsvDirectory()}
                    disabled={running}
                  >
                    Choose folder
                  </button>
                </div>
                {csvDirectoryLabel && csvFiles.length > 0 ? (
                  <span className="pipeline-hint">
                    {csvFiles.length} file(s): {csvFiles.map((f) => f.name).join(', ')}
                  </span>
                ) : (
                  <span className="pipeline-hint">
                    Upload from this browser, or type a path on the machine running the API server.
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
          </div>
        ) : null}

        <footer className="pipeline-modal__footer">
          <button type="button" className="secondary" onClick={onClose} disabled={running}>
            Cancel
          </button>
          <div className="pipeline-modal__footer-actions">
            <button type="button" className="primary" onClick={() => void handleRun()} disabled={!canRun || running}>
              {running ? 'Running…' : result ? 'Run again' : 'Run pipeline'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
