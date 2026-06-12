import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchPipelineConfig,
  runPipeline,
  runPipelineWithCsv,
  type PipelineConfigStatus,
  type PipelineRunResult,
} from '../api';
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
  const [error, setError] = useState('');
  const [result, setResult] = useState<PipelineRunResult | null>(null);
  const [csvFiles, setCsvFiles] = useState<File[]>([]);
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
        targetDb: status.defaultTargetDb,
        csvSourcePath: prev.csvSourcePath || csvSourcePath || status.csvSourcePath || '',
        mongoUri: prev.mongoUri || (status.hasMongoUri ? '(configured in .env)' : ''),
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
    setCsvFiles([]);
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
    if (csvSourcePath) {
      setForm((prev) => ({ ...prev, csvSourcePath }));
    }
  }, [csvSourcePath]);

  const effectiveCsvPath = form.csvSourcePath.trim() || csvSourcePath || config?.csvSourcePath || '';
  const hasCsvSource = Boolean(config?.hasCsvSource || effectiveCsvPath || csvFiles.length > 0);

  const needsMongoUri = !config?.hasMongoUri;
  const needsCsvToAtlas = !config?.hasCsvToAtlas;
  const needsCsvSource = !hasCsvSource;

  const csvSourceHint = `Export tables from ${dialectLabel} as CSV files. Name files after the table or MongoDB collection (e.g. products.csv).`;

  const canRun = useMemo(() => {
    if (running || !model) return false;
    if (needsMongoUri && !form.mongoUri.trim()) return false;
    if (needsCsvToAtlas && !form.csvToAtlasPath.trim()) return false;
    if (needsCsvSource) return false;
    return true;
  }, [running, model, needsMongoUri, needsCsvToAtlas, needsCsvSource, form.mongoUri, form.csvToAtlasPath]);

  const handleRun = async () => {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const overrides = {
        profileId,
        model,
        ddl,
        dialect,
        targetDb: form.targetDb.trim() || undefined,
        drop: form.drop,
        mongoUri: needsMongoUri ? form.mongoUri.trim() : undefined,
        csvToAtlasPath: needsCsvToAtlas ? form.csvToAtlasPath.trim() : undefined,
        csvSourcePath: csvFiles.length === 0 && effectiveCsvPath ? effectiveCsvPath : undefined,
      };

      const pipelineResult =
        csvFiles.length > 0 ? await runPipelineWithCsv(csvFiles, overrides) : await runPipeline(overrides);

      setResult(pipelineResult);
      if (pipelineResult.csvSourcePath) {
        onCsvSourcePathChange(pipelineResult.csvSourcePath);
      }
      onComplete(pipelineResult);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  if (!open) return null;

  return (
    <div className="pipeline-overlay" role="dialog" aria-modal="true" aria-labelledby="pipeline-title">
      <div className="pipeline-modal panel">
        <header className="pipeline-modal__header">
          <h2 id="pipeline-title">Run Full Pipeline</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">
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
                ? `✓ ${csvFiles.length ? `${csvFiles.length} file(s) selected` : effectiveCsvPath}`
                : '— directory path or upload CSVs'}
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
          {needsMongoUri && (
            <label>
              MongoDB URI
              <input
                type="password"
                value={form.mongoUri === '(configured in .env)' ? '' : form.mongoUri}
                placeholder="mongodb+srv://…"
                onChange={(e) => setForm((prev) => ({ ...prev, mongoUri: e.target.value }))}
                autoComplete="off"
              />
            </label>
          )}

          {needsCsvToAtlas && (
            <label>
              csvToAtlas path
              <input
                type="text"
                value={form.csvToAtlasPath}
                placeholder="/path/to/cvsToAtlas (clone root or dist/)"
                onChange={(e) => setForm((prev) => ({ ...prev, csvToAtlasPath: e.target.value }))}
              />
              <span className="pipeline-hint" style={{ marginTop: '0.25rem' }}>
                Clone root with package.json, or path to dist/ containing cli.js
              </span>
            </label>
          )}

          {needsCsvSource && (
            <>
              <p className="pipeline-hint">{csvSourceHint}</p>
              <label>
                CSV directory path
                <input
                  type="text"
                  value={form.csvSourcePath}
                  placeholder="/path/to/csv/exports"
                  onChange={(e) => setForm((prev) => ({ ...prev, csvSourcePath: e.target.value }))}
                />
              </label>
              <label className="pipeline-file">
                Or upload CSV files
                <input
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  onChange={(e) => setCsvFiles(Array.from(e.target.files ?? []))}
                />
                {csvFiles.length > 0 ? <span>{csvFiles.length} file(s): {csvFiles.map((f) => f.name).join(', ')}</span> : null}
              </label>
            </>
          )}

          <label>
            Target database
            <input
              type="text"
              value={form.targetDb}
              onChange={(e) => setForm((prev) => ({ ...prev, targetDb: e.target.value }))}
            />
          </label>

          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.drop}
              onChange={(e) => setForm((prev) => ({ ...prev, drop: e.target.checked }))}
            />
            Drop collections before import
          </label>
        </div>

        {error ? <p className="pipeline-error">{error}</p> : null}

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
          <button type="button" className="primary" onClick={() => void handleRun()} disabled={!canRun}>
            {running ? 'Running…' : 'Run Full Pipeline'}
          </button>
        </footer>
      </div>
    </div>
  );
}
