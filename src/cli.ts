#!/usr/bin/env node
/**
 * hvymetl: the RAG-driven SQL-to-MongoDB migration toolkit CLI.
 *
 * Subcommands:
 *   profiles   list the built-in workload profiles
 *   design     introspect a SQL source and emit a pattern-driven migration plan
 *   prompt     assemble the three RAG-grounded production prompts
 *   etl        run the parallel pattern-aware extraction to CSV chunks
 *   repogen    generate the concurrency-safe repository layer from a plan
 *
 * The csvToAtlas import CLI is a separate entry point (npm run import-cli)
 * so it matches the documented csvToAtlas contract exactly.
 */

import 'dotenv/config';
import { Command } from 'commander';
import { select } from '@inquirer/prompts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_PROFILES, buildCustomProfile, getProfile } from './profiles/profiles.js';
import type { WorkloadProfile } from './types.js';
import { runDesign } from './design/designCommand.js';
import { runEtl, MAX_PARALLEL_WORKERS } from './etl/runEtl.js';
import { runRepogen } from './repogen/generate.js';
import { createSqliteAdapter } from './adapters/sqlite.js';
import { loadKnowledgeBase } from './rag/chunker.js';
import { createEmbeddingProviderFromEnv } from './rag/embeddings.js';
import { retrieve } from './rag/retriever.js';
import { buildPromptBundle, buildRetrievalQuery } from './rag/promptBundle.js';

/** Repo root (this file compiles to dist/cli.js, so root is one level up). */
const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Default knowledge-base folder. */
const KNOWLEDGE_DIR = join(ROOT_DIR, 'knowledge');
/** Default output folder. */
const DEFAULT_OUT_DIR = join(ROOT_DIR, 'out');
/** How many chunks the prompt bundle includes. */
const PROMPT_CHUNK_COUNT = 8;

/** Flags shared by commands that need a workload profile. */
type ProfileFlags = {
  profile?: string;
  custom?: boolean;
  readWrite?: string;
  rpm?: string;
  growth?: string;
  critical?: boolean;
};

/**
 * Resolve the workload profile from flags, falling back to an interactive
 * menu when nothing was specified (the "selectable at runtime" requirement).
 */
async function resolveProfile(flags: ProfileFlags): Promise<WorkloadProfile> {
  if (flags.custom) {
    const [readPart, writePart] = (flags.readWrite ?? '80:20').split(':').map(Number);
    if (!Number.isFinite(readPart) || !Number.isFinite(writePart) || readPart + writePart !== 100) {
      throw new Error('--read-write must look like "80:20" and sum to 100.');
    }
    return buildCustomProfile(
      {
        readPercent: readPart,
        writePercent: writePart,
        peakRpm: Number(flags.rpm ?? 10000),
        growthRate: flags.growth ?? '10GB/month',
      },
      flags.critical ?? false,
    );
  }

  if (flags.profile) return getProfile(flags.profile);

  // Interactive selection when running in a terminal.
  const chosen = await select({
    message: 'Select the workload profile for this migration:',
    choices: ALL_PROFILES.map((profile) => ({
      name: `${profile.label} (${profile.telemetry.readPercent}:${profile.telemetry.writePercent} R:W, ${profile.telemetry.peakRpm.toLocaleString('en-US')} RPM)`,
      value: profile.id,
      description: profile.description,
    })),
  });
  return getProfile(chosen);
}

/** Attach the shared profile flags to a command. */
function withProfileFlags(command: Command): Command {
  return command
    .option('--profile <id>', 'workload profile id (catalog, cms, iot, mobile, personalization, realtime-analytics, single-view, ledger)')
    .option('--custom', 'supply custom telemetry instead of a preset')
    .option('--read-write <ratio>', 'custom read:write ratio, e.g. 80:20')
    .option('--rpm <number>', 'custom peak requests per minute')
    .option('--growth <rate>', 'custom data growth rate, e.g. 1TB/week')
    .option('--critical', 'custom workload cannot tolerate lost writes (w: majority)');
}

