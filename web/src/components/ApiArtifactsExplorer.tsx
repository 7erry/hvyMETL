import { useCallback, useEffect, useState } from 'react';
import {
  fetchApiArtifactJson,
  fetchApiArtifacts,
  type ApiArtifactBundleInfo,
} from '../api';
import { ArtifactCodePanel } from './ArtifactCodePanel';

type ApiArtifactsExplorerProps = {
  initialBundle?: ApiArtifactBundleInfo | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

type ApiView = 'combined-openapi' | 'collection-schema' | 'collection-openapi';

export function ApiArtifactsExplorer({
  initialBundle,
  collapsed = false,
  onToggleCollapse,
}: ApiArtifactsExplorerProps) {
  const [bundle, setBundle] = useState<ApiArtifactBundleInfo | null>(initialBundle ?? null);
  const [loading, setLoading] = useState(!initialBundle);
  const [error, setError] = useState('');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [view, setView] = useState<ApiView>('combined-openapi');
  const [content, setContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);

  const refreshBundle = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await fetchApiArtifacts();
      setBundle(next);
      if (next?.collections.length) {
        setSelectedCollection((prev) => prev || next.collections[0].name);
      }
    } catch (e) {
      setError(String(e));
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialBundle) {
      void refreshBundle();
    } else if (initialBundle.collections.length > 0) {
      setSelectedCollection(initialBundle.collections[0].name);
    }
  }, [initialBundle, refreshBundle]);

  useEffect(() => {
    if (!bundle || collapsed) return;

    const load = async () => {
      setContentLoading(true);
      setError('');
      try {
        if (view === 'combined-openapi') {
          const json = await fetchApiArtifactJson(bundle.combinedOpenApiUrl);
          setContent(JSON.stringify(json, null, 2));
          return;
        }
        const collection = bundle.collections.find((entry) => entry.name === selectedCollection);
        if (!collection) {
          setContent('');
          return;
        }
        const url = view === 'collection-schema' ? collection.schemaUrl : collection.openApiUrl;
        const json = await fetchApiArtifactJson(url);
        setContent(JSON.stringify(json, null, 2));
      } catch (e) {
        setError(String(e));
        setContent('');
      } finally {
        setContentLoading(false);
      }
    };

    void load();
  }, [bundle, view, selectedCollection, collapsed]);

  const fileName =
    view === 'combined-openapi'
      ? 'openapi.json'
      : view === 'collection-schema'
        ? `${selectedCollection}.schema.json`
        : `${selectedCollection}.openapi.json`;

  const header = (
    <div className="api-artifacts-header">
      <div className="api-artifacts-header__title">
        {onToggleCollapse ? (
          <button
            type="button"
            className="api-artifacts-collapse"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand API panel' : 'Collapse API panel'}
          >
            <span className="api-artifacts-collapse__chevron" aria-hidden="true">
              {collapsed ? '▸' : '▾'}
            </span>
          </button>
        ) : null}
        <span className="api-artifacts-header__label">OpenAPI &amp; schemas</span>
        {bundle ? (
          <span className="api-artifacts-header__meta">
            {bundle.collections.length} collection{bundle.collections.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      <div className="api-artifacts-header__actions">
        {bundle ? (
          <>
            <a className="link-button api-artifacts-swagger" href={bundle.swaggerUiUrl} target="_blank" rel="noreferrer">
              Swagger UI
            </a>
            {!collapsed ? (
              <>
                <label className="api-artifacts-inline-field">
                  <span className="api-artifacts-inline-field__label">View</span>
                  <select
                    value={view}
                    onChange={(e) => setView(e.target.value as ApiView)}
                    aria-label="API artifact view"
                  >
                    <option value="combined-openapi">Combined OpenAPI</option>
                    <option value="collection-schema">Validator schema</option>
                    <option value="collection-openapi">Per-collection OpenAPI</option>
                  </select>
                </label>
                {view !== 'combined-openapi' ? (
                  <label className="api-artifacts-inline-field">
                    <span className="api-artifacts-inline-field__label">Collection</span>
                    <select
                      value={selectedCollection}
                      onChange={(e) => setSelectedCollection(e.target.value)}
                      aria-label="Collection"
                    >
                      {bundle.collections.map((collection) => (
                        <option key={collection.name} value={collection.name}>{collection.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : null}
            <button type="button" className="ghost" onClick={() => void refreshBundle()}>Refresh</button>
          </>
        ) : (
          <button type="button" className="ghost" onClick={() => void refreshBundle()}>Refresh</button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="api-artifacts-panel">
        {header}
        <p className="api-artifacts-hint">Loading API artifacts…</p>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="api-artifacts-panel">
        {header}
        <p className="api-artifacts-hint">
          No OpenAPI or schema artifacts yet. Run <strong>AI Migration Export</strong> or the full pipeline.
        </p>
        {error ? <p className="pipeline-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="api-artifacts-panel">
      {header}
      {!collapsed ? (
        <>
          {error ? <p className="pipeline-error api-artifacts-error">{error}</p> : null}
          {contentLoading ? <p className="api-artifacts-hint">Loading {fileName}…</p> : null}
          <div className="api-artifacts-viewer">
            <ArtifactCodePanel
              value={content}
              fileName={fileName}
              mime="application/json"
              isJson
              readOnly
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
