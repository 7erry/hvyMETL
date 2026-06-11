/**
 * Validate hybrid RAG retrieval when MONGODB_MODEL_KEY is configured in .env.
 * Exits 0 on success, 1 on failure. Never prints the API key.
 */
import 'dotenv/config';
import { loadKnowledgeBase } from '../dist/rag/chunker.js';
import { createRetrievalConfigFromEnv, describeRetrievalStrategy, retrieve } from '../dist/rag/retrieval.js';
import { lexicalRetrieve } from '../dist/rag/retriever.js';
import { buildRetrievalQuery } from '../dist/rag/promptBundle.js';
import { readMongoDbModelKeyFromEnv, resolveModelApiBaseUrl } from '../dist/rag/voyage.js';
import { getProfile } from '../dist/profiles/profiles.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KNOWLEDGE_DIR = join(ROOT, 'knowledge');

async function main() {
  const modelKey = readMongoDbModelKeyFromEnv();
  if (!modelKey) {
    console.error('FAIL: MONGODB_MODEL_KEY is not set in .env');
    process.exit(1);
  }

  const config = createRetrievalConfigFromEnv();
  const strategy = describeRetrievalStrategy(config);

  if (!config.voyageProvider) {
    console.error('FAIL: voyage provider not initialized despite MONGODB_MODEL_KEY being set');
    process.exit(1);
  }

  if (!strategy.includes('hybrid BM25')) {
    console.error(`FAIL: expected hybrid strategy, got: ${strategy}`);
    process.exit(1);
  }

  console.log('MongoDB Model Key: configured');
  console.log(`API base: ${resolveModelApiBaseUrl(modelKey)}`);
  console.log(`Strategy: ${strategy}`);

  const chunks = loadKnowledgeBase(KNOWLEDGE_DIR);
  const query = buildRetrievalQuery(getProfile('iot'));
  const topK = 5;

  const [hybrid, lexical] = await Promise.all([
    retrieve(chunks, query, topK, config),
    Promise.resolve(lexicalRetrieve(chunks, query, topK)),
  ]);

  if (hybrid.length === 0) {
    console.error('FAIL: hybrid retrieval returned zero chunks');
    process.exit(1);
  }

  for (const chunk of hybrid) {
    if (chunk.score <= 0) {
      console.error(`FAIL: non-positive RRF score on ${chunk.sourceFile} / ${chunk.heading}`);
      process.exit(1);
    }
  }

  console.log(`\nHybrid top-${topK} (RRF scores):`);
  for (const chunk of hybrid) {
    console.log(`  ${chunk.score.toFixed(4)}  [${chunk.sourceFile}] ${chunk.heading}`);
  }

  console.log(`\nBM25-only top-${topK} (for comparison):`);
  for (const chunk of lexical) {
    console.log(`  ${chunk.score.toFixed(2)}  [${chunk.sourceFile}] ${chunk.heading}`);
  }

  const hybridHeadings = new Set(hybrid.map((c) => c.heading));
  const overlap = lexical.filter((c) => hybridHeadings.has(c.heading)).length;
  console.log(`\nOverlap with BM25 top-${topK}: ${overlap}/${topK} chunks`);

  console.log('\nPASS: hybrid BM25 + Voyage 4 (RRF) retrieval validated.');
}

main().catch((error) => {
  console.error('FAIL:', error instanceof Error ? error.message : error);
  process.exit(1);
});
