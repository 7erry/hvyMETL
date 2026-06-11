# 03 — Knowledge Base & RAG Retrieval

Sources: [`knowledge/`](../knowledge/), [`src/rag/chunker.ts`](../src/rag/chunker.ts),
[`src/rag/retriever.ts`](../src/rag/retriever.ts),
[`src/rag/embeddings.ts`](../src/rag/embeddings.ts),
[`src/rag/promptBundle.ts`](../src/rag/promptBundle.ts)

## 1. High-Level Summary

The RAG layer grounds the toolkit's schema decisions in concrete source material
instead of generic LLM training data. Eleven curated markdown documents (one per
MongoDB design pattern, each with applicability thresholds and verified code blocks)
are chunked at heading boundaries and ranked against a workload-derived query — by
deterministic BM25 by default, or by embedding cosine similarity when an API key is
configured. The top chunks are cited in the design report and assembled into three
"hardened production prompts" for LLM/Cursor use. The pattern content itself is
grounded in MongoDB's
[Building with Patterns series](https://www.mongodb.com/company/blog/building-with-patterns-a-summary).

## 2. Technical Details & Signature

### `chunkMarkdown(sourceFile: string, markdown: string): KnowledgeChunk[]`

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `sourceFile` | `string` | required | — | File name used for chunk attribution, e.g. `"bucket.md"` |
| `markdown` | `string` | required | — | Full markdown text of one knowledge document |

**Returns:** `KnowledgeChunk[]` where each chunk is one `##` section, carrying a
heading path like `"Bucket Pattern > Applicability rules"`.

### `loadKnowledgeBase(knowledgeDir: string): KnowledgeChunk[]`

Reads every `*.md` in the folder and flat-maps it through `chunkMarkdown`.

### `lexicalRetrieve(chunks, query, topK): ScoredChunk[]`

Classic BM25 (`k1 = 1.2`, `b = 0.75`): a chunk scores higher when it contains *rare*
query terms *many times*, with diminishing returns, normalized by chunk length.
Fully deterministic and dependency-free, so the toolkit always works offline.

### `vectorRetrieve(provider, chunks, query, topK): Promise<ScoredChunk[]>`

Embeds the entire knowledge base in one batch call plus the query, ranks by
`cosineSimilarity`. The knowledge base is small (dozens of chunks), so in-memory
cosine ranking avoids requiring an Atlas Vector Search index for retrieval.

### `retrieve(chunks, query, topK, provider): Promise<ScoredChunk[]>`

The strategy selector: vector when a provider exists, BM25 otherwise — and BM25 as a
runtime *fallback* if the embedding API call throws.

### `createEmbeddingProviderFromEnv(): EmbeddingProvider | null`

| Environment variable | Required | Default | Description |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | optional | — | Absent → returns `null` (lexical mode) |
| `OPENAI_BASE_URL` | optional | `https://api.openai.com/v1` | Any OpenAI-compatible `/embeddings` endpoint |
| `EMBEDDING_MODEL` | optional | `text-embedding-3-small` | Embedding model name |

**Returns:** an `EmbeddingProvider` (`{ name, embed(texts) => Promise<number[][]> }`)
or `null`.

### `buildPromptBundle(input: PromptBundleInput): PromptFile[]`

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `input.profile` | `WorkloadProfile` | required | Telemetry rendered into every prompt |
| `input.ddl` | `string` | required | Legacy SQL DDL dumped from the real source |
| `input.retrievedChunks` | `ScoredChunk[]` | required | Cited RAG context, highest score first |

**Returns:** three `{ fileName, content }` markdown prompts:
`1-schema-design-architect.md`, `2-parallel-etl-generator.md`,
`3-repository-layer.md`.

### `buildRetrievalQuery(profile: WorkloadProfile): string`

Combines the profile label, read/write direction, telemetry numbers, and preferred
pattern names into one query string so both lexical and vector retrieval surface the
right documents.

## 3. Edge Cases & Error Handling

- **No API key:** the entire vector path is skipped — `retrieve` silently uses BM25.
  The CLI reports which strategy ran (`Retrieval strategy: lexical BM25 ...`).
- **Embedding API failure:** `retrieve` catches, logs
  `Vector retrieval failed (...); falling back to lexical scoring.`, and degrades
  gracefully instead of failing the design run.
- **Out-of-order embedding responses:** the provider re-sorts response items by
  `index` before returning, guarding against APIs that batch asynchronously.
- **Zero-score chunks** are filtered out of BM25 results — a query with no overlap
  returns fewer than `topK` chunks rather than noise.
- **Token edge:** `tokenize` keeps `$` so MongoDB operator names like `$inc` and
  `$lookup` are searchable terms.

## 4. Code Breakdown

1. **Chunking at `##` boundaries** (`chunker.ts`) keeps each chunk on a single idea —
   "when to use", "anti-pattern guard", "index specs" — which is the right retrieval
   granularity for grounding one schema decision.
2. **Document frequency first** (`retriever.ts`): BM25 needs to know how many chunks
   contain each term (rarity = weight), so the retriever builds a `Map` of document
   frequencies before scoring any chunk.
3. **Length normalization** prevents long chunks from winning just by containing more
   words: the `1 - b + b * (len / avgLen)` denominator term scales term frequency by
   how unusually long the chunk is.
4. **The provider is an interface, not a client** (`embeddings.ts`): anything with an
   `/embeddings`-shaped endpoint plugs in via `OPENAI_BASE_URL`, and tests can inject
   a stub `EmbeddingProvider` without network access.
5. **Prompts are artifacts, not API calls** (`promptBundle.ts`): emitting markdown
   files keeps the toolkit useful without any LLM key — paste them into Cursor with
   `@`-references or pipe them to an API in a wrapper script.

## 5. Usage Example

```typescript
import { loadKnowledgeBase } from './rag/chunker.js';
import { retrieve } from './rag/retriever.js';
import { createEmbeddingProviderFromEnv } from './rag/embeddings.js';
import { buildRetrievalQuery } from './rag/promptBundle.js';
import { getProfile } from './profiles/profiles.js';

const chunks = loadKnowledgeBase('knowledge');
const profile = getProfile('iot');
const top = await retrieve(chunks, buildRetrievalQuery(profile), 3, createEmbeddingProviderFromEnv());

for (const chunk of top) console.log(chunk.score.toFixed(2), '-', chunk.heading);
// Example output (lexical mode):
// 4.91 - Bucket Pattern > Applicability rules
// 4.55 - Pre-allocation Pattern > Applicability rules
// 4.12 - Bucket Pattern > Benefits under high RPM
```

Or from the shell:

```bash
npm run hvymetl -- prompt --source examples/iot.db --profile iot
# Wrote out/prompts/1-schema-design-architect.md
# Wrote out/prompts/2-parallel-etl-generator.md
# Wrote out/prompts/3-repository-layer.md
```

## 6. Refactoring / Optimization Suggestions

- BM25 statistics are recomputed on every `lexicalRetrieve` call; pre-indexing once
  per process would matter if the knowledge base grew to hundreds of documents.
- For very large knowledge bases, persist embeddings to Atlas and query with
  `$vectorSearch` instead of in-memory cosine ranking — the `EmbeddingProvider`
  interface already isolates that change.
- The knowledge base lacks *Approximation* and *Document Versioning* docs from the
  MongoDB series; adding them would widen prompt grounding even before the design
  engine automates them.
