/**
 * The csvToAtlas command-line interface.
 *
 * Implements the documented contract:
 *
 *   npm run import-cli -- <file.csv...> [collection] [flags]
 *
 * Flags:
 *   --analyze            analysis-only run (no MONGODB_URI required)
 *   --join <field>       join field linking related CSVs
 *   --parent <file.csv>  parent file for embed mode
 *   --embed <file:field> embed a child CSV as an array field (repeatable)
 *   --drop               drop the existing collection first (explicit only)
 *   --db <name>          override the target database name
 *   --write-concern <w>  "1" (default) or "majority"
 *   --journal            wait for the on-disk journal on writes
 *
 * Environment: MONGODB_URI (required for imports), MONGODB_DB (optional,
 * defaults to "csv_to_atlas").
 */

import 'dotenv/config';
import { basename } from 'node:path';
import type { WriteConcernSetting } from '../types.js';
import { analyzeCsvFiles, readCsvFile } from './analyze.js';
import { runImport, type EmbedSpec } from './importer.js';

/** Parsed command-line arguments for one invocation. */
type CliArguments = {
  csvPaths: string[];
  collectionName: string | null;
  analyzeOnly: boolean;
  joinField: string | null;
  parentFile: string | null;
  embeds: EmbedSpec[];
  drop: boolean;
  dbName: string | null;
  writeConcern: WriteConcernSetting;
};

/** Parse process.argv into structured arguments. */
function parseArguments(argv: string[]): CliArguments {
  const parsed: CliArguments = {
    csvPaths: [],
    collectionName: null,
    analyzeOnly: false,
    joinField: null,
    parentFile: null,
    embeds: [],
    drop: false,
    dbName: null,
    writeConcern: { w: 1, journal: false },
  };

  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];
    switch (argument) {
      case '--analyze':
        parsed.analyzeOnly = true;
        break;
      case '--join':
        parsed.joinField = argv[++i] ?? null;
        break;
      case '--parent':
        parsed.parentFile = basename(argv[++i] ?? '');
        break;
      case '--embed': {
        const spec = argv[++i] ?? '';
        const separatorIndex = spec.lastIndexOf(':');
        if (separatorIndex <= 0) {
          console.error(`Invalid --embed value "${spec}". Expected "child.csv:fieldName".`);
          process.exit(1);
        }
        parsed.embeds.push({ file: basename(spec.slice(0, separatorIndex)), field: spec.slice(separatorIndex + 1) });
        break;
      }
      case '--drop':
        parsed.drop = true;
        break;
      case '--db':
        parsed.dbName = argv[++i] ?? null;
        break;
      case '--write-concern': {
        const value = argv[++i] ?? '1';
        parsed.writeConcern.w = value === 'majority' ? 'majority' : Number(value);
        break;
      }
      case '--journal':
        parsed.writeConcern.journal = true;
        break;
      default:
        if (argument.endsWith('.csv')) parsed.csvPaths.push(argument);
        else if (!argument.startsWith('--') && parsed.collectionName === null) parsed.collectionName = argument;
        else {
          console.error(`Unknown argument: ${argument}`);
          process.exit(1);
        }
    }
  }
  return parsed;
}

/** Entry point. */
async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));

  if (args.csvPaths.length === 0) {
    console.error('Usage: import-cli <file.csv...> [collection] [--analyze] [--join field] [--parent file] [--embed file:field] [--drop]');
    process.exit(1);
  }

  const files = args.csvPaths.map(readCsvFile);
  const analysis = analyzeCsvFiles(files);

  if (args.analyzeOnly) {
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI is not set. Add it to .env (see .env.example) or run with --analyze.');
    process.exit(1);
  }

  const result = await runImport({
    files,
    collectionName: args.collectionName ?? analysis.suggestedCollectionName,
    joinField: args.joinField ?? analysis.suggestedJoinField,
    parentFile: args.parentFile,
    embeds: args.embeds,
    drop: args.drop,
    mongoUri,
    dbName: args.dbName ?? process.env.MONGODB_DB ?? 'csv_to_atlas',
    writeConcern: args.writeConcern,
    arePartitions: analysis.arePartitions,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
