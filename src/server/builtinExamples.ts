/**
 * Built-in example DDL shipped with hvyMETL (repo `examples/` or hosted copy under
 * ~/hvymetl/examples). Used by Migration Studio "Load example" schema import.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dialectExampleFor, dialectExamplePickerLabel } from '../examples/dialectPatternManifest.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Default workload profile for each seeded SQLite example domain. */
const SUGGESTED_PROFILE_BY_DOMAIN: Record<string, string> = {
  catalog: 'catalog',
  cms: 'cms',
  iot: 'iot',
  mobile: 'mobile',
  personalization: 'personalization',
  analytics: 'realtime-analytics',
  singleview: 'single-view',
  ledger: 'ledger',
};

/** DDL paste dialect for examples that are not SQLite schemas. */
const DOMAIN_DIALECTS: Record<string, string> = {
  ledger: 'postgresql',
};

/** Human-readable labels for seeded example folders. */
const DOMAIN_LABELS: Record<string, string> = {
  catalog: 'E-commerce Catalog',
  cms: 'Content Management (CMS)',
  iot: 'IoT Telemetry',
  mobile: 'Mobile Backend',
  personalization: 'Personalization Engine',
  analytics: 'Real-Time Analytics',
  singleview: 'Single View (Customer 360)',
  ledger: 'Financial Ledger (Enterprise)',
};

/** One selectable built-in DDL example on the API server disk. */
export type BuiltinExampleSummary = {
  /** Stable id passed to import (domain folder or oracle DDL relative path). */
  id: string;
  /** Short title shown in the UI picker. */
  label: string;
  /** First-line DDL comment or generated summary. */
  description: string;
  /** Dialect to use when parsing the script. */
  dialect: string;
  /** Recommended workload profile when this example is loaded. */
  suggestedProfileId?: string;
};

/** Resolved examples root plus whether it came from env, home, or repo fallback. */
export type BuiltinExamplesLocation = {
  path: string;
  source: 'env' | 'home' | 'repo';
};

/**
 * Resolve the directory that holds bundled example DDL on this server.
 * Priority: HVYMETL_EXAMPLES_DIR → ~/hvymetl/examples → repo examples/.
 */
export function resolveBuiltinExamplesDir(options?: {
  repoRoot?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
}): BuiltinExamplesLocation {
  const repoRoot = options?.repoRoot ?? REPO_ROOT;
  const home = options?.homeDir ?? homedir();
  const env = options?.env ?? process.env;

  const configured = env.HVYMETL_EXAMPLES_DIR?.trim();
  if (configured) {
    return { path: resolve(configured), source: 'env' };
  }

  const hosted = resolve(home, 'hvymetl', 'examples');
  if (existsSync(hosted)) {
    return { path: hosted, source: 'home' };
  }

  return { path: join(repoRoot, 'examples'), source: 'repo' };
}

/** Read the Description field from a CloudFormation template header. */
function readCloudFormationDescription(filePath: string): string | undefined {
  try {
    const head = readFileSync(filePath, 'utf8').slice(0, 1200);
    const descriptionMatch = head.match(/^Description:\s*(?:'([^']+)'|"([^"]+)"|(.+))$/m);
    return descriptionMatch?.[1] ?? descriptionMatch?.[2] ?? descriptionMatch?.[3]?.trim();
  } catch {
    return undefined;
  }
}

