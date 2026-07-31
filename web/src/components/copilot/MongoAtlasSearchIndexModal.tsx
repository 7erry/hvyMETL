import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AtlasSearchPattern } from '../../../../src/copilot/mongoAtlasSearchIndex.ts';
import { parseMultiDatabaseCollectionError } from '../../../../src/copilot/parseMultiDatabaseCollectionError.ts';
import { createCopilotMongoAtlasSearchIndex, invokeCopilotMongoInspect } from '../../api';
import {
  mergeCollectionNameOptions,
  normalizeVectorIndexCollectionHint,
  normalizeVectorIndexDatabaseHint,
  pickInitialCatalogName,
} from '../../copilot/mongoVectorAutoEmbedCatalog';
import {
  formatSchemaFieldPickLabel,
  listSchemaFieldPickOptions,
  type SchemaFieldPickOption,
} from '../../copilot/mongoVectorAutoEmbedFields';
import { enrichSchemaFieldRowsFromPlan } from '../../copilot/mongoVectorAutoEmbedPlanFields';
import {
  readMongoInspectCollectionRows,
  readMongoInspectDatabaseRows,
  readMongoInspectSchemaSummary,
} from '../../copilot/mongoInspectFormat';
import { useCopilot } from '../../copilot/CopilotContext';
import { copilotAtlasSearchIndexFromCreateResult } from '../../../../src/copilot/copilotAtlasSearchContext.ts';
import type { MigrationPlan } from '../../migrationPlanTypes';

const DEFAULT_NUMBER_FACET_BOUNDARIES = [0, 25, 50, 100];

function fieldTypesAllowNumberFacet(types: string): boolean {
  const normalized = types.trim().toLowerCase();
  if (!normalized || normalized === 'unknown') return true;
  return /\b(number|int|double|decimal|long|float)\b/.test(normalized);
}

export type MongoAtlasSearchIndexModalProps = {
  open: boolean;
  database?: string;
  collection: string;
  pattern?: AtlasSearchPattern;
  initialPath?: string;
  textFieldPaths?: string[];
  migrationPlan?: MigrationPlan | null;
  onClose: () => void;
  onCreated?: (summary: string) => void;
};

const EMPTY_TEXT_FIELD_PATHS: string[] = [];

