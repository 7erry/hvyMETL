import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchPipelineConfig,
  runPipeline,
  runPipelineWithSource,
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
  sourceDbPath: string | null;
  onSourceDbPathChange: (path: string) => void;
  onComplete: (result: PipelineRunResult) => void;
};

type PipelineForm = {
  mongoUri: string;
  csvToAtlasPath: string;
  targetDb: string;
  sourceDbPath: string;
  dryRun: boolean;
  drop: boolean;
};

export function PipelinePanel({
  open,
  onClose,
  model,
  ddl,
  profileId,
  sourceDbPath,
  onSourceDbPathChange,
  onComplete,
}: PipelinePanelProps) {
  const [config, setConfig] = useState<PipelineConfigStatus | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PipelineRunResult | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [form, setForm] = useState<PipelineForm>({
    mongoUri: '',
    csvToAtlasPath: '',
    targetDb: 'csv_to_atlas',
    sourceDbPath: sourceDbPath ?? '',
    dryRun: false,
    drop: true,
  });

  const refreshConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const status = await fetchPipelineConfig();
      setConfig(status);
      setForm((prev) => ({
        ...prev,
        targetDb: status.defaultTargetDb,
        sourceDbPath: prev.sourceDbPath || status.sourceDbPath || sourceDbPath || '',
        mongoUri: prev.mongoUri || (status.hasMongoUri ? '(configured in .env)' : ''),
        csvToAtlasPath: prev.csvToAtlasPath || status.csvToAtlasLabel || '',
      }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingConfig(false);
    }
  }, [sourceDbPath]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setResult(null);
    void refreshConfig();
  }, [open, refreshConfig]);

  useEffect(() => {
    if (sourceDbPath) {
      setForm((prev) => ({ ...prev, sourceDbPath }));
    }
  }, [sourceDbPath]);

  const needsMongoUri = !config?.hasMongoUri;
  const needsCsvToAtlas = !config?.hasCsvToAtlas;
  const needsSourceDb = !config?.hasSourceDb && !form.sourceDbPath.trim() && !sourceFile;

  const canRun = useMemo(() => {
    if (running || !model) return false;
    if (needsMongoUri && !form.mongoUri.trim()) return false;
    if (needsCsvToAtlas && !form.csvToAtlasPath.trim()) return false;
    if (needsSourceDb) return false;
    return true;
  }, [running, model, needsMongoUri, needsCsvToAtlas, needsSourceDb, form.mongoUri, form.csvToAtlasPath]);

  const handleRun = async () => {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const overrides = {
        profileId,
        model,
        ddl,
        targetDb: form.targetDb.trim() || undefined,
        dryRun: form.dryRun,
        drop: form.drop,
        mongoUri: needsMongoUri ? form.mongoUri.trim() : undefined,
        csvToAtlasPath: needsCsvToAtlas ? form.csvToAtlasPath.trim() : undefined,
        sourceDbPath: !sourceFile && form.sourceDbPath.trim() ? form.sourceDbPath.trim() : undefined,
      };

      const pipelineResult = sourceFile
        ? await runPipelineWithSource(sourceFile, overrides)
        : await runPipeline(overrides);

      setResult(pipelineResult);
      if (pipelineResult.sourcePath) {
        onSourceDbPathChange(pipelineResult.sourcePath);
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
          Design → ETL → Atlas import via csvToAtlas. Values from <code>.env</code> are used when present; fill in
          missing fields below.
        </p>

        {loadingConfig ? (
          <p>Loading configuration…</p>
        ) : config ? (
          <ul className="pipeline-status">
            <li className={config.hasMongoUri ? 'ok' : 'missing'}>
              MONGODB_URI {config.hasMongoUri ? '✓' : '— required'}
            </li>
            <li className={config.hasCsvToAtlas ? 'ok' : 'missing'}>
              CSV_TO_ATLAS_PATH {config.hasCsvToAtlas ? `✓ ${config.csvToAtlasLabel ?? ''}` : '— required'}
            </li>
            <li className={config.hasSourceDb || form.sourceDbPath || sourceFile ? 'ok' : 'missing'}>
              SQLite source {config.hasSourceDb ? `✓ ${config.sourceDbPath}` : '— upload or set HVYMETL_SOURCE_DB'}
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
                placeholder="/path/to/cvsToAtlas"
                onChange={(e) => setForm((prev) => ({ ...prev, csvToAtlasPath: e.target.value }))}
              />
            </label>
          )}

          {!config?.hasSourceDb && (
            <>
              <label>
                SQLite source path (optional if uploading)
                <input
                  type="text"
                  value={form.sourceDbPath}
                  placeholder="/path/to/source.db"
                  onChange={(e) => setForm((prev) => ({ ...prev, sourceDbPath: e.target.value }))}
                />
              </label>
              <label className="pipeline-file">
                Or upload SQLite database
                <input
                  type="file"
                  accept=".db,.sqlite,.sqlite3"
                  onChange={(e) => setSourceFile(e.target.files?.[0] ?? null)}
                />
                {sourceFile ? <span>{sourceFile.name}</span> : null}
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
              checked={form.dryRun}
              onChange={(e) => setForm((prev) => ({ ...prev, dryRun: e.target.checked }))}
            />
            ETL dry run (limited rows)
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
            <p>
              {result.ok ? 'Pipeline completed successfully.' : 'Pipeline finished with errors.'}
              {result.etl.elapsedSeconds != null ? ` ETL: ${result.etl.elapsedSeconds.toFixed(1)}s.` : ''}
            </p>
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