/** Read the first `--` comment line from a DDL file for list descriptions. */
function readFirstCommentLine(filePath: string): string | undefined {
  try {
    const head = readFileSync(filePath, 'utf8').slice(0, 800);
    for (const line of head.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('--')) {
        return trimmed.replace(/^--\s*/, '').trim();
      }
      if (trimmed && !trimmed.startsWith('/*')) break;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Turn `oracle-hr.ddl` into "Oracle HR". */
function labelFromOracleFile(fileName: string): string {
  const base = fileName.replace(/\.ddl$/i, '').replace(/^oracle-?/i, '');
  return `Oracle ${base.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`;
}

/** Extract suggested profile id from a dialect example header comment. */
function inferDialectExampleProfile(description: string): string | undefined {
  const match = description.match(/—\s*(\S+)\s+pattern/i);
  if (!match) return undefined;
  const pattern = match[1]!.toLowerCase();
  const byPattern: Record<string, string> = {
    embed: 'catalog',
    reference: 'mobile',
    bucket: 'iot',
    outlier: 'catalog',
    'extended-reference': 'catalog',
    computed: 'ledger',
    subset: 'catalog',
    attribute: 'catalog',
    polymorphic: 'cms',
    tree: 'catalog',
    archive: 'catalog',
    'single-collection': 'mobile',
    'schema-versioning': 'catalog',
  };
  return byPattern[pattern];
}

/** List every built-in example DDL available under the resolved examples directory. */
export function listBuiltinExamples(examplesDir: string): BuiltinExampleSummary[] {
  if (!existsSync(examplesDir)) return [];

  const summaries: BuiltinExampleSummary[] = [];

  for (const entry of readdirSync(examplesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const domain = entry.name;

    if (domain === 'oracle') {
      const oracleDir = join(examplesDir, domain);
      for (const fileName of readdirSync(oracleDir).sort()) {
        if (!fileName.toLowerCase().endsWith('.ddl')) continue;
        const filePath = join(oracleDir, fileName);
        const id = `${domain}/${fileName}`;
        summaries.push({
          id,
          label: labelFromOracleFile(fileName),
          description: readFirstCommentLine(filePath) ?? 'Oracle DDL paste example.',
          dialect: 'oracle',
        });
      }
      continue;
    }

    if (domain === 'dynamodb') {
      const dynamoDir = join(examplesDir, domain);
      for (const fileName of readdirSync(dynamoDir).sort()) {
        if (!/\.(ya?ml|json|template)$/i.test(fileName)) continue;
        const filePath = join(dynamoDir, fileName);
        const baseName = fileName.replace(/\.(ya?ml|json|template)$/i, '');
        const id = `${domain}/${fileName}`;
        summaries.push({
          id,
          label: `DynamoDB ${baseName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`,
          description: readCloudFormationDescription(filePath) ?? 'DynamoDB CloudFormation template example.',
          dialect: 'dynamodb',
        });
      }
      continue;
    }

    if (domain === 'dialects') {
      const dialectDir = join(examplesDir, domain);
      for (const fileName of readdirSync(dialectDir).sort()) {
        if (!/\.(sql|ya?ml)$/i.test(fileName)) continue;
        const filePath = join(dialectDir, fileName);
        const dialectId = fileName.replace(/\.(sql|ya?ml)$/i, '');
        const id = `${domain}/${fileName}`;
        const manifestEntry = dialectExampleFor(dialectId);
        const description =
          dialectId === 'dynamodb'
            ? readCloudFormationDescription(filePath)
            : readFirstCommentLine(filePath);
        summaries.push({
          id,
          label: manifestEntry ? dialectExamplePickerLabel(manifestEntry) : dialectId,
          description: description ?? `Design-pattern example for ${dialectId}.`,
          dialect: dialectId === 'dynamodb' ? 'dynamodb' : dialectId,
          suggestedProfileId: manifestEntry?.suggestedProfileId ?? inferDialectExampleProfile(description ?? ''),
        });
      }
      continue;
    }

    const sqlPath = join(examplesDir, domain, `${domain}.sql`);
    if (!existsSync(sqlPath)) continue;

    summaries.push({
      id: domain,
      label: DOMAIN_LABELS[domain] ?? domain,
      description: readFirstCommentLine(sqlPath) ?? `Example schema for ${domain}.`,
      dialect: DOMAIN_DIALECTS[domain] ?? 'sqlite',
      suggestedProfileId: SUGGESTED_PROFILE_BY_DOMAIN[domain],
    });
  }

  return summaries.sort((a, b) => a.label.localeCompare(b.label));
}

/** Resolve example id to an absolute DDL file path; rejects path traversal. */
export function resolveBuiltinExamplePath(examplesDir: string, exampleId: string): string {
  const normalizedId = String(exampleId ?? '').trim();
  if (!normalizedId || normalizedId.includes('..') || normalizedId.startsWith('/')) {
    throw new Error('Invalid example id.');
  }

  const allowed = new Map(listBuiltinExamples(examplesDir).map((example) => [example.id, example]));
  const summary = allowed.get(normalizedId);
  if (!summary) {
    throw new Error(`Unknown built-in example "${normalizedId}".`);
  }

  const absoluteExamplesDir = resolve(examplesDir);
  let candidate: string;
  if (normalizedId.includes('/')) {
    candidate = resolve(absoluteExamplesDir, normalizedId);
  } else {
    candidate = join(absoluteExamplesDir, normalizedId, `${normalizedId}.sql`);
  }

  const rel = relative(absoluteExamplesDir, candidate);
  if (rel.startsWith('..') || resolve(candidate) !== candidate) {
    throw new Error('Example path escapes the examples directory.');
  }
  if (!existsSync(candidate)) {
    throw new Error(`Example DDL file not found for "${normalizedId}".`);
  }

  return candidate;
}

/** Load DDL text and metadata for one built-in example. */
export function readBuiltinExample(
  examplesDir: string,
  exampleId: string,
): { ddl: string; dialect: string; summary: BuiltinExampleSummary } {
  const summaries = listBuiltinExamples(examplesDir);
  const summary = summaries.find((example) => example.id === exampleId);
  if (!summary) {
    throw new Error(`Unknown built-in example "${exampleId}".`);
  }

  const filePath = resolveBuiltinExamplePath(examplesDir, exampleId);
  const ddl = readFileSync(filePath, 'utf8');
  if (!ddl.trim()) {
    throw new Error(`Example "${exampleId}" is empty.`);
  }

  return { ddl, dialect: summary.dialect, summary };
}