function MongoAtlasSearchIndexModalPanel({
  database,
  collection,
  pattern: initialPattern = 'keyword',
  initialPath,
  textFieldPaths = EMPTY_TEXT_FIELD_PATHS,
  migrationPlan = null,
  onClose,
  onCreated,
}: Omit<MongoAtlasSearchIndexModalProps, 'open'>) {
  const copilot = useCopilot();
  const databaseHint = normalizeVectorIndexDatabaseHint(database);
  const collectionHint = normalizeVectorIndexCollectionHint(collection);
  const pipelineDatabase = normalizeVectorIndexDatabaseHint(copilot.targetDatabase);
  const textFieldPathsKey = textFieldPaths.join('\u0001');
  const sessionKey = `${databaseHint}\u0000${collectionHint}\u0000${initialPattern}\u0000${initialPath ?? ''}\u0000${textFieldPathsKey}`;
  const initializedSessionRef = useRef<string | null>(null);
  const catalogRequestRef = useRef(0);
  const schemaLoadRequestRef = useRef(0);
  const loadCollectionsRef = useRef<(db: string, preferredCollection?: string) => Promise<void>>(async () => {});

  const [pattern, setPattern] = useState<AtlasSearchPattern>(initialPattern);
  const [logicalDatabase, setLogicalDatabase] = useState(databaseHint);
  const [databaseOptions, setDatabaseOptions] = useState<string[]>([]);
  const [collectionOptions, setCollectionOptions] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState(databaseHint);
  const [selectedCollection, setSelectedCollection] = useState(collectionHint);
  const [fieldOptions, setFieldOptions] = useState<SchemaFieldPickOption[]>([]);
  const [keywordPaths, setKeywordPaths] = useState<string[]>(() =>
    initialPath?.trim() ? [initialPath.trim()] : [],
  );
  const [autocompletePath, setAutocompletePath] = useState(initialPath?.trim() ?? '');
  const [facetedTextPath, setFacetedTextPath] = useState(initialPath?.trim() ?? '');
  const [facetedStringPaths, setFacetedStringPaths] = useState<string[]>([]);
  const [facetedNumberPath, setFacetedNumberPath] = useState('');
  const [loadingDatabases, setLoadingDatabases] = useState(true);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [catalogLoadError, setCatalogLoadError] = useState('');
  const [fieldLoadError, setFieldLoadError] = useState('');
  const [indexName, setIndexName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const stringFieldOptions = fieldOptions.filter((entry) => entry.isStringType);
  const numberFieldOptions = fieldOptions.filter((entry) => fieldTypesAllowNumberFacet(entry.types));

  const loadFieldsForTarget = useCallback(
    async (explicitDatabase: string, explicitCollection: string) => {
      const requestId = ++schemaLoadRequestRef.current;
      const db = explicitDatabase.trim();
      const coll = explicitCollection.trim();

      if (!db || !coll) {
        setFieldOptions([]);
        setKeywordPaths([]);
        setAutocompletePath('');
        setFacetedTextPath('');
        setFacetedStringPaths([]);
        setFacetedNumberPath('');
        setFieldLoadError('');
        return;
      }

      setLoadingFields(true);
      setFieldLoadError('');

      try {
        const response = await invokeCopilotMongoInspect('describeMongoCollectionSchema', {
          database: db,
          collection: coll,
        });
        if (requestId !== schemaLoadRequestRef.current) return;

        if (!response.ok) {
          const choices = parseMultiDatabaseCollectionError(response.summary);
          if (choices?.length) {
            setDatabaseOptions(choices);
            const nextDb = pickInitialCatalogName(choices, [db, databaseHint, pipelineDatabase]);
            setSelectedDatabase(nextDb);
            setLogicalDatabase(nextDb);
            setFieldLoadError('');
            await loadCollectionsRef.current(nextDb, coll);
            return;
          }
          setFieldLoadError(response.summary);
          setFieldOptions([]);
          return;
        }

        const summary = readMongoInspectSchemaSummary(response.data);
        setLogicalDatabase(summary.database);
        setSelectedDatabase(summary.database);
        const enrichedFields = enrichSchemaFieldRowsFromPlan(summary.fields, migrationPlan, coll);
        const options = listSchemaFieldPickOptions(enrichedFields);
        setFieldOptions(options);

        const preferred = initialPath?.trim();
        if (preferred && options.some((entry) => entry.path === preferred)) {
          setKeywordPaths([preferred]);
          setAutocompletePath(preferred);
          setFacetedTextPath(preferred);
        }
      } catch (loadError) {
        if (requestId === schemaLoadRequestRef.current) {
          setFieldLoadError(String(loadError));
          setFieldOptions([]);
        }
      } finally {
        if (requestId === schemaLoadRequestRef.current) {
          setLoadingFields(false);
        }
      }
    },
    [databaseHint, initialPath, migrationPlan, pipelineDatabase],
  );

  const loadCollectionsForDatabase = useCallback(
    async (explicitDatabase: string, preferredCollection = collectionHint) => {
      const db = explicitDatabase.trim();
      if (!db) {
        setCollectionOptions([]);
        setSelectedCollection('');
        setFieldOptions([]);
        return;
      }

      setLoadingCollections(true);
      setFieldLoadError('');

      try {
        const response = await invokeCopilotMongoInspect('listMongoCollections', { database: db });
        let apiNames: string[] = [];
        if (response.ok) {
          const payload = readMongoInspectCollectionRows(response.data);
          apiNames = payload.collections.map((entry) => entry.name);
        } else {
          setCatalogLoadError((previous) => previous || response.summary);
        }

        const planNames = migrationPlan?.collections.map((entry) => entry.name) ?? [];
        const names = mergeCollectionNameOptions(apiNames, planNames);
        setCollectionOptions(names);
        const nextCollection = pickInitialCatalogName(names, [preferredCollection]);
        setSelectedCollection(nextCollection);
        await loadFieldsForTarget(db, nextCollection);
      } catch (loadError) {
        setFieldLoadError(String(loadError));
        setFieldOptions([]);
      } finally {
        setLoadingCollections(false);
      }
    },
    [collectionHint, loadFieldsForTarget, migrationPlan],
  );

  loadCollectionsRef.current = loadCollectionsForDatabase;

  const bootstrapCatalog = useCallback(async () => {
    const requestId = ++catalogRequestRef.current;
    setLoadingDatabases(true);
    setCatalogLoadError('');
    setFieldLoadError('');

    try {
      const response = await invokeCopilotMongoInspect('listMongoDatabases', {});
      if (requestId !== catalogRequestRef.current) return;

      if (!response.ok) {
        setCatalogLoadError(response.summary);
        const fallbackDb = pickInitialCatalogName([], [databaseHint, pipelineDatabase]);
        if (fallbackDb) {
          setDatabaseOptions([fallbackDb]);
          setSelectedDatabase(fallbackDb);
          setLogicalDatabase(fallbackDb);
          await loadCollectionsForDatabase(fallbackDb);
        }
        return;
      }

      const rows = readMongoInspectDatabaseRows(response.data);
      const names = rows.map((row) => row.name).sort((left, right) => left.localeCompare(right));
      setDatabaseOptions(names);
      const nextDb = pickInitialCatalogName(names, [databaseHint, pipelineDatabase]);
      setSelectedDatabase(nextDb);
      setLogicalDatabase(nextDb);
      await loadCollectionsForDatabase(nextDb);
    } catch (loadError) {
      if (requestId === catalogRequestRef.current) {
        setCatalogLoadError(String(loadError));
      }
    } finally {
      if (requestId === catalogRequestRef.current) {
        setLoadingDatabases(false);
      }
    }
  }, [databaseHint, loadCollectionsForDatabase, pipelineDatabase]);

  useEffect(() => {
    if (initializedSessionRef.current === sessionKey) {
      return;
    }
    initializedSessionRef.current = sessionKey;

    setPattern(initialPattern);
    setIndexName('');
    setBusy(false);
    setError('');
    setCatalogLoadError('');
    setFieldLoadError('');
    setDatabaseOptions([]);
    setCollectionOptions([]);
    setLogicalDatabase(databaseHint);
    setSelectedDatabase(databaseHint);
    setSelectedCollection(collectionHint);
    setFieldOptions([]);
    setKeywordPaths(initialPath?.trim() ? [initialPath.trim()] : []);
    setAutocompletePath(initialPath?.trim() ?? '');
    setFacetedTextPath(initialPath?.trim() ?? '');
    setFacetedStringPaths([]);
    setFacetedNumberPath('');

    void bootstrapCatalog();
  }, [sessionKey, databaseHint, collectionHint, initialPattern, initialPath, textFieldPathsKey, bootstrapCatalog]);

  const handleDatabaseChange = (nextDatabase: string) => {
    setSelectedDatabase(nextDatabase);
    setLogicalDatabase(nextDatabase);
    void loadCollectionsForDatabase(nextDatabase, '');
  };

  const handleCollectionChange = (nextCollection: string) => {
    setSelectedCollection(nextCollection);
    void loadFieldsForTarget(selectedDatabase, nextCollection);
  };

  const toggleKeywordPath = (path: string) => {
    setKeywordPaths((previous) =>
      previous.includes(path) ? previous.filter((entry) => entry !== path) : [...previous, path],
    );
  };

  const toggleFacetedStringPath = (path: string) => {
    setFacetedStringPaths((previous) =>
      previous.includes(path) ? previous.filter((entry) => entry !== path) : [...previous, path],
    );
  };

  const targetLabel =
    logicalDatabase.trim() && selectedCollection.trim()
      ? `${logicalDatabase}.${selectedCollection}`
      : selectedCollection.trim() || logicalDatabase.trim() || 'your collection';

  const catalogLoading = loadingDatabases || loadingCollections;

  const canCreate =
    Boolean(selectedDatabase.trim() && selectedCollection.trim()) &&
    !loadingFields &&
    (pattern === 'keyword'
      ? keywordPaths.length > 0
      : pattern === 'autocomplete'
        ? Boolean(autocompletePath.trim())
        : Boolean(facetedTextPath.trim()) &&
          (facetedStringPaths.length > 0 || facetedNumberPath.trim().length > 0));

  const handleSubmit = async () => {
    setError('');
    const resolvedDatabase = selectedDatabase.trim() || logicalDatabase.trim();
    const resolvedCollection = selectedCollection.trim();

    if (!resolvedDatabase) {
      setError('Select a database.');
      return;
    }
    if (!resolvedCollection) {
      setError('Select a collection.');
      return;
    }

    const base = {
      database: resolvedDatabase,
      collection: resolvedCollection,
      pattern,
      ...(indexName.trim() ? { name: indexName.trim() } : {}),
    };

    let body: Record<string, unknown>;
    if (pattern === 'keyword') {
      if (keywordPaths.length === 0) {
        setError('Select at least one string field to index for full-text search.');
        return;
      }
      body = { ...base, textPaths: keywordPaths };
    } else if (pattern === 'autocomplete') {
      if (!autocompletePath.trim()) {
        setError('Select a field for autocomplete.');
        return;
      }
      body = { ...base, path: autocompletePath.trim() };
    } else {
      if (!facetedTextPath.trim()) {
        setError('Select the text field used in search queries.');
        return;
      }
      if (facetedStringPaths.length === 0 && !facetedNumberPath.trim()) {
        setError('Select at least one facet field (category or price).');
        return;
      }
      body = {
        ...base,
        textPath: facetedTextPath.trim(),
        stringFacetPaths: facetedStringPaths,
        ...(facetedNumberPath.trim()
          ? {
              numberFacets: [
                { path: facetedNumberPath.trim(), boundaries: DEFAULT_NUMBER_FACET_BOUNDARIES },
              ],
            }
          : {}),
      };
    }

    setBusy(true);
    try {
      const result = await createCopilotMongoAtlasSearchIndex(
        body as import('../../../../src/copilot/mongoAtlasSearchIndex.ts').MongoAtlasSearchIndexInput,
      );
      if (!result.ok) {
        setError(result.error ?? result.summary);
        return;
      }
      const input = body as import('../../../../src/copilot/mongoAtlasSearchIndex.ts').MongoAtlasSearchIndexInput;
      const recorded = copilotAtlasSearchIndexFromCreateResult(input, result);
      if (recorded) {
        copilot.recordAtlasSearchIndex(recorded);
      }
      onCreated?.(result.summary);
      onClose();
    } catch (submitError) {
      setError(String(submitError));
    } finally {
      setBusy(false);
    }
  };

  const panel = (
    <div
      className="pipeline-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="atlas-search-index-title"
    >
      <div className="pipeline-modal panel mongo-auto-embed-modal">
        <header className="pipeline-modal__header">
          <div>
            <h2 id="atlas-search-index-title">Create MongoDB Search index</h2>
            <p className="pipeline-modal__subtitle">
              Lexical <code>$search</code> on <code>{targetLabel}</code> (not vector search). Pick every field to
              index — nothing is assumed.
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close search index dialog">
            ✕
          </button>
        </header>

        <div className="pipeline-modal__body mongo-auto-embed-modal__body">
          <label className="mongo-auto-embed-modal__field">
            <span>Search pattern</span>
            <select
              value={pattern}
              onChange={(event) => setPattern(event.target.value as AtlasSearchPattern)}
            >
              <option value="keyword">Keyword — full-text search bar</option>
              <option value="autocomplete">Autocomplete — search-as-you-type</option>
              <option value="faceted">Faceted — categories and price ranges</option>
            </select>
          </label>

          <label className="mongo-auto-embed-modal__field">
            <span>Database</span>
            <select
              value={selectedDatabase}
              onChange={(event) => handleDatabaseChange(event.target.value)}
              disabled={loadingDatabases || databaseOptions.length === 0}
            >
              {loadingDatabases ? (
                <option value="">Loading databases…</option>
              ) : databaseOptions.length === 0 ? (
                <option value="">No databases found</option>
              ) : (
                databaseOptions.map((dbName) => (
                  <option key={dbName} value={dbName}>
                    {dbName}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="mongo-auto-embed-modal__field">
            <span>Collection</span>
            <select
              value={selectedCollection}
              onChange={(event) => handleCollectionChange(event.target.value)}
              disabled={!selectedDatabase.trim() || loadingCollections || collectionOptions.length === 0}
            >
              {!selectedDatabase.trim() ? (
                <option value="">Select a database first</option>
              ) : loadingCollections ? (
                <option value="">Loading collections…</option>
              ) : collectionOptions.length === 0 ? (
                <option value="">No collections in this database</option>
              ) : (
                collectionOptions.map((collectionName) => (
                  <option key={collectionName} value={collectionName}>
                    {collectionName}
                  </option>
                ))
              )}
            </select>
          </label>

          {pattern === 'keyword' ? (
            <fieldset className="mongo-auto-embed-modal__field">
              <legend>String fields to index</legend>
              {loadingFields ? (
                <p className="copilot-results__meta">Loading fields…</p>
              ) : stringFieldOptions.length === 0 ? (
                <p className="copilot-results__meta">No string fields inferred — describe schema or pick another collection.</p>
              ) : (
                <ul className="mongo-atlas-search-field-list">
                  {stringFieldOptions.map((option) => (
                    <li key={option.path}>
                      <label>
                        <input
                          type="checkbox"
                          checked={keywordPaths.includes(option.path)}
                          onChange={() => toggleKeywordPath(option.path)}
                        />{' '}
                        {formatSchemaFieldPickLabel(option)}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          ) : null}

          {pattern === 'autocomplete' ? (
            <label className="mongo-auto-embed-modal__field">
              <span>Autocomplete field</span>
              <select
                value={autocompletePath}
                onChange={(event) => setAutocompletePath(event.target.value)}
                disabled={!selectedCollection.trim() || loadingFields || stringFieldOptions.length === 0}
              >
                {!selectedCollection.trim() ? (
                  <option value="">Select a collection first</option>
                ) : loadingFields ? (
                  <option value="">Loading fields…</option>
                ) : stringFieldOptions.length === 0 ? (
                  <option value="">No string fields found</option>
                ) : (
                  <>
                    <option value="">Choose a field…</option>
                    {stringFieldOptions.map((option) => (
                      <option key={option.path} value={option.path}>
                        {formatSchemaFieldPickLabel(option)}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>
          ) : null}

          {pattern === 'faceted' ? (
            <>
              <label className="mongo-auto-embed-modal__field">
                <span>Search text field</span>
                <select
                  value={facetedTextPath}
                  onChange={(event) => setFacetedTextPath(event.target.value)}
                  disabled={loadingFields || stringFieldOptions.length === 0}
                >
                  <option value="">Choose a field…</option>
                  {stringFieldOptions.map((option) => (
                    <option key={option.path} value={option.path}>
                      {formatSchemaFieldPickLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="mongo-auto-embed-modal__field">
                <legend>String facet fields (e.g. category)</legend>
                {stringFieldOptions.length === 0 ? (
                  <p className="copilot-results__meta">No string fields for facets.</p>
                ) : (
                  <ul className="mongo-atlas-search-field-list">
                    {stringFieldOptions.map((option) => (
                      <li key={option.path}>
                        <label>
                          <input
                            type="checkbox"
                            checked={facetedStringPaths.includes(option.path)}
                            onChange={() => toggleFacetedStringPath(option.path)}
                          />{' '}
                          {formatSchemaFieldPickLabel(option)}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
              <label className="mongo-auto-embed-modal__field">
                <span>Number facet field (optional — boundaries 0, 25, 50, 100)</span>
                <select
                  value={facetedNumberPath}
                  onChange={(event) => setFacetedNumberPath(event.target.value)}
                  disabled={loadingFields || numberFieldOptions.length === 0}
                >
                  <option value="">None</option>
                  {numberFieldOptions.map((option) => (
                    <option key={option.path} value={option.path}>
                      {formatSchemaFieldPickLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          {catalogLoadError ? <p className="mongo-auto-embed-modal__error">{catalogLoadError}</p> : null}
          {fieldLoadError ? <p className="copilot-results__meta copilot-results__meta--warn">{fieldLoadError}</p> : null}

          <label className="mongo-auto-embed-modal__field">
            <span>Index name (optional)</span>
            <input
              type="text"
              value={indexName}
              onChange={(event) => setIndexName(event.target.value)}
              placeholder="Defaults to search_{pattern}_…"
              spellCheck={false}
            />
          </label>

          {error ? <p className="mongo-auto-embed-modal__error">{error}</p> : null}
        </div>

        <footer className="pipeline-modal__footer">
          <div className="pipeline-modal__footer-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void handleSubmit()}
              disabled={busy || catalogLoading || !canCreate}
            >
              {busy ? 'Creating…' : 'Create index'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

export function MongoAtlasSearchIndexModal({ open, ...rest }: MongoAtlasSearchIndexModalProps) {
  if (!open) return null;
  return <MongoAtlasSearchIndexModalPanel {...rest} />;
}

type MongoAtlasSearchIndexActionsProps = {
  database: string;
  collection: string;
  textFieldPaths?: string[];
  initialPath?: string;
  pattern?: AtlasSearchPattern;
  searchIndexEnabled: boolean;
};

/** Opens the shared studio MongoDB Search (lexical) index dialog. */
export function MongoAtlasSearchIndexActions({
  database,
  collection,
  textFieldPaths,
  initialPath,
  pattern = 'keyword',
  searchIndexEnabled,
}: MongoAtlasSearchIndexActionsProps) {
  const copilot = useCopilot();

  if (!searchIndexEnabled) {
    return null;
  }

  const databaseHint = normalizeVectorIndexDatabaseHint(database);
  const collectionHint = normalizeVectorIndexCollectionHint(collection);

  return (
    <div className="mongo-auto-embed-actions">
      <button
        type="button"
        className="secondary mongo-auto-embed-actions__btn"
        onClick={() =>
          copilot.openAtlasSearchIndexDialog({
            ...(databaseHint ? { database: databaseHint } : {}),
            collection: collectionHint,
            pattern,
            initialPath,
            textFieldPaths,
          })
        }
      >
        Create full-text search index…
      </button>
    </div>
  );
}
