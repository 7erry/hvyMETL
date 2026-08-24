import type { ReactNode } from 'react';

/** MongoDB docs: Voyage models for Automated Embedding. */
export const AUTO_EMBED_MODELS_DOC_URL =
  'https://www.mongodb.com/docs/vector-search/crud-embeddings/automated-embedding/#available-models';

/** MongoDB docs: autoEmbed index field options (quantization, dimensions, similarity, name). */
export const AUTO_EMBED_INDEX_FIELDS_DOC_URL =
  'https://www.mongodb.com/docs/vector-search/index/vector-search-type/?deployment-type=atlas&interface=atlas-ui&embedding=auto#mongodb-vector-search-index-fields';

type MongoVectorIndexDocLinkProps = {
  href: string;
  children: ReactNode;
};

/** Label link to official MongoDB Vector Search documentation (opens in a new tab). */
export function MongoVectorIndexDocLink({ href, children }: MongoVectorIndexDocLinkProps) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="mongo-auto-embed-modal__doc-link">
      {children}
    </a>
  );
}
