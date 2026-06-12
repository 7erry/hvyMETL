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
import type { SqlStructuralModel } from '../types';

type PipelinePanelProps = {
  open: boolean;
  onClose: () => void;
  model: SqlStructuralModel;
  ddl: string;
  profileId: string;
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
};

export function PipelinePanel({
  open,
  onClose,
  model,
  ddl,
  profileId,
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
  const [form, setForm] = useState<PipelineForm>({
    mongoUri: '',
    csvToAtlasPath: '',
    targetDb: 'csv_to_atlas',
    csvSourcePath: csvSourcePath ?? '',
    drop: true,
  });

  const refreshConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const status = await fetchPipelineConfig({
        schemaDialect: dialect,
        csvSourcePath: form.csvSourcePath || csvSourcePath || undefined,
        csvToAtlasPath: form.csvToAtlasPath.trim() || undefined,
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
  }, [dialect, csvSourcePath, form.csvSourcePath, form.csvToAtlasPath]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setResult(null);
    setProgress(null);
    setCsvFiles([]);
    setCsvDirectoryLabel(null);
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
    if (csvSourcePath && open) {
      setForm((prev) => (prev.csvSourcePath ? prev : { ...prev, csvSourcePath }));
    }
  }, [csvSourcePath, open]);

  const effectiveCsvPath = form.csvSourcePath.trim() || csvSourcePath || config?.csvSourcePath || '';
  const hasCsvSource = Boolean(config?.hasCsvSource || effectiveCsvPath || csvFiles.length > 0);

  const envMongoUri = Boolean(config?.hasMongoUri);
  const envCsvToAtlas = Boolean(config?.hasCsvToAtlas);
  const formMongoUri = form.mongoUri.trim();
  const hasMongoUriInput = Boolean(formMongoUri && formMongoUri !== '(configured in .env)');
  const hasMongoUri = envMongoUri || hasMongoUriInput;
  const hasCsvToAtlasInput = Boolean(form.csvToAtlasPath.trim());
  const hasCsvToAtlas = envCsvToAtlas || hasCsvToAtlasInput;

  const csvSourceHint = `Export tables from ${dialectLabel} as CSV files. Name files after the table or MongoDB collection (e.g. products.csv).`;

  const resolveMongoUriOverride = (): string | undefined => {
    if (hasMongoUriInput) return formMongoUri;
    return undefined;
  };

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
      setForm((prev) => ({ ...prev, csvSourcePath: '' }));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(String(e));
    }
  };

  const handleCsvSourcePathChange = (value: string) => {
    setCsvDirectoryLabel(null);
    setCsvFiles([]);
    setForm((prev) => ({ ...prev, csvSourcePath: value }));
  };

  const csvSourceDisplay =
    csvDirectoryLabel && csvFiles.length > 0
      ? `${csvDirectoryLabel} (${csvFiles.length} CSV file${csvFiles.length === 1 ? '' : 's'})`
      : form.csvSourcePath;

  const canRun = useMemo(() => {
    if (running || !model) return false;
    if (!hasMongoUri) return false;
    if (!hasCsvToAtlas) return false;
    if (!hasCsvSource) return false;
    return true;
  }, [running, model, hasMongoUri, hasCsvToAtlas, hasCsvSource]);

  const handleRun = async () => {
    setRunning(true);
    setError('');
    setResult(null);
    setProgress({ stage: 'validating', message: 'Starting pipeline…' });
    try {
      const overrides = {
        profileId,
        model,
        ddl,
        dialect,
        targetDb: form.targetDb.trim() || undefined,
        drop: form.drop,
        mongoUri: resolveMongoUriOverride(),
        csvToAtlasPath: form.csvToAtlasPath.trim() || undefined,
        csvSourcePath: csvFiles.length === 0 && effectiveCsvPath ? effectiveCsvPath : undefined,
      };

      const onProgress = (event: PipelineProgressEvent) => setProgress(event);

      const pipelineResult =
        csvFiles.length > 0
          ? await runPipelineWithCsv(csvFiles, overrides, onProgress)
          : await runPipeline(overrides, onProgress);

      setResult(pipelineResult);
      if (pipelineResult.csvSourcePath) {
        onCsvSourcePathChange(pipelineResult.csvSourcePath);
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
          <h2 id="pipeline-title">Run Full Pipeline</h2>
          <button type="button" className="ghost" onClick={onClose} disabled={running} aria-label="Close">
            ✕
          </button>
        </header>

        <p style={{ fontSize: '0.85rem', opacity: 0.85, marginTop: 0 }}>
          Design → Atlas import via csvToAtlas. Schema comes from your import; row data from CSV exports.
        </p>

        <div className="pipeline-schema-source">
          <span className="pipeline-schema-source__label">Schema source</span>
          <strong>{dialectLabel}</strong>
          <span className="pipeline-schema-source__meta">from schema import</span>
        </div>

        {loadingConfig ? (
          <p>Loading configuration…</p>
        ) : config ? (
          <ul className="pipeline-status">
            <li className="ok">Schema dialect {dialectLabel} ✓</li>
            <li className={config.hasMongoUri ? 'ok' : 'missing'}>
              MONGODB_URI {config.hasMongoUri ? '✓' : '— required'}
            </li>
            <li className={config.hasCsvToAtlas ? 'ok' : 'missing'}>
              CSV_TO_ATLAS_PATH {config.hasCsvToAtlas ? `✓ ${config.csvToAtlasLabel ?? ''}` : '— required'}
            </li>
            <li className={hasCsvSource ? 'ok' : 'missing'}>
              CSV data source{' '}
              {hasCsvSource
                ? `✓ ${csvDirectoryLabel && csvFiles.length ? `${csvDirectoryLabel} (${csvFiles.length} CSVs)` : effectiveCsvPath}`
                : '— choose a CSV folder or enter a server path'}
            </li>
          </ul>
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

        <div className="pipeline-form">
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
              placeholder="/path/to/cvsToAtlas (clone root or dist/)"
              onChange={(e) => setForm((prev) => ({ ...prev, csvToAtlasPath: e.target.value }))}
              disabled={running}
            />
            <span className="pipeline-hint" style={{ marginTop: '0.25rem' }}>
              Clone root with package.json, or path to dist/ containing cli.js
            </span>
          </label>

          <p className="pipeline-hint">{csvSourceHint}</p>
          <label>
            CSV directory
            <div className="pipeline-path-row">
              <input
                type="text"
                value={csvSourceDisplay}
                placeholder="Choose folder… or enter server path (e.g. /path/to/csv/exports)"
                onChange={(e) => handleCsvSourcePathChange(e.target.value)}
                disabled={running}
              />
              <button
                type="button"
                className="primary"
                onClick={() => void handlePickCsvDirectory()}
                disabled={running}
              >
                Choose folder
              </button>
            </div>
            {csvDirectoryLabel && csvFiles.length > 0 ? (
              <span className="pipeline-hint" style={{ marginTop: '0.25rem' }}>
                {csvFiles.length} file(s): {csvFiles.map((f) => f.name).join(', ')}
              </span>
            ) : (
              <span className="pipeline-hint" style={{ marginTop: '0.25rem' }}>
                Choose a folder to upload CSVs from this browser, or type a path on the machine running the API.
              </span>
            )}
          </label>

          <label>
            Target database
            <input
              type="text"
              value={form.targetDb}
              onChange={(e) => setForm((prev) => ({ ...prev, targetDb: e.target.value }))}
              disabled={running}
            />
          </label>

          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.drop}
              disabled={running}
              onChange={(e) => setForm((prev) => ({ ...prev, drop: e.target.checked }))}
            />
            Drop collections before import
          </label>
        </div>

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
            <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>Output: {result.paths.outDir}</p>
          </div>
        ) : null}

        <footer className="pipeline-modal__footer">
          <button type="button" className="ghost" onClick={() => void refreshConfig()} disabled={loadingConfig}>
            Refresh config
          </button>
          <button type="button" className="primary" onClick={() => void handleRun()} disabled={!canRun || running}>
            {running ? 'Running…' : result ? 'Run Again' : 'Run Full Pipeline'}
          </button>
        </footer>
      </div>
    </div>
  );
}
