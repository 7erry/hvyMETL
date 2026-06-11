/**
 * csvToAtlas integration — resolve the external [cvsToAtlas](https://github.com/7erry/cvsToAtlas)
 * installation or fall back to hvyMETL's bundled import CLI (`src/import/`).
 *
 * Set `CSV_TO_ATLAS_PATH` in `.env` to the clone root (directory containing
 * `package.json` and `dist/cli.js` or `src/cli.ts`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Public GitHub repository for the standalone csvToAtlas tool. */
export const CSV_TO_ATLAS_REPOSITORY = 'https://github.com/7erry/cvsToAtlas';

const HVYMETL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BUNDLED_CLI = join(HVYMETL_ROOT, 'dist/import/cli.js');

/** Where the import CLI will be invoked from. */
export type CsvToAtlasSource = {
  mode: 'bundled' | 'external';
  /** Absolute path to the tool root (hvyMETL root or external clone). */
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
  source: CsvToAtlasSource;
  errors: string[];
  warnings: string[];
};

/** Read `CSV_TO_ATLAS_PATH` from the environment (trimmed, empty → undefined). */
export function readCsvToAtlasPathFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.CSV_TO_ATLAS_PATH?.trim();
  return raw || undefined;
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

function resolveExternalCli(rootPath: string): { cliPath: string; warnings: string[] } {
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

/** Resolve which csvToAtlas installation hvyMETL should use. */
export function resolveCsvToAtlasInstallation(explicitPath?: string): CsvToAtlasSource {
  const envPath = explicitPath ?? readCsvToAtlasPathFromEnv();
  if (!envPath) {
    return {
      mode: 'bundled',
      rootPath: HVYMETL_ROOT,
      cliPath: BUNDLED_CLI,
      packageName: 'hvymetl',
      label: 'bundled (src/import/)',
    };
  }

  const rootPath = resolve(envPath);
  const { cliPath } = resolveExternalCli(rootPath);
  const packageName = readPackageName(rootPath);

  return {
    mode: 'external',
    rootPath,
    cliPath,
    packageName,
    label: packageName ? `${packageName} @ ${rootPath}` : rootPath,
  };
}

/** Validate that the resolved csvToAtlas installation can run imports. */
export function validateCsvToAtlasInstallation(explicitPath?: string): CsvToAtlasValidation {
  const source = resolveCsvToAtlasInstallation(explicitPath);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (source.mode === 'external') {
    if (!existsSync(source.rootPath)) {
      errors.push(`CSV_TO_ATLAS_PATH does not exist: ${source.rootPath}`);
    } else if (!existsSync(join(source.rootPath, 'package.json'))) {
      errors.push(`No package.json in CSV_TO_ATLAS_PATH: ${source.rootPath}`);
    } else {
      const pkgName = readPackageName(source.rootPath);
      if (pkgName && pkgName !== 'csv-to-atlas') {
        warnings.push(`Expected package name "csv-to-atlas", found "${pkgName}".`);
      }
      if (!existsSync(source.cliPath)) {
        errors.push(
          `csvToAtlas CLI not found at ${source.cliPath}. Clone ${CSV_TO_ATLAS_REPOSITORY} and run npm install && npm run build.`,
        );
      } else if (source.cliPath.endsWith('.ts')) {
        warnings.push('Using TypeScript CLI entry — ensure `tsx` is available or build dist/cli.js.');
      }
    }
  } else if (!existsSync(source.cliPath)) {
    errors.push(`Bundled import CLI not built: ${source.cliPath}. Run npm run build in hvyMETL.`);
  }

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

  if (source.mode === 'external' && source.cliPath.endsWith('.ts')) {
    const args = [source.cliPath, ...csvPaths, ...trailingArgs];
    const shellCommand = `npx tsx "${source.cliPath}" ${[...fileArgs, ...flagArgs].join(' ')}`;
    return { source, executable: 'npx', args: ['tsx', source.cliPath, ...csvPaths, ...trailingArgs], cwd, shellCommand };
  }

  const args = [source.cliPath, ...csvPaths, ...trailingArgs];
  const shellCommand = `node "${source.cliPath}" ${[...fileArgs, ...flagArgs].join(' ')}`;
  return { source, executable: 'node', args, cwd, shellCommand };
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
    mode: source.mode,
    repository: CSV_TO_ATLAS_REPOSITORY,
    rootPath: source.rootPath,
    cliPath: source.cliPath,
    label: source.label,
    envVar: 'CSV_TO_ATLAS_PATH',
  };
}
