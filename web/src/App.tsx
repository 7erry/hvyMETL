import { useCallback, useEffect, useState } from 'react';
import { MongoLogo } from './components/MongoLogo';
import { SchemaCanvas, duplicateTableInModel } from './components/SchemaCanvas';
import {
  downloadJson,
  downloadText,
  exportMigration,
  exportPrompts,
  fetchDialects,
  fetchProfiles,
  fetchTemplates,
  importDdl,
  importSqlite,
  type DiagramExport,
} from './api';
import type { Dialect, Profile, SqlStructuralModel } from './types';

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [dialects, setDialects] = useState<Dialect[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; ddl: string; model: SqlStructuralModel }[]>([]);
  const [profileId, setProfileId] = useState('catalog');
  const [dialect, setDialect] = useState('postgresql');
  const [ddl, setDdl] = useState('');
  const [model, setModel] = useState<SqlStructuralModel | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [status, setStatus] = useState('');
  const [exportPreview, setExportPreview] = useState('');

  useEffect(() => {
    void Promise.all([fetchProfiles(), fetchDialects(), fetchTemplates()]).then(([p, d, t]) => {
      setProfiles(p);
      setDialects(d);
      setTemplates(t);
    });
  }, []);

  const applySchema = useCallback(async (nextDdl: string, nextModel: SqlStructuralModel) => {
    setDdl(nextDdl);
    setModel(nextModel);
    setPositions({});
    setStatus(`Imported ${nextModel.tables.length} tables.`);
  }, []);

  const handleImportQuery = async () => {
    try {
      setStatus('Importing schema…');
      const { model: m } = await importDdl(ddl, dialect);
      await applySchema(ddl, m);
    } catch (e) {
      setStatus(`Import failed: ${String(e)}`);
    }
  };

  const handleSqliteUpload = async (file: File) => {
    try {
      setStatus('Reading SQLite database…');
      const { model: m, ddl: d } = await importSqlite(file);
      setDialect('sqlite');
      await applySchema(d, m);
    } catch (e) {
      setStatus(`SQLite import failed: ${String(e)}`);
    }
  };

  const handleTemplate = async (t: (typeof templates)[0]) => {
    await applySchema(t.ddl, t.model);
    setStatus(`Loaded ${t.name} template.`);
  };

  const handleDuplicate = (tableName: string) => {
    if (!model) return;
    const { model: next, positions: nextPos } = duplicateTableInModel(model, tableName, positions);
    setModel(next);
    setPositions(nextPos);
    setStatus(`Duplicated table ${tableName}.`);
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
        setDialect(data.dialect);
        setDdl(data.ddl);
        setModel(data.model);
        setPositions(data.positions ?? {});
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
      setStatus('Generating AI-powered migration export…');
      const result = await exportMigration(model, profileId, ddl);
      setExportPreview(result.designReportMarkdown?.slice(0, 2000) ?? JSON.stringify(result.plan, null, 2).slice(0, 2000));
      downloadJson('migration-plan.json', result.migrationPlanJson ?? result.plan);
      downloadText('design-report.md', result.designReportMarkdown ?? '', 'text/markdown');
      const prompts = await exportPrompts(ddl, profileId);
      for (const p of prompts.prompts ?? []) {
        downloadText(p.fileName, p.content, 'text/markdown');
      }
      setStatus(`Exported migration plan, design report, and ${prompts.prompts?.length ?? 0} RAG prompts.`);
    } catch (e) {
      setStatus(`Export failed: ${String(e)}`);
    }
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
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)} aria-label="Workload profile">
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button type="button" className="primary" onClick={() => void handleAiExport()} disabled={!model}>
            AI Migration Export
          </button>
          <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>CLI: npm run hvymetl</span>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside
          style={{
            width: 320,
            borderRight: '1px solid #00684A',
            padding: '0.75rem',
            overflowY: 'auto',
            background: '#001E2B',
          }}
        >
          <div className="panel" style={{ marginBottom: '0.75rem' }}>
            <h3>Instant Schema Import</h3>
            <label style={{ fontSize: '0.8rem' }}>Database dialect</label>
            <select value={dialect} onChange={(e) => setDialect(e.target.value)} style={{ width: '100%', marginBottom: '0.5rem' }}>
              {dialects.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                  {d.live ? ' ✓' : ' (DDL paste)'}
                </option>
              ))}
            </select>
            <textarea
              value={ddl}
              onChange={(e) => setDdl(e.target.value)}
              placeholder="Paste one CREATE TABLE query or full DDL script…"
              rows={8}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="primary" onClick={() => void handleImportQuery()}>
                Import Query
              </button>
              <label className="ghost" style={{ padding: '0.45rem 0.85rem', cursor: 'pointer' }}>
                SQLite file
                <input
                  type="file"
                  accept=".db,.sqlite,.sqlite3"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleSqliteUpload(f);
                  }}
                />
              </label>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: '0.75rem' }}>
            <h3>Templates</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {templates.map((t) => (
                <button key={t.id} type="button" onClick={() => void handleTemplate(t)}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="panel" style={{ marginBottom: '0.75rem' }}>
            <h3>Canvas</h3>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
              Snap to grid (hold Shift for free move)
            </label>
            {model && (
              <ul style={{ fontSize: '0.8rem', paddingLeft: '1rem', margin: '0.5rem 0' }}>
                {model.tables.map((t) => (
                  <li key={t.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.25rem' }}>
                    <span>{t.name}</span>
                    <button type="button" className="ghost" style={{ padding: '0 0.35rem' }} onClick={() => handleDuplicate(t.name)}>
                      ⧉
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <h3>Share Diagram</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <button type="button" onClick={handleExportDiagram} disabled={!model}>
                Export diagram JSON
              </button>
              <label style={{ textAlign: 'center', cursor: 'pointer' }}>
                Import diagram JSON
                <input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && handleImportDiagram(e.target.files[0])} />
              </label>
            </div>
          </div>
        </aside>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <SchemaCanvas
            model={model}
            snapToGrid={snapToGrid}
            onPositionsChange={setPositions}
            positions={positions}
            onDuplicateTable={handleDuplicate}
          />
          <footer style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderTop: '1px solid #00684A', background: '#112733' }}>
            {status || 'Ready — Broad database support via DDL import; SQLite live connection supported.'}
          </footer>
          {exportPreview && (
            <pre
              style={{
                maxHeight: 120,
                overflow: 'auto',
                margin: 0,
                padding: '0.5rem 1rem',
                fontSize: '0.7rem',
                background: '#023430',
                borderTop: '1px solid #00684A',
              }}
            >
              {exportPreview}…
            </pre>
          )}
        </main>
      </div>
    </div>
  );
}
