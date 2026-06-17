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
 * CSV imports use the external csvToAtlas tool via npm run import-cli
 * (requires CSV_TO_ATLAS_PATH in .env).
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
import { runExplain } from './design/explainCommand.js';
import { runEtl, MAX_PARALLEL_WORKERS } from './etl/runEtl.js';
import { runRepogen } from './repogen/generate.js';
import { createSqliteAdapter } from './adapters/sqlite.js';
import { loadKnowledgeBase } from './rag/chunker.js';
import { createRetrievalConfigFromEnv, describeRetrievalStrategy, retrieve } from './rag/retrieval.js';
import { buildPromptBundle, buildRetrievalQuery } from './rag/promptBundle.js';
import { maybePhoneHome } from './utilities/phoneHome.js';
import { readPackageVersion } from './utilities/version.js';

/** Published semver from package.json (also used for CLI --version). */
const APP_VERSION = readPackageVersion();

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
  .version(APP_VERSION);

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
    .option('--out <dir>', 'output folder', DEFAULT_OUT_DIR)
    .option('--explain', 'also write transformation-summary.md explaining pattern decisions', false)
    .option('--csv <dir>', 'CSV export directory for row count / cardinality enrichment'),
).action(async (flags: ProfileFlags & { source: string; out: string; explain: boolean; csv?: string }) => {
  const profile = await resolveProfile(flags);
  await runDesign({
    sourcePath: flags.source,
    profile,
    outDir: flags.out,
    knowledgeDir: KNOWLEDGE_DIR,
  });
  if (flags.explain) {
    runExplain({
      profile,
      sourcePath: flags.source,
      csvSourcePath: flags.csv,
      outDir: flags.out,
    });
    console.log(`Wrote ${join(flags.out, 'transformation-summary.md')}`);
  }
});

withProfileFlags(
  program
    .command('explain')
    .description('Explain why MongoDB patterns and embeds were or were not applied')
    .option('--source <path>', 'path to the source SQLite database')
    .option('--ddl-file <path>', 'path to a .sql / .ddl file')
    .option('--plan <path>', 'existing migration-plan.json (optional)')
    .option('--csv <dir>', 'CSV export directory for enrichment')
    .option('--dialect <id>', 'SQL dialect label when using --ddl-file', 'mysql')
    .option('--out <dir>', 'write transformation-summary.md to this folder'),
).action(async (flags: ProfileFlags & {
  source?: string;
  ddlFile?: string;
  plan?: string;
  csv?: string;
  dialect: string;
  out?: string;
}) => {
  const profile = await resolveProfile(flags);
  const summary = runExplain({
    profile,
    sourcePath: flags.source,
    ddlPath: flags.ddlFile,
    planPath: flags.plan,
    csvSourcePath: flags.csv,
    dialect: flags.dialect,
    outDir: flags.out,
  });
  console.log(summary.headline);
  for (const insight of summary.insights) {
    const prefix = insight.severity === 'warn' ? '⚠' : insight.severity === 'success' ? '✓' : '·';
    console.log(`${prefix} ${insight.title}`);
    console.log(`  ${insight.body}`);
  }
  if (flags.out) {
    console.log(`Wrote ${join(flags.out, 'transformation-summary.md')}`);
  }
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
  const retrievalConfig = createRetrievalConfigFromEnv();
  const retrieved = await retrieve(chunks, buildRetrievalQuery(profile), PROMPT_CHUNK_COUNT, retrievalConfig);

  mkdirSync(flags.out, { recursive: true });
  for (const promptFile of buildPromptBundle({ profile, ddl, retrievedChunks: retrieved })) {
    const filePath = join(flags.out, promptFile.fileName);
    writeFileSync(filePath, promptFile.content);
    console.log(`Wrote ${filePath}`);
  }
  console.log(`Retrieval strategy: ${describeRetrievalStrategy(retrievalConfig)}.`);
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
  .option(
    '--lang <id>',
    'client language: c, cpp, csharp, go, java, kotlin, node, php, python, ruby, rust, scala, swift',
    'node',
  )
  .action((flags: { plan: string; out: string; lang: string }) => {
    runRepogen({ planPath: flags.plan, outDir: flags.out, language: flags.lang });
  });

maybePhoneHome(APP_VERSION);

program.parseAsync(process.argv).catch((error) => {
  console.error(String(error));
  process.exit(1);
});
