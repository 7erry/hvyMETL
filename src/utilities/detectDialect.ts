/**
 * Lightweight dialect / format detection for pasted schema import text.
 */

import { getDialectLabel, isSupportedDialect, normalizeDialectId } from '../dialects.js';

/** Maximum characters scanned for performance. */
export const DIALECT_DETECT_SCAN_LIMIT = 5000;

/** Minimum score required before returning a specific dialect (not fallback). */
export const DIALECT_DETECT_MIN_SCORE = 3;

/** Minimum confidence ratio (0–1) to auto-select a dialect in the UI. */
export const DIALECT_DETECT_MIN_CONFIDENCE = 0.45;

export const DIALECT_DETECT_FALLBACK_ID = 'postgresql';

export type DetectedInputFormat = 'sql' | 'json' | 'yaml' | 'xml' | 'unknown';

export type DialectDetectionResult = {
  dialectId: string;
  label: string;
  confidence: number;
  score: number;
  format: DetectedInputFormat;
  autoDetected: boolean;
};

type SignatureRule = {
  id: string;
  patterns: Array<{ re: RegExp; weight: number }>;
};

const SQL_SIGNATURES: SignatureRule[] = [
  {
    id: 'postgresql',
    patterns: [
      { re: /\bBIGSERIAL\b/i, weight: 4 },
      { re: /\bSERIAL\b/i, weight: 3 },
      { re: /\bJSONB\b/i, weight: 4 },
      { re: /\bCREATE\s+EXTENSION\b/i, weight: 5 },
      { re: /::\s*[a-z_]+/i, weight: 2 },
      { re: /\bTIMESTAMPTZ\b/i, weight: 2 },
    ],
  },
  {
    id: 'mysql',
    patterns: [
      { re: /\bAUTO_INCREMENT\b/i, weight: 5 },
      { re: /\bENGINE\s*=\s*InnoDB/i, weight: 4 },
      { re: /`[^`]+`/m, weight: 2 },
      { re: /\bTINYINT\b/i, weight: 3 },
      { re: /\bUNSIGNED\b/i, weight: 2 },
    ],
  },
  {
    id: 'mariadb',
    patterns: [
      { re: /\bAUTO_INCREMENT\b/i, weight: 3 },
      { re: /\bENGINE\s*=\s*Aria\b/i, weight: 5 },
      { re: /\bSEQUENCE\b/i, weight: 2 },
    ],
  },
  {
    id: 'snowflake',
    patterns: [
      { re: /\bNUMBER\s*\(\s*38\s*,\s*0\s*\)/i, weight: 6 },
      { re: /\bVARIANT\b/i, weight: 4 },
      { re: /\bCLUSTER\s+BY\b/i, weight: 5 },
      { re: /\bTRANSIENT\s+TABLE\b/i, weight: 5 },
    ],
  },
  {
    id: 'bigquery',
    patterns: [
      { re: /\bSTRUCT\s*</i, weight: 5 },
      { re: /\bARRAY\s*</i, weight: 4 },
      { re: /`[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+`/i, weight: 6 },
      { re: /\bBYTES\b/i, weight: 3 },
      { re: /\bINT64\b/i, weight: 2 },
    ],
  },
  {
    id: 'sqlite',
    patterns: [
      { re: /\bAUTOINCREMENT\b/i, weight: 6 },
      { re: /\bWITHOUT\s+ROWID\b/i, weight: 5 },
      { re: /\bSTRICT\b/i, weight: 3 },
      { re: /\bINTEGER\s+PRIMARY\s+KEY\b/i, weight: 2 },
    ],
  },
  {
    id: 'mssql',
    patterns: [
      { re: /\bIDENTITY\s*\(\s*1\s*,\s*1\s*\)/i, weight: 6 },
      { re: /\bNVARCHAR\b/i, weight: 4 },
      { re: /\[[^\]]+\]\.\[[^\]]+\]/m, weight: 4 },
      { re: /^\s*GO\s*$/im, weight: 3 },
    ],
  },
  {
    id: 'oracle',
    patterns: [
      { re: /\bVARCHAR2\b/i, weight: 4 },
      { re: /\bNUMBER\s*\(\s*\d+/i, weight: 3 },
      { re: /\bTABLESPACE\b/i, weight: 4 },
      { re: /\bCLOB\b/i, weight: 2 },
    ],
  },
  {
    id: 'clickhouse',
    patterns: [
      { re: /\bMergeTree\s*\(/i, weight: 5 },
      { re: /\bUInt64\b/i, weight: 4 },
      { re: /\bENGINE\s*=\s*MergeTree/i, weight: 5 },
    ],
  },
  {
    id: 'spanner',
    patterns: [
      { re: /\bINTERLEAVE\s+IN\s+PARENT\b/i, weight: 6 },
      { re: /\bSTRING\s*\(\s*MAX\s*\)/i, weight: 4 },
      { re: /\bINT64\b/i, weight: 2 },
    ],
  },
  {
    id: 'db2',
    patterns: [
      { re: /\bORGANIZE\s+BY\s+ROW\b/i, weight: 4 },
      { re: /\bGENERATED\s+ALWAYS\s+AS\s+IDENTITY\b/i, weight: 4 },
    ],
  },
  {
    id: 'cockroachdb',
    patterns: [
      { re: /\bUUID\s+DEFAULT\s+gen_random_uuid\s*\(\s*\)/i, weight: 5 },
      { re: /\bINT8\b/i, weight: 2 },
    ],
  },
  {
    id: 'redshift',
    patterns: [
      { re: /\bDISTKEY\b/i, weight: 4 },
      { re: /\bSORTKEY\b/i, weight: 4 },
      { re: /\bENCODE\s+[a-z]+\b/i, weight: 3 },
    ],
  },
  {
    id: 'databricks',
    patterns: [
      { re: /\bUSING\s+delta\b/i, weight: 4 },
      { re: /\bPARTITIONED\s+BY\b/i, weight: 2 },
      { re: /\bDELTA\s+TABLE\b/i, weight: 4 },
    ],
  },
  {
    id: 'teradata',
    patterns: [
      { re: /\bPRIMARY\s+INDEX\b/i, weight: 4 },
      { re: /\bMULTISET\b/i, weight: 3 },
    ],
  },
  {
    id: 'sap-hana',
    patterns: [
      { re: /\bCOLUMN\s+TABLE\b/i, weight: 5 },
      { re: /\bNVARCHAR\s*\(\s*\d+\s*\)\s+CS_/i, weight: 4 },
    ],
  },
];

function detectStructuredFormat(trimmed: string): DetectedInputFormat {
  if (!trimmed) return 'unknown';
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) return 'xml';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (/^---\s*$/m.test(trimmed) || /^\s*[\w.-]+:\s/m.test(trimmed)) return 'yaml';
  return 'sql';
}

function scoreJsonDialect(trimmed: string): { id: string; score: number } | null {
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const text = trimmed;
    let score = 2;
    if (/"(\$schema|properties|definitions)"\s*:/.test(text)) score += 6;
    if (/"schemas"\s*:/.test(text)) score += 3;
    if (/"type"\s*:\s*"object"/.test(text)) score += 2;
    return { id: 'json-schema', score };
  } catch {
    return null;
  }
}

function scoreYamlDialect(sample: string): { id: string; score: number } | null {
  if (/AWSTemplateFormatVersion/i.test(sample) && /AWS::DynamoDB::Table/i.test(sample)) {
    return { id: 'dynamodb', score: 10 };
  }
  if (/Resources:/m.test(sample) && /Type:\s*['"]?AWS::/i.test(sample)) {
    return { id: 'dynamodb', score: 6 };
  }
  return null;
}

function scoreSqlDialects(sample: string): Map<string, number> {
  const scores = new Map<string, number>();
  for (const rule of SQL_SIGNATURES) {
    let total = 0;
    for (const { re, weight } of rule.patterns) {
      if (re.test(sample)) total += weight;
    }
    if (total > 0) scores.set(rule.id, total);
  }
  return scores;
}

function confidenceFromScores(top: number, second: number): number {
  if (top <= 0) return 0;
  if (second <= 0) return 1;
  return top / (top + second);
}

function buildResult(
  dialectId: string,
  score: number,
  confidence: number,
  format: DetectedInputFormat,
  autoDetected: boolean,
): DialectDetectionResult {
  const normalized = normalizeDialectId(dialectId);
  const id = isSupportedDialect(normalized) ? normalized : DIALECT_DETECT_FALLBACK_ID;
  return {
    dialectId: id,
    label: getDialectLabel(id),
    confidence,
    score,
    format,
    autoDetected,
  };
}

/**
 * Analyzes pasted DDL or structured schema text and infers the best-matching dialect.
 */
export function detectDialect(rawInput: string): DialectDetectionResult {
  const sample = rawInput.slice(0, DIALECT_DETECT_SCAN_LIMIT);
  const trimmed = sample.trim();
  const format = detectStructuredFormat(trimmed);

  if (!trimmed) {
    return buildResult(DIALECT_DETECT_FALLBACK_ID, 0, 0, 'unknown', false);
  }

  if (format === 'json') {
    const jsonHit = scoreJsonDialect(trimmed);
    if (jsonHit && jsonHit.score >= DIALECT_DETECT_MIN_SCORE) {
      return buildResult(jsonHit.id, jsonHit.score, 0.9, 'json', true);
    }
  }

  if (format === 'yaml' || format === 'xml') {
    const yamlHit = scoreYamlDialect(sample);
    if (yamlHit && yamlHit.score >= DIALECT_DETECT_MIN_SCORE) {
      return buildResult(yamlHit.id, yamlHit.score, 0.85, format === 'xml' ? 'xml' : 'yaml', true);
    }
  }

  const scores = scoreSqlDialects(sample);
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const second = ranked[1];

  if (!top || top[1] < DIALECT_DETECT_MIN_SCORE) {
    return buildResult(DIALECT_DETECT_FALLBACK_ID, top?.[1] ?? 0, confidenceFromScores(top?.[1] ?? 0, second?.[1] ?? 0), 'sql', false);
  }

  const confidence = confidenceFromScores(top[1], second?.[1] ?? 0);
  const autoDetected = confidence >= DIALECT_DETECT_MIN_CONFIDENCE;
  return buildResult(top[0], top[1], confidence, 'sql', autoDetected);
}