const program = new Command();
program
  .name('hvymetl')
  .description('RAG-driven SQL-to-MongoDB migration toolkit')
  .version('0.1.0');

program
  .command('profiles')
  .description('List the built-in workload profiles and their tuning')
  .action(() => {
    for (const profile of ALL_PROFILES) {
      console.log(`${profile.id.padEnd(20)} ${profile.label}`);
      console.log(`${''.padEnd(20)} ${profile.telemetry.readPercent}:${profile.telemetry.writePercent} R:W | ${profile.telemetry.peakRpm.toLocaleString('en-US')} RPM | growth ${profile.telemetry.growthRate}`);
      console.log(`${''.padEnd(20)} patterns: ${profile.preferredPatterns.join(', ')}`);
      console.log(`${''.padEnd(20)} writeConcern: w=${JSON.stringify(profile.writeConcern.w)} journal=${profile.writeConcern.journal} | pool: ${profile.pool.minPoolSize}-${profile.pool.maxPoolSize}`);
      console.log('');
    }
  });

withProfileFlags(
  program
    .command('design')
    .description('Introspect a SQL source and emit migration-plan.json + design-report.md')
    .requiredOption('--source <path>', 'path to the source SQLite database')
    .option('--out <dir>', 'output folder', DEFAULT_OUT_DIR),
).action(async (flags: ProfileFlags & { source: string; out: string }) => {
  const profile = await resolveProfile(flags);
  await runDesign({ sourcePath: flags.source, profile, outDir: flags.out, knowledgeDir: KNOWLEDGE_DIR });
});

withProfileFlags(
  program
    .command('prompt')
    .description('Assemble the three RAG-grounded production prompts for a source')
    .requiredOption('--source <path>', 'path to the source SQLite database')
    .option('--out <dir>', 'output folder', join(DEFAULT_OUT_DIR, 'prompts')),
).action(async (flags: ProfileFlags & { source: string; out: string }) => {
  const profile = await resolveProfile(flags);

  const adapter = createSqliteAdapter(flags.source);
  const ddl = adapter.dumpDdl();
  adapter.close();

  const chunks = loadKnowledgeBase(KNOWLEDGE_DIR);
  const provider = createEmbeddingProviderFromEnv();
  const retrieved = await retrieve(chunks, buildRetrievalQuery(profile), PROMPT_CHUNK_COUNT, provider);

  mkdirSync(flags.out, { recursive: true });
  for (const promptFile of buildPromptBundle({ profile, ddl, retrievedChunks: retrieved })) {
    const filePath = join(flags.out, promptFile.fileName);
    writeFileSync(filePath, promptFile.content);
    console.log(`Wrote ${filePath}`);
  }
  console.log(`Retrieval strategy: ${provider ? `vector (${provider.name})` : 'lexical BM25 (no API key configured)'}.`);
});

program
  .command('etl')
  .description('Run the parallel pattern-aware extraction to CSV chunks')
  .option('--plan <path>', 'path to migration-plan.json', join(DEFAULT_OUT_DIR, 'migration-plan.json'))
  .option('--out <dir>', 'output folder', DEFAULT_OUT_DIR)
  .option('--dry-run', 'safe ingestion gate: 3 chunks of 1,000 records per collection', false)
  .option('--workers <count>', `worker threads (max ${MAX_PARALLEL_WORKERS})`, String(MAX_PARALLEL_WORKERS))
  .action(async (flags: { plan: string; out: string; dryRun: boolean; workers: string }) => {
    await runEtl({ planPath: flags.plan, outDir: flags.out, dryRun: flags.dryRun, workers: Number(flags.workers) });
  });

program
  .command('repogen')
  .description('Generate the concurrency-safe repository layer from a migration plan')
  .option('--plan <path>', 'path to migration-plan.json', join(DEFAULT_OUT_DIR, 'migration-plan.json'))
  .option('--out <dir>', 'output folder', join(DEFAULT_OUT_DIR, 'repositories'))
  .action((flags: { plan: string; out: string }) => {
    runRepogen({ planPath: flags.plan, outDir: flags.out });
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(String(error));
  process.exit(1);
});
