import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AUTO_EMBED_DIMENSIONS,
  AUTO_EMBED_QUANTIZATION_TYPES,
  AUTO_EMBED_SIMILARITY_FUNCTIONS,
  AUTO_EMBED_VOYAGE_MODELS,
  type AutoEmbedDimension,
  type AutoEmbedQuantizationType,
  type AutoEmbedSimilarityFunction,
  type AutoEmbedVoyageModel,
  type MongoAutoEmbedVectorIndexInput,
} from '../../../../src/copilot/mongoVectorAutoEmbedIndex.ts';
import { parseMultiDatabaseCollectionError } from '../../../../src/copilot/parseMultiDatabaseCollectionError.ts';
import { createCopilotMongoAutoEmbedVectorIndex, invokeCopilotMongoInspect } from '../../api';
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
import { copilotVectorSearchIndexFromCreateResult } from '../../../../src/copilot/copilotVectorSearchContext.ts';
import type { MigrationPlan } from '../../migrationPlanTypes';

export type MongoAutoEmbedVectorIndexModalProps = {
  open: boolean;
  database?: string;
  collection: string;
  initialPath?: string;
  textFieldPaths?: string[];
  migrationPlan?: MigrationPlan | null;
  onClose: () => void;
  onCreated?: (summary: string) => void;
};

const DEFAULT_MODEL: AutoEmbedVoyageModel = 'voyage-4-lite';
const DEFAULT_QUANTIZATION: AutoEmbedQuantizationType = 'scalar';
const DEFAULT_DIMENSIONS: AutoEmbedDimension = 1024;
const DEFAULT_SIMILARITY: AutoEmbedSimilarityFunction = 'cosine';
const EMPTY_TEXT_FIELD_PATHS: string[] = [];

function seedFieldOptions(textFieldPaths: string[], initialPath?: string): SchemaFieldPickOption[] {
  const options = textFieldPaths.map((path) => ({
    path,
    types: 'string',
    isStringType: true,
  }));
  const preferred = initialPath?.trim();
  if (preferred && !options.some((entry) => entry.path === preferred)) {
    options.push({ path: preferred, types: 'unknown', isStringType: true });
  }
  return options.sort((left, right) => left.path.localeCompare(right.path));
}

function pickInitialFieldPath(options: SchemaFieldPickOption[], initialPath?: string): string {
  const preferred = initialPath?.trim();
  if (preferred && options.some((entry) => entry.path === preferred)) {
    return preferred;
  }
  const firstString = options.find((entry) => entry.isStringType);
  if (firstString) return firstString.path;
  return options[0]?.path ?? preferred ?? '';
}

