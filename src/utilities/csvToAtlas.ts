/**
 * csvToAtlas integration — hvyMETL delegates all CSV imports to the standalone
 * [cvsToAtlas](https://github.com/7erry/cvsToAtlas) CLI.
 *
 * Set `CSV_TO_ATLAS_PATH` in `.env` to the clone root (directory containing
 * `package.json` and `dist/cli.js` or `src/cli.ts`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Public GitHub repository for the csvToAtlas tool. */
export const CSV_TO_ATLAS_REPOSITORY = 'https://github.com/7erry/cvsToAtlas';

const HVYMETL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Resolved csvToAtlas installation used for imports and ETL manifests. */
export type CsvToAtlasSource = {
  /** Absolute path to the cvsToAtlas clone root. */
  rootPath: string;
  /** Absolute path to the Node entry script. */
  cliPath: string;
  /** npm package name from package.json when available. */
  packageName?: string;
  /** Human-readable origin for logs and manifests. */
  label: string;
};

export type CsvToAtlasValidation = {
  ok: boolean;
  source: CsvToAtlasSource | null;
  errors: string[];
  warnings: string[];
};

/** Read `CSV_TO_ATLAS_PATH` from the environment (trimmed, empty → undefined). */
export function readCsvToAtlasPathFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.CSV_TO_ATLAS_PATH?.trim();
  return raw ? sanitizeConfigPath(raw) : undefined;
}

/** Trim whitespace and optional surrounding quotes from a configured path. */
export function sanitizeConfigPath(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function readPackageName(rootPath: string): string | undefined {
  const packagePath = join(rootPath, 'package.json');
  if (!existsSync(packagePath)) return undefined;
  try {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: string };
    return pkg.name;
  } catch {
    return undefined;
  }
}

/**
 * Accept clone root or a direct path to dist/ (common misconfiguration).
 * Returns the directory that contains package.json and dist/cli.js.
 */
export function normalizeCsvToAtlasRoot(rawPath: string): { rootPath: string; warnings: string[] } {
  const warnings: string[] = [];
  const resolved = resolve(rawPath);

  const hasRootPackage = existsSync(join(resolved, 'package.json'));
  const hasRootDistCli = existsSync(join(resolved, 'dist/cli.js'));
  const hasRootSrcCli = existsSync(join(resolved, 'src/cli.ts'));

  if (hasRootPackage && (hasRootDistCli || hasRootSrcCli)) {
    return { rootPath: resolved, warnings };
  }

  const cliInResolved = existsSync(join(resolved, 'cli.js'));
  const parentPackage = existsSync(join(resolved, '..', 'package.json'));
  if (cliInResolved && parentPackage) {
    warnings.push(
      'CSV_TO_ATLAS_PATH points at dist/ — resolved to the clone root (directory containing package.json).',
    );
    return { rootPath: resolve(resolved, '..'), warnings };
  }

  return { rootPath: resolved, warnings };
}

function resolveCliEntry(rootPath: string): { cliPath: string; warnings: string[] } {
  const warnings: string[] = [];
  const distCli = join(rootPath, 'dist/cli.js');
  if (existsSync(distCli)) {
    return { cliPath: distCli, warnings };
  }

  const srcCli = join(rootPath, 'src/cli.ts');
  if (existsSync(srcCli)) {
    warnings.push('dist/cli.js not found — run `npm run build` in the csvToAtlas clone before production imports.');
    return { cliPath: srcCli, warnings };
  }

  return { cliPath: distCli, warnings };
}

/** Resolve the cvsToAtlas installation from env or an explicit path override. */
export function resolveCsvToAtlasInstallation(
  explicitPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): CsvToAtlasSource {
  const envPath = explicitPath ? sanitizeConfigPath(explicitPath) : readCsvToAtlasPathFromEnv(env);
  if (!envPath) {
    throw new Error(
      `CSV_TO_ATLAS_PATH is not set. Clone ${CSV_TO_ATLAS_REPOSITORY}, run npm install && npm run build, then add CSV_TO_ATLAS_PATH to .env.`,
    );
  }

  const { rootPath } = normalizeCsvToAtlasRoot(envPath);
  const { cliPath } = resolveCliEntry(rootPath);
  const packageName = readPackageName(rootPath);

  return {
    rootPath,
    cliPath,
    packageName,
    label: packageName ? `${packageName} @ ${rootPath}` : rootPath,
  };
}

