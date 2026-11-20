/**
 * mongosh --file runs JavaScript only — shell helpers like `show collections` are not valid JS,
 * and expression results (cursors from find()) are not auto-printed like the interactive REPL.
 * Prefer EJSON.stringify so the UI can render Key / Value / Type trees.
 */

function ejsonPrint(expr: string): string {
  return `print(EJSON.stringify(${expr}, null, 2));`;
}

const DEFAULT_FIND_LIMIT = 50;
const MAX_FIND_LIMIT = 500;

function clampFindLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_FIND_LIMIT;
  return Math.max(1, Math.min(MAX_FIND_LIMIT, Math.floor(limit)));
}

/** Rewrite mongosh shell helpers / bare expressions into printable JS for --file mode. */
export function expandMongoshShellHelpers(script: string, findLimit?: number): string {
  const limit = clampFindLimit(findLimit);
  const lines = script.split(/\r?\n/);
  return lines
    .map((line, index) => expandShellHelperLine(line, limit, nextCodeLine(lines, index)))
    .join('\n');
}

function nextCodeLine(lines: readonly string[], index: number): string | undefined {
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const trimmed = lines[cursor]?.trim() ?? '';
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }
    return trimmed;
  }
  return undefined;
}

/** A following `.filter` or `)` belongs to this line. Wrapping it would strand that token. */
function expressionContinues(next: string | undefined): boolean {
  if (!next) return false;
  return /^[.\])},?:]/.test(next) || /^(?:&&|\|\||\?\?)/.test(next);
}

function bracketBalance(text: string): number {
  let balance = 0;
  let quote: "'" | '"' | '`' | null = null;
  let escape = false;
  for (const ch of text) {
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') balance += 1;
    else if (ch === ')' || ch === ']' || ch === '}') balance -= 1;
  }
  return balance;
}

function expandShellHelperLine(line: string, findLimit: number, next: string | undefined): string {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
    return line;
  }

  const indent = line.match(/^\s*/)?.[0] ?? '';

  const useMatch = /^use\s+(\S+)\s*;?\s*$/i.exec(trimmed);
  if (useMatch) {
    const db = useMatch[1].replace(/'/g, "\\'");
    return `${indent}db = db.getSiblingDB('${db}');`;
  }

  if (/^show\s+(collections|tables)\s*;?\s*$/i.test(trimmed)) {
    return `${indent}(() => { const _cols = db.getCollectionNames(); ${ejsonPrint('{ database: db.getName(), collections: _cols }')} if (_cols.length === 0) print('(empty — set Database in the left pane, or: use <dbName> / show dbs)'); })();`;
  }

  if (/^show\s+(dbs|databases)\s*;?\s*$/i.test(trimmed)) {
    return `${indent}${ejsonPrint('db.adminCommand({ listDatabases: 1 }).databases')}`;
  }

  if (/^show\s+users\s*;?\s*$/i.test(trimmed)) {
    return `${indent}${ejsonPrint('db.getUsers()')}`;
  }

  if (/^show\s+roles\s*;?\s*$/i.test(trimmed)) {
    return `${indent}${ejsonPrint('db.getRoles({ showBuiltinRoles: true })')}`;
  }

  if (/^show\s+profile\s*;?\s*$/i.test(trimmed)) {
    return `${indent}${ejsonPrint('db.getProfilingStatus()')}`;
  }

  const printed = wrapDbExpressionForPrint(indent, trimmed, findLimit, next);
  if (printed) return printed;

  return line;
}

const DB_CALL =
  String.raw`db(?:\.\w+|\.getCollection\s*\(\s*['"][^'"]+['"]\s*\))+`;

/** Wrap bare db.* expressions so --file mode prints like the mongosh REPL. */
function wrapDbExpressionForPrint(
  indent: string,
  trimmed: string,
  findLimit: number,
  next: string | undefined,
): string | null {
  const expr = trimmed.replace(/;?\s*$/, '');
  if (!/^db[\.\[]/.test(expr)) return null;
  if (/^(const|let|var|function|class|if|for|while|return|await|import|export)\b/.test(expr)) {
    return null;
  }
  if (/^(db\s*=)/.test(expr)) return null;
  if (/^(print(json)?|console|EJSON)\s*[\.(]/.test(expr)) return null;
  if (expressionContinues(next) || bracketBalance(expr) !== 0) return null;

  const findMatch = new RegExp(`^(${DB_CALL})\\.find(\\([\\s\\S]*\\))((?:\\.\\w+\\([\\s\\S]*\\))*)$`).exec(
    expr,
  );
  if (findMatch) {
    const [, base, args, chain] = findMatch;
    if (/\.(forEach)\s*\(/.test(chain)) return `${indent}${expr};`;
    const call = `${base}.find${args}${chain}`;
    if (/\.(toArray)\s*\(/.test(chain)) {
      return `${indent}${ejsonPrint(call)}`;
    }
    if (/\.limit\s*\(/.test(chain)) {
      return `${indent}${ejsonPrint(`${call}.toArray()`)}`;
    }
    return `${indent}${ejsonPrint(`${call}.limit(${findLimit}).toArray()`)}`;
  }

  const aggregateMatch = new RegExp(
    `^(${DB_CALL})\\.aggregate(\\([\\s\\S]*\\))((?:\\.\\w+\\([\\s\\S]*\\))*)$`,
  ).exec(expr);
  if (aggregateMatch) {
    const [, base, args, chain] = aggregateMatch;
    const call = `${base}.aggregate${args}${chain}`;
    if (/\.(forEach)\s*\(/.test(chain)) return `${indent}${expr};`;
    if (/\.(toArray)\s*\(/.test(chain)) return `${indent}${ejsonPrint(call)}`;
    return `${indent}${ejsonPrint(`${call}.toArray()`)}`;
  }

  return `${indent}${ejsonPrint(expr)}`;
}
