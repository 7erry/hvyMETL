/**
 * Atlas Search vs Vector Search guidance for architecture review §6.
 */

import { mongodbDocLink } from './architectureReviewDocLinks.js';

export const ARCHITECTURE_REVIEW_SEARCH_SECTION = `
**Search recommendations in §6 (required for every architecture review with a migration plan)**

Scan **each collection's string fields** from schema context (search field hints and §4 schema). Apply these rules:

| Field signal (examples) | Recommend |
| --- | --- |
| \`name\`, \`title\`, \`sku\`, \`product_name\`, \`label\` | ${mongodbDocLink('Atlas Search', 'atlasSearch')} — **autocomplete** index on that path (\`$search.autocomplete\`, optional fuzzy) |
| \`description\`, \`summary\`, \`body\`, \`content\`, \`plot\`, \`bio\` | ${mongodbDocLink('Atlas Vector Search', 'atlasVectorSearch')} — ${mongodbDocLink('autoEmbed', 'atlasAutoEmbed')} on that text path (\`$vectorSearch\`) |
| \`category\`, \`brand\`, \`status\`, \`tags\`, \`genre\` | ${mongodbDocLink('Atlas Search', 'atlasSearch')} — **faceted** / keyword fields for filters and counts |

Include a **Search strategy** subsection per affected collection (table: collection, field, recommended index pattern, sample query stage).

**When to use ${mongodbDocLink('Atlas Search', 'atlasSearch')} (lexical)**
- Exact keyword and fuzzy matching (e.g. catalog search for a specific product name).
- **Score boosting** — matches in title/name fields rank above description/body.
- Linguistic features: autocomplete, suggestions, spell-check, highlighting, **faceting**.
- Low-latency explicit term retrieval without external embedding API calls.
- Sample stage: ${mongodbDocLink('$search aggregation stage', 'searchStage')}.

**When to use ${mongodbDocLink('Atlas Vector Search', 'atlasVectorSearch')}**
- **RAG** and LLM grounding on enterprise text.
- **Semantic search** — intent and conceptual similarity (e.g. plot-style queries without exact keywords).
- Recommendations from behavioral or content similarity; multi-modal vector use cases when applicable.
- Anomaly / outlier detection on embedding space (when relevant to the domain).
- Sample stage: ${mongodbDocLink('$vectorSearch aggregation stage', 'vectorSearchStage')}; index type: ${mongodbDocLink('autoEmbed', 'atlasAutoEmbed')}.

**Hybrid search (production default when both field types exist)**
- Combine ${mongodbDocLink('Atlas Search', 'atlasSearch')} (\`$search\`) and ${mongodbDocLink('Atlas Vector Search', 'atlasVectorSearch')} (\`$vectorSearch\`) in one aggregation pipeline when a collection has both **name/title** and **description**-class fields.
- Example: keyword "Titanic" via lexical search; plot-style description via vector search; combine ranked results with ${mongodbDocLink('Reciprocal Rank Fusion (RRF)', 'rankFusion')} using \`$rankFusion\`, or follow the ${mongodbDocLink('vector + full-text hybrid tutorial', 'hybridSearchTutorial')}. Overview: ${mongodbDocLink('Hybrid search overview', 'hybridSearchOverview')}.
- Note studio commands: **create full text search index on {collection}** / autocomplete pattern, and **create vector search on {collection}.{field}** for autoEmbed.

When **Atlas vector search indexes (studio)** or **Atlas Search indexes (studio)** appear in system context, document existing indexes first, then fill gaps using the field rules above.
`.trim();