/** Validate that csvToAtlas is configured and runnable. */
export function validateCsvToAtlasInstallation(
  explicitPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): CsvToAtlasValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let source: CsvToAtlasSource | null = null;

  const envPath = explicitPath ? sanitizeConfigPath(explicitPath) : readCsvToAtlasPathFromEnv(env);
  if (!envPath) {
    errors.push(
      `CSV_TO_ATLAS_PATH is not set in .env. Clone ${CSV_TO_ATLAS_REPOSITORY} and point CSV_TO_ATLAS_PATH at the directory.`,
    );
    return { ok: false, source: null, errors, warnings };
  }

  try {
    source = resolveCsvToAtlasInstallation(envPath, env);
  } catch (error) {
    errors.push(String(error));
    return { ok: false, source: null, errors, warnings };
  }

  const { warnings: rootWarnings } = normalizeCsvToAtlasRoot(envPath);
  warnings.push(...rootWarnings);

  const { cliPath, warnings: cliWarnings } = resolveCliEntry(source.rootPath);
  warnings.push(...cliWarnings);

  if (!existsSync(source.rootPath)) {
    errors.push(`CSV_TO_ATLAS_PATH does not exist: ${source.rootPath}`);
  } else if (!existsSync(join(source.rootPath, 'package.json'))) {
    errors.push(`No package.json in CSV_TO_ATLAS_PATH: ${source.rootPath}`);
  } else {
    const pkgName = readPackageName(source.rootPath);
    if (pkgName && pkgName !== 'csv-to-atlas') {
      warnings.push(`Expected package name "csv-to-atlas", found "${pkgName}".`);
    }
    if (!existsSync(cliPath)) {
      errors.push(
        `csvToAtlas CLI not found at ${cliPath}. Clone ${CSV_TO_ATLAS_REPOSITORY} and run npm install && npm run build.`,
      );
    } else if (cliPath.endsWith('.ts')) {
      warnings.push('Using TypeScript CLI entry — ensure `tsx` is available or build dist/cli.js.');
    }
  }

  source = { ...source, cliPath };
  return { ok: errors.length === 0, source, errors, warnings };
}

/** argv passed to `node` (or `tsx`) for one import invocation. */
export type ImportCliInvocation = {
  source: CsvToAtlasSource;
  executable: string;
  args: string[];
  cwd: string;
  /** Copy-paste shell command for etl-manifest.json. */
  shellCommand: string;
};

/**
 * Build a process invocation for csvToAtlas given CSV paths and trailing flags.
 * File paths should be absolute or relative to `cwd` (defaults to hvyMETL root).
 */
export function buildImportCliInvocation(
  csvPaths: string[],
  trailingArgs: string[],
  options?: { cwd?: string; explicitPath?: string },
): ImportCliInvocation {
  const source = resolveCsvToAtlasInstallation(options?.explicitPath);
  const cwd = options?.cwd ?? HVYMETL_ROOT;
  const fileArgs = csvPaths.map((p) => (p.includes(' ') ? `"${p}"` : p));
  const flagArgs = trailingArgs.map((a) => (a.includes(' ') ? `"${a}"` : a));

  if (source.cliPath.endsWith('.ts')) {
    const shellCommand = `npx tsx "${source.cliPath}" ${[...fileArgs, ...flagArgs].join(' ')}`;
    return {
      source,
      executable: 'npx',
      args: ['tsx', source.cliPath, ...csvPaths, ...trailingArgs],
      cwd,
      shellCommand,
    };
  }

  const shellCommand = `node "${source.cliPath}" ${[...fileArgs, ...flagArgs].join(' ')}`;
  return {
    source,
    executable: 'node',
    args: [source.cliPath, ...csvPaths, ...trailingArgs],
    cwd,
    shellCommand,
  };
}

/** Convenience wrapper: collection name plus optional import flags. */
export function buildCollectionImportCommand(
  csvPaths: string[],
  collectionName: string,
  flags: string[] = [],
  options?: { cwd?: string; explicitPath?: string },
): string {
  return buildImportCliInvocation(csvPaths, [collectionName, ...flags], options).shellCommand;
}

/** Metadata block written into etl-manifest.json. */
export function csvToAtlasManifestMeta(source: CsvToAtlasSource): Record<string, string> {
  return {
    repository: CSV_TO_ATLAS_REPOSITORY,
    rootPath: source.rootPath,
    cliPath: source.cliPath,
    label: source.label,
    envVar: 'CSV_TO_ATLAS_PATH',
  };
}
