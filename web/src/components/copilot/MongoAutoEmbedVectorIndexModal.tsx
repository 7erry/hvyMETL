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
  formatSchemaFieldPickLabel,
  listSchemaFieldPickOptions,
  type SchemaFieldPickOption,
} from '../../copilot/mongoVectorAutoEmbedFields';
import { readMongoInspectSchemaSummary } from '../../copilot/mongoInspectFormat';
import { useCopilot } from '../../copilot/CopilotContext';

export type MongoAutoEmbedVectorIndexModalProps = {
  open: boolean;
  database?: string;
  collection: string;
  initialPath?: string;
  textFieldPaths?: string[];
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

/** Mounted only while open — loads all collection fields once per dialog session. */
function MongoAutoEmbedVectorIndexModalPanel({
  database,
  collection,
  initialPath,
  textFieldPaths = EMPTY_TEXT_FIELD_PATHS,
  onClose,
  onCreated,
}: Omit<MongoAutoEmbedVectorIndexModalProps, 'open'>) {
  const databaseHint = database?.trim() ?? '';
  const textFieldPathsKey = textFieldPaths.join('\u0001');
  const sessionKey = `${databaseHint}\u0000${collection}\u0000${initialPath ?? ''}\u0000${textFieldPathsKey}`;
  const initializedSessionRef = useRef<string | null>(null);
  const schemaLoadRequestRef = useRef(0);

  const [logicalDatabase, setLogicalDatabase] = useState(databaseHint);
  const [databaseChoices, setDatabaseChoices] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState(databaseHint);
  const [fieldOptions, setFieldOptions] = useState<SchemaFieldPickOption[]>(() =>
    seedFieldOptions(textFieldPaths, initialPath),
  );
  const [path, setPath] = useState(() =>
    pickInitialFieldPath(seedFieldOptions(textFieldPaths, initialPath), initialPath),
  );
  const [loadingFields, setLoadingFields] = useState(true);
  const [fieldLoadError, setFieldLoadError] = useState('');
  const [model, setModel] = useState<AutoEmbedVoyageModel>(DEFAULT_MODEL);
  const [quantization, setQuantization] = useState<AutoEmbedQuantizationType>(DEFAULT_QUANTIZATION);
  const [numDimensions, setNumDimensions] = useState<AutoEmbedDimension>(DEFAULT_DIMENSIONS);
  const [similarity, setSimilarity] = useState<AutoEmbedSimilarityFunction>(DEFAULT_SIMILARITY);
  const [indexName, setIndexName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadCollectionSchema = useCallback(
    async (explicitDatabase: string) => {
      const requestId = ++schemaLoadRequestRef.current;
      setLoadingFields(true);
      setFieldLoadError('');

      const inspectArgs: Record<string, unknown> = { collection };
      const trimmedDatabase = explicitDatabase.trim();
      if (trimmedDatabase) {
        inspectArgs.database = trimmedDatabase;
      }

      try {
        const response = await invokeCopilotMongoInspect('describeMongoCollectionSchema', inspectArgs);
        if (requestId !== schemaLoadRequestRef.current) return;

        if (!response.ok) {
          const choices = parseMultiDatabaseCollectionError(response.summary);
          if (choices && !trimmedDatabase) {
            setDatabaseChoices(choices);
            setSelectedDatabase(choices[0] ?? '');
            setLogicalDatabase(choices[0] ?? '');
            await loadCollectionSchema(choices[0] ?? '');
            return;
          }
          setFieldLoadError(response.summary);
          setFieldOptions([]);
          return;
        }

        const summary = readMongoInspectSchemaSummary(response.data);
        setLogicalDatabase(summary.database);
        setSelectedDatabase(summary.database);
        const options = listSchemaFieldPickOptions(summary.fields);
        setFieldOptions(options);
        setPath(pickInitialFieldPath(options, initialPath));
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
    [collection, initialPath],
  );

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
    setFieldLoadError('');
    setDatabaseChoices([]);
    setLogicalDatabase(databaseHint);
    setSelectedDatabase(databaseHint);
    const seeds = seedFieldOptions(textFieldPaths, initialPath);
    setFieldOptions(seeds);
    setPath(pickInitialFieldPath(seeds, initialPath));

    void loadCollectionSchema(databaseHint);
  }, [sessionKey, databaseHint, collection, initialPath, textFieldPathsKey, loadCollectionSchema]);

  const handleDatabaseChange = (nextDatabase: string) => {
    setSelectedDatabase(nextDatabase);
    setLogicalDatabase(nextDatabase);
    void loadCollectionSchema(nextDatabase);
  };

  const safePath = fieldOptions.some((entry) => entry.path === path)
    ? path
    : pickInitialFieldPath(fieldOptions, initialPath);
  const selectedField = fieldOptions.find((entry) => entry.path === safePath);
  const targetLabel =
    logicalDatabase.trim().length > 0 ? `${logicalDatabase}.${collection}` : collection;

  const handleSubmit = async () => {
    setError('');
    const resolvedPath = safePath.trim();
    if (!resolvedPath) {
      setError('Select a field to index with autoEmbed.');
      return;
    }
    const resolvedDatabase = logicalDatabase.trim();
    if (!resolvedDatabase) {
      setError('Could not resolve the logical database for this collection.');
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
      collection,
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
          {databaseChoices.length > 1 ? (
            <label className="mongo-auto-embed-modal__field">
              <span>Database</span>
              <select
                value={selectedDatabase}
                onChange={(event) => handleDatabaseChange(event.target.value)}
                disabled={loadingFields}
              >
                {databaseChoices.map((dbName) => (
                  <option key={dbName} value={dbName}>
                    {dbName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="mongo-auto-embed-modal__field">
            <span>Field</span>
            {loadingFields ? (
              <select disabled value="">
                <option value="">Loading fields from {collection}…</option>
              </select>
            ) : fieldOptions.length > 0 ? (
              <select value={safePath} onChange={(event) => setPath(event.target.value)}>
                {fieldOptions.map((option) => (
                  <option key={option.path} value={option.path}>
                    {formatSchemaFieldPickLabel(option)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mongo-auto-embed-modal__error">
                No fields inferred on <code>{targetLabel}</code>.
                {fieldLoadError && databaseChoices.length <= 1
                  ? ` ${fieldLoadError}`
                  : databaseChoices.length <= 1
                    ? ' Run describe schema first or pick another collection.'
                    : ''}
              </p>
            )}
          </label>

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
              disabled={busy || loadingFields || fieldOptions.length === 0}
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

  return (
    <div className="mongo-auto-embed-actions">
      <button
        type="button"
        className="secondary mongo-auto-embed-actions__btn"
        onClick={() =>
          copilot.openVectorIndexDialog({
            database,
            collection,
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
