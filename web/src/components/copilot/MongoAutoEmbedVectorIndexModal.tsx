import { useEffect, useMemo, useState } from 'react';
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
import { createCopilotMongoAutoEmbedVectorIndex } from '../../api';

export type MongoAutoEmbedVectorIndexModalProps = {
  open: boolean;
  database: string;
  collection: string;
  /** String-typed field paths suggested from inferred schema. */
  textFieldPaths?: string[];
  onClose: () => void;
  onCreated?: (summary: string) => void;
};

const DEFAULT_MODEL: AutoEmbedVoyageModel = 'voyage-4-lite';
const DEFAULT_QUANTIZATION: AutoEmbedQuantizationType = 'scalar';
const DEFAULT_DIMENSIONS: AutoEmbedDimension = 1024;
const DEFAULT_SIMILARITY: AutoEmbedSimilarityFunction = 'cosine';

/** Dialog to create an Atlas Vector Search autoEmbed index on a collection. */
export function MongoAutoEmbedVectorIndexModal({
  open,
  database,
  collection,
  textFieldPaths = [],
  onClose,
  onCreated,
}: MongoAutoEmbedVectorIndexModalProps) {
  const pathOptions = useMemo(() => {
    const unique = new Set(textFieldPaths.map((path) => path.trim()).filter(Boolean));
    return [...unique];
  }, [textFieldPaths]);

  const [path, setPath] = useState('');
  const [customPath, setCustomPath] = useState('');
  const [model, setModel] = useState<AutoEmbedVoyageModel>(DEFAULT_MODEL);
  const [quantization, setQuantization] = useState<AutoEmbedQuantizationType>(DEFAULT_QUANTIZATION);
  const [numDimensions, setNumDimensions] = useState<AutoEmbedDimension>(DEFAULT_DIMENSIONS);
  const [similarity, setSimilarity] = useState<AutoEmbedSimilarityFunction>(DEFAULT_SIMILARITY);
  const [indexName, setIndexName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPath(pathOptions[0] ?? '');
    setCustomPath('');
    setModel(DEFAULT_MODEL);
    setQuantization(DEFAULT_QUANTIZATION);
    setNumDimensions(DEFAULT_DIMENSIONS);
    setSimilarity(DEFAULT_SIMILARITY);
    setIndexName('');
    setBusy(false);
    setError('');
  }, [open, pathOptions]);

  if (!open) return null;

  const resolvedPath = path === '__custom__' ? customPath.trim() : path.trim();

  const handleSubmit = async () => {
    setError('');
    if (!resolvedPath) {
      setError('Select or enter the text field to index with autoEmbed.');
      return;
    }

    const payload: MongoAutoEmbedVectorIndexInput = {
      database,
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

  return (
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
              Automated Embeddings (Preview) on{' '}
              <code>
                {database}.{collection}
              </code>
              . Index build may take time and uses Voyage AI billing on Atlas.
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close vector index dialog">
            ✕
          </button>
        </header>

        <div className="pipeline-modal__body mongo-auto-embed-modal__body">
          <label className="mongo-auto-embed-modal__field">
            <span>Text field</span>
            {pathOptions.length > 0 ? (
              <select value={path || pathOptions[0]} onChange={(event) => setPath(event.target.value)}>
                {pathOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                <option value="__custom__">Custom path…</option>
              </select>
            ) : (
              <input
                type="text"
                value={customPath}
                onChange={(event) => setCustomPath(event.target.value)}
                placeholder="e.g. description"
                spellCheck={false}
              />
            )}
          </label>

          {pathOptions.length > 0 && path === '__custom__' ? (
            <label className="mongo-auto-embed-modal__field">
              <span>Custom field path</span>
              <input
                type="text"
                value={customPath}
                onChange={(event) => setCustomPath(event.target.value)}
                placeholder="e.g. details.summary"
                spellCheck={false}
              />
            </label>
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
            <button type="button" className="primary" onClick={() => void handleSubmit()} disabled={busy}>
              {busy ? 'Creating…' : 'Create index'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

type MongoAutoEmbedVectorIndexActionsProps = {
  database: string;
  collection: string;
  textFieldPaths?: string[];
  vectorIndexEnabled: boolean;
};

/** Button that opens the autoEmbed vector index dialog for one collection. */
export function MongoAutoEmbedVectorIndexActions({
  database,
  collection,
  textFieldPaths,
  vectorIndexEnabled,
}: MongoAutoEmbedVectorIndexActionsProps) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');

  if (!vectorIndexEnabled) {
    return null;
  }

  return (
    <>
      <div className="mongo-auto-embed-actions">
        <button type="button" className="secondary mongo-auto-embed-actions__btn" onClick={() => setOpen(true)}>
          Create autoEmbed vector index…
        </button>
        {notice ? <p className="copilot-results__meta">{notice}</p> : null}
      </div>
      <MongoAutoEmbedVectorIndexModal
        open={open}
        database={database}
        collection={collection}
        textFieldPaths={textFieldPaths}
        onClose={() => setOpen(false)}
        onCreated={(summary) => setNotice(summary)}
      />
    </>
  );
}