/** Mounted only while open — database, collection, then field pickers. */
function MongoAutoEmbedVectorIndexModalPanel({
  database,
  collection,
  initialPath,
  textFieldPaths = EMPTY_TEXT_FIELD_PATHS,
  migrationPlan = null,
  onClose,
  onCreated,
}: Omit<MongoAutoEmbedVectorIndexModalProps, 'open'>) {
  const copilot = useCopilot();
  const databaseHint = normalizeVectorIndexDatabaseHint(database);
  const collectionHint = normalizeVectorIndexCollectionHint(collection);
  const pipelineDatabase = normalizeVectorIndexDatabaseHint(copilot.targetDatabase);
  const textFieldPathsKey = textFieldPaths.join('\u0001');
  const sessionKey = `${databaseHint}\u0000${collectionHint}\u0000${initialPath ?? ''}\u0000${textFieldPathsKey}`;
  const initializedSessionRef = useRef<string | null>(null);
  const catalogRequestRef = useRef(0);
  const schemaLoadRequestRef = useRef(0);
  const loadCollectionsRef = useRef<(db: string, preferredCollection?: string) => Promise<void>>(async () => {});

  const [logicalDatabase, setLogicalDatabase] = useState(databaseHint);
  const [databaseOptions, setDatabaseOptions] = useState<string[]>([]);
  const [collectionOptions, setCollectionOptions] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState(databaseHint);
  const [selectedCollection, setSelectedCollection] = useState(collectionHint);
  const [fieldOptions, setFieldOptions] = useState<SchemaFieldPickOption[]>(() =>
    seedFieldOptions(textFieldPaths, initialPath),
  );
  const [path, setPath] = useState(() =>
    pickInitialFieldPath(seedFieldOptions(textFieldPaths, initialPath), initialPath),
  );
  const [loadingDatabases, setLoadingDatabases] = useState(true);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [catalogLoadError, setCatalogLoadError] = useState('');
  const [fieldLoadError, setFieldLoadError] = useState('');
  const [model, setModel] = useState<AutoEmbedVoyageModel>(DEFAULT_MODEL);
  const [quantization, setQuantization] = useState<AutoEmbedQuantizationType>(DEFAULT_QUANTIZATION);
  const [numDimensions, setNumDimensions] = useState<AutoEmbedDimension>(DEFAULT_DIMENSIONS);
  const [similarity, setSimilarity] = useState<AutoEmbedSimilarityFunction>(DEFAULT_SIMILARITY);
  const [indexName, setIndexName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadFieldsForTarget = useCallback(
    async (explicitDatabase: string, explicitCollection: string) => {
      const requestId = ++schemaLoadRequestRef.current;
      const db = explicitDatabase.trim();
      const coll = explicitCollection.trim();

      if (!db || !coll) {
        setFieldOptions([]);
        setPath('');
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
          setPath('');
          return;
        }

        const summary = readMongoInspectSchemaSummary(response.data);
        setLogicalDatabase(summary.database);
        setSelectedDatabase(summary.database);
        const enrichedFields = enrichSchemaFieldRowsFromPlan(summary.fields, migrationPlan, coll);
        const options = listSchemaFieldPickOptions(enrichedFields);
        setFieldOptions(options);
        setPath(pickInitialFieldPath(options, initialPath));
      } catch (loadError) {
        if (requestId === schemaLoadRequestRef.current) {
          setFieldLoadError(String(loadError));
          setFieldOptions([]);
          setPath('');
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
        setPath('');
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
        setPath('');
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

    setModel(DEFAULT_MODEL);
    setQuantization(DEFAULT_QUANTIZATION);
    setNumDimensions(DEFAULT_DIMENSIONS);
    setSimilarity(DEFAULT_SIMILARITY);
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
    const seeds = seedFieldOptions(textFieldPaths, initialPath);
    setFieldOptions(seeds);
    setPath(pickInitialFieldPath(seeds, initialPath));

    void bootstrapCatalog();
  }, [sessionKey, databaseHint, collectionHint, initialPath, textFieldPathsKey, bootstrapCatalog]);

  useEffect(() => {
    if (!selectedDatabase.trim() || collectionOptions.length === 0) return;
    if (selectedCollection && collectionOptions.includes(selectedCollection)) return;
    const nextCollection = pickInitialCatalogName(collectionOptions, [collectionHint]);
    setSelectedCollection(nextCollection);
    void loadFieldsForTarget(selectedDatabase, nextCollection);
  }, [
    collectionHint,
    collectionOptions,
    loadFieldsForTarget,
    selectedCollection,
    selectedDatabase,
  ]);

  const handleDatabaseChange = (nextDatabase: string) => {
    setSelectedDatabase(nextDatabase);
    setLogicalDatabase(nextDatabase);
    void loadCollectionsForDatabase(nextDatabase, '');
  };

  const handleCollectionChange = (nextCollection: string) => {
    setSelectedCollection(nextCollection);
    void loadFieldsForTarget(selectedDatabase, nextCollection);
  };

  const safePath = fieldOptions.some((entry) => entry.path === path)
    ? path
    : pickInitialFieldPath(fieldOptions, initialPath);
  const selectedField = fieldOptions.find((entry) => entry.path === safePath);
  const targetLabel =
    logicalDatabase.trim() && selectedCollection.trim()
      ? `${logicalDatabase}.${selectedCollection}`
      : selectedCollection.trim() || logicalDatabase.trim() || 'your collection';

  const catalogLoading = loadingDatabases || loadingCollections;
  const canCreate =
    Boolean(selectedDatabase.trim() && selectedCollection.trim() && safePath.trim()) &&
    fieldOptions.length > 0;

  const handleSubmit = async () => {
    setError('');
    const resolvedPath = safePath.trim();
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
    if (!resolvedPath) {
      setError('Select a field to index with autoEmbed.');
      return;
    }
    if (selectedField && !selectedField.isStringType) {
      setError(
        `Field "${resolvedPath}" is typed as ${selectedField.types}. autoEmbed requires a string text field.`,
      );
      return;
    }

    const payload: MongoAutoEmbedVectorIndexInput = {
      database: resolvedDatabase,
      collection: resolvedCollection,
      path: resolvedPath,
      model,
      quantization,
      numDimensions,
      similarity,
      ...(indexName.trim() ? { name: indexName.trim() } : {}),
    };

    setBusy(true);
    try {
      const result = await createCopilotMongoAutoEmbedVectorIndex(payload);
      if (!result.ok) {
        setError(result.error ?? result.summary);
        return;
      }
      const recorded = copilotVectorSearchIndexFromCreateResult(payload, result);
      if (recorded) {
        copilot.recordVectorSearchIndex(recorded);
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
      aria-labelledby="auto-embed-vector-index-title"
    >
      <div className="pipeline-modal panel mongo-auto-embed-modal">
        <header className="pipeline-modal__header">
          <div>
            <h2 id="auto-embed-vector-index-title">Create autoEmbed vector index</h2>
            <p className="pipeline-modal__subtitle">
              Automated Embeddings (Preview) on <code>{targetLabel}</code>. Index build may take time and uses Voyage
              AI billing on Atlas.
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close vector index dialog">
            ✕
          </button>
        </header>

        <div className="pipeline-modal__body mongo-auto-embed-modal__body">
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

          <label className="mongo-auto-embed-modal__field">
            <span>Field</span>
            <select
              value={safePath}
              onChange={(event) => setPath(event.target.value)}
              disabled={
                !selectedCollection.trim() || loadingFields || (fieldOptions.length === 0 && !loadingFields)
              }
            >
              {!selectedCollection.trim() ? (
                <option value="">Select a collection first</option>
              ) : loadingFields ? (
                <option value="">Loading fields…</option>
              ) : fieldOptions.length === 0 ? (
                <option value="">No fields inferred — pick another collection</option>
              ) : (
                fieldOptions.map((option) => (
                  <option key={option.path} value={option.path}>
                    {formatSchemaFieldPickLabel(option)}
                  </option>
                ))
              )}
            </select>
          </label>

          {catalogLoadError ? <p className="mongo-auto-embed-modal__error">{catalogLoadError}</p> : null}
          {fieldLoadError ? <p className="copilot-results__meta copilot-results__meta--warn">{fieldLoadError}</p> : null}

          {selectedField && !selectedField.isStringType && !loadingFields ? (
            <p className="copilot-results__meta copilot-results__meta--warn">
              autoEmbed indexes string text fields. This field is typed as {selectedField.types}.
            </p>
          ) : null}

          <label className="mongo-auto-embed-modal__field">
            <span>Embedding model</span>
            <select value={model} onChange={(event) => setModel(event.target.value as AutoEmbedVoyageModel)}>
              {AUTO_EMBED_VOYAGE_MODELS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="mongo-auto-embed-modal__field">
            <span>Quantization</span>
            <select
              value={quantization}
              onChange={(event) => setQuantization(event.target.value as AutoEmbedQuantizationType)}
            >
              {AUTO_EMBED_QUANTIZATION_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="mongo-auto-embed-modal__field">
            <span>Dimensions</span>
            <select
              value={numDimensions}
              onChange={(event) => setNumDimensions(Number(event.target.value) as AutoEmbedDimension)}
            >
              {AUTO_EMBED_DIMENSIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="mongo-auto-embed-modal__field">
            <span>Similarity</span>
            <select
              value={similarity}
              onChange={(event) => setSimilarity(event.target.value as AutoEmbedSimilarityFunction)}
            >
              {AUTO_EMBED_SIMILARITY_FUNCTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="mongo-auto-embed-modal__field">
            <span>Index name (optional)</span>
            <input
              type="text"
              value={indexName}
              onChange={(event) => setIndexName(event.target.value)}
              placeholder="Defaults to autoEmbed_{field}_{model}"
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
              disabled={busy || catalogLoading || loadingFields || !canCreate}
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

/** Dialog to create an Atlas Vector Search autoEmbed index on a collection. */
export function MongoAutoEmbedVectorIndexModal({ open, ...rest }: MongoAutoEmbedVectorIndexModalProps) {
  if (!open) return null;
  return <MongoAutoEmbedVectorIndexModalPanel {...rest} />;
}

type MongoAutoEmbedVectorIndexActionsProps = {
  database: string;
  collection: string;
  textFieldPaths?: string[];
  initialPath?: string;
  vectorIndexEnabled: boolean;
};

/** Opens the shared studio vector index dialog for one collection. */
export function MongoAutoEmbedVectorIndexActions({
  database,
  collection,
  textFieldPaths,
  initialPath,
  vectorIndexEnabled,
}: MongoAutoEmbedVectorIndexActionsProps) {
  const copilot = useCopilot();

  if (!vectorIndexEnabled) {
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
          copilot.openVectorIndexDialog({
            ...(databaseHint ? { database: databaseHint } : {}),
            collection: collectionHint,
            initialPath,
            textFieldPaths,
          })
        }
      >
        Create autoEmbed vector index…
      </button>
    </div>
  );
}

export {
  normalizeVectorIndexCollectionHint,
  normalizeVectorIndexDatabaseHint,
} from '../../copilot/mongoVectorAutoEmbedCatalog';
