#!/usr/bin/env node
/**
 * Vendor CC0 drawDB example schemas into examples/drawdb/ for offline gallery use.
 * Source: https://www.drawdb.app/examples/index.json (license: CC0-1.0)
 */
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(REPO_ROOT, 'examples', 'drawdb');
const PUBLIC_PREVIEWS = join(REPO_ROOT, 'web', 'public', 'example-previews', 'drawdb');
const INDEX_URL = 'https://www.drawdb.app/examples/index.json';
const CONCURRENCY = 8;

/** @param {string} url */
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} → ${response.status}`);
  }
  return response.json();
}

// shortcut: thumbnail keeps at most 4 linked tables and 7 columns so field text stays readable at card size; import still loads the full DDL.
const MAX_TABLES = 4;
const MAX_FIELDS = 7;
const TABLE_W = 158;
const HEADER_H = 18;
const ROW_H = 13;
const GAP_X = 18;
const GAP_Y = 14;
const PAD = 10;
const TITLE_SIZE = 12;
const FIELD_SIZE = 11;

/** @param {string} text */
function xmlEscape(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

/** @param {string} text @param {number} max */
function fitLabel(text, max) {
  const raw = String(text);
  const sliced = raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
  return xmlEscape(sliced);
}

/** @param {string} name */
function bareName(name) {
  const dot = name.lastIndexOf('.');
  return (dot >= 0 ? name.slice(dot + 1) : name).trim();
}

/**
 * @param {string} sql
 * @param {number} index
 */
function readIdent(sql, index) {
  let i = index;
  while (i < sql.length && /\s/.test(sql[i])) i += 1;
  if (i >= sql.length) return { name: '', end: i };
  let name = '';
  const quote = sql[i];
  if (quote === '"' || quote === '`' || quote === '[') {
    const endQuote = quote === '[' ? ']' : quote;
    i += 1;
    while (i < sql.length && sql[i] !== endQuote) name += sql[i++];
    if (sql[i] === endQuote) i += 1;
  } else if (/[A-Za-z_]/.test(sql[i])) {
    while (i < sql.length && /[\w$]/.test(sql[i])) name += sql[i++];
  } else {
    return { name: '', end: i };
  }
  let look = i;
  while (look < sql.length && /\s/.test(sql[look])) look += 1;
  if (sql[look] === '.') {
    const next = readIdent(sql, look + 1);
    if (next.name) return { name: bareName(next.name), end: next.end };
  }
  return { name: bareName(name), end: i };
}

/** @param {string} sql */
function stripSqlComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl < 0 ? sql.length : nl;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      out += ch;
      i += 1;
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === ch) {
          if (sql[i + 1] === ch) {
            out += sql[i + 1];
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** @param {string} sql @param {number} openIdx */
function matchingParen(sql, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === ch) {
          if (sql[i + 1] === ch) {
            i += 2;
            continue;
          }
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * @param {string} text
 * @param {string} from
 * @param {Array<{ from: string, to: string }>} edges
 */
function collectRefs(text, from, edges) {
  const re = /\bREFERENCES\s+/gi;
  let match = re.exec(text);
  while (match) {
    const ident = readIdent(text, match.index + match[0].length);
    if (ident.name && ident.name.toLowerCase() !== from.toLowerCase()) {
      edges.push({ from, to: ident.name });
    }
    match = re.exec(text);
  }
}

/** @param {string} body */
function columnNames(body) {
  /** @type {string[]} */
  const fields = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  const parts = [];
  for (let i = 0; i <= body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      if (ch === quote) {
        if (body[i + 1] === quote) {
          i += 1;
          continue;
        }
        quote = '';
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if ((ch === ',' && depth === 0) || i === body.length) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|KEY|CHECK|INDEX|FULLTEXT|SPATIAL|PERIOD)\b/i.test(trimmed)) {
      continue;
    }
    const ident = readIdent(trimmed, 0);
    if (ident.name) fields.push(ident.name);
  }
  return fields;
}

/**
 * Tables and foreign keys from a DDL script. Enough for a thumbnail, not a parser.
 * @param {string} sql
 * @returns {{ tables: Array<{ name: string, fields: string[] }>, edges: Array<{ from: string, to: string }> }}
 */
export function parseSqlSchema(sql) {
  const clean = stripSqlComments(sql);
  /** @type {Array<{ name: string, fields: string[] }>} */
  const tables = [];
  /** @type {Array<{ from: string, to: string }>} */
  const edges = [];
  const createRe =
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP|TEMPORARY|UNLOGGED\s+)?(?:MULTISET\s+|SET\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/gi;
  let match = createRe.exec(clean);
  while (match) {
    const ident = readIdent(clean, match.index + match[0].length);
    const paren = clean.indexOf('(', ident.end);
    if (!ident.name || paren < 0 || paren - ident.end > 80) {
      match = createRe.exec(clean);
      continue;
    }
    const close = matchingParen(clean, paren);
    if (close < 0) break;
    const body = clean.slice(paren + 1, close);
    const fields = columnNames(body);
    if (fields.length > 0) tables.push({ name: ident.name, fields });
    collectRefs(body, ident.name, edges);
    const tail = clean.slice(close + 1, close + 500);
    const semi = tail.indexOf(';');
    collectRefs(semi < 0 ? tail : tail.slice(0, semi), ident.name, edges);
    createRe.lastIndex = close + 1;
    match = createRe.exec(clean);
  }
  const alterRe = /\bALTER\s+TABLE\s+(?:ONLY\s+)?/gi;
  let alter = alterRe.exec(clean);
  while (alter) {
    const ident = readIdent(clean, alter.index + alter[0].length);
    if (ident.name) {
      const rest = clean.slice(ident.end);
      const next = rest.search(/\bALTER\s+TABLE\b/i);
      collectRefs(next < 0 ? rest : rest.slice(0, next), ident.name, edges);
    }
    alter = alterRe.exec(clean);
  }
  return { tables, edges };
}

/**
 * @param {{ tables?: Array<Record<string, unknown>>; relationships?: Array<Record<string, unknown>> }} diagram
 */
export function schemaFromDiagram(diagram) {
  const raw = Array.isArray(diagram?.tables) ? diagram.tables : [];
  const tables = raw
    .map((table) => ({
      name: String(table.name ?? 'table'),
      fields: (Array.isArray(table.fields) ? table.fields : [])
        .map((field) => String(field && typeof field === 'object' ? field.name ?? '' : field ?? ''))
        .filter(Boolean),
    }))
    .filter((table) => table.fields.length > 0);
  const idToName = new Map(raw.map((table) => [String(table.id), String(table.name ?? '')]));
  /** @type {Array<{ from: string, to: string }>} */
  const edges = [];
  for (const rel of diagram?.relationships ?? []) {
    const from = idToName.get(String(rel.startTableId));
    const to = idToName.get(String(rel.endTableId));
    if (from && to && from !== to) edges.push({ from, to });
  }
  return { tables, edges };
}

/**
 * @param {string} text
 */
function schemaFromDynamo(text) {
  const doc = parseYaml(text, { logLevel: 'silent' });
  const resources = doc && typeof doc === 'object' ? doc.Resources ?? {} : {};
  /** @type {Array<{ name: string, fields: string[] }>} */
  const tables = [];
  /** @type {Array<{ from: string, to: string }>} */
  const edges = [];
  for (const [logical, resource] of Object.entries(resources)) {
    if (!resource || resource.Type !== 'AWS::DynamoDB::Table') continue;
    const props = resource.Properties ?? {};
    const title =
      typeof props.TableName === 'string' && !props.TableName.includes('${') ? props.TableName : logical;
    const keyNames = new Set((props.KeySchema ?? []).map((key) => key?.AttributeName).filter(Boolean));
    const fields = (props.AttributeDefinitions ?? [])
      .map((attr) => attr?.AttributeName)
      .filter((name) => typeof name === 'string');
    fields.sort((a, b) => Number(keyNames.has(b)) - Number(keyNames.has(a)));
    if (fields.length === 0) continue;
    tables.push({ name: title, fields });
    for (const index of props.GlobalSecondaryIndexes ?? []) {
      const indexName = String(index?.IndexName ?? '').trim();
      const indexFields = (index?.KeySchema ?? [])
        .map((key) => key?.AttributeName)
        .filter((name) => typeof name === 'string');
      if (!indexName || indexFields.length === 0) continue;
      tables.push({ name: indexName, fields: indexFields });
      edges.push({ from: indexName, to: title });
    }
  }
  return { tables, edges };
}

/**
 * @param {string} text
 */
function schemaFromJsonSchema(text) {
  const doc = JSON.parse(text);
  const schemas = Array.isArray(doc?.schemas) ? doc.schemas : [];
  /** @type {Array<{ name: string, fields: string[] }>} */
  const tables = [];
  /** @type {Map<string, string>} */
  const idToName = new Map();
  for (const schema of schemas) {
    const name = String(schema?.title ?? '').trim();
    if (!name) continue;
    if (typeof schema.$id === 'string') idToName.set(schema.$id, name);
    const fields = Object.keys(schema?.properties ?? {});
    if (fields.length > 0) tables.push({ name, fields });
  }
  /** @type {Array<{ from: string, to: string }>} */
  const edges = [];
  for (const schema of schemas) {
    const name = String(schema?.title ?? '').trim();
    if (!name) continue;
    for (const prop of Object.values(schema?.properties ?? {})) {
      const ref = prop && typeof prop === 'object' ? prop.$ref : undefined;
      const target = typeof ref === 'string' ? idToName.get(ref) : undefined;
      if (target && target !== name) edges.push({ from: name, to: target });
    }
  }
  return { tables, edges };
}

/**
 * @param {Array<{ name: string, fields: string[] }>} tables
 * @param {Array<{ from: string, to: string }>} edges
 */
function pickCluster(tables, edges) {
  if (tables.length <= MAX_TABLES) return tables;
  const index = new Map(tables.map((table) => [table.name.toLowerCase(), table]));
  /** @type {Map<string, Set<string>>} */
  const adj = new Map([...index.keys()].map((name) => [name, new Set()]));
  for (const edge of edges) {
    const from = edge.from.toLowerCase();
    const to = edge.to.toLowerCase();
    if (!adj.has(from) || !adj.has(to) || from === to) continue;
    adj.get(from).add(to);
    adj.get(to).add(from);
  }
  let hub = tables[0].name.toLowerCase();
  let best = -1;
  for (const [name, neighbors] of adj) {
    if (neighbors.size > best) {
      best = neighbors.size;
      hub = name;
    }
  }
  /** @type {string[]} */
  const chosen = [hub];
  const ranked = [...(adj.get(hub) ?? [])].sort(
    (a, b) => (adj.get(b)?.size ?? 0) - (adj.get(a)?.size ?? 0),
  );
  for (const name of ranked) {
    if (chosen.length >= MAX_TABLES) break;
    chosen.push(name);
  }
  for (const table of tables) {
    if (chosen.length >= MAX_TABLES) break;
    const name = table.name.toLowerCase();
    if (!chosen.includes(name)) chosen.push(name);
  }
  return chosen.map((name) => index.get(name)).filter(Boolean);
}

/**
 * Tight dark-theme ER thumbnail. viewBox is 16/10 around the cluster, not the whole schema.
 * @param {{ tables?: Array<{ name: string, fields: string[] }>, edges?: Array<{ from: string, to: string }> }} schema
 */
export function buildPreviewSvg(schema) {
  const tables = pickCluster(schema?.tables ?? [], schema?.edges ?? []);
  if (tables.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200">
  <rect width="320" height="200" fill="#0d1b20"/>
  <text x="160" y="104" fill="#8fb8ae" font-size="14" text-anchor="middle" font-family="system-ui,sans-serif">No tables</text>
</svg>`;
  }

  const cols = tables.length === 1 ? 1 : 2;
  const tableW = tables.length === 1 ? 250 : TABLE_W;
  const heights = tables.map((table) => {
    const rows = Math.min(MAX_FIELDS, Math.max(table.fields.length, 1));
    return HEADER_H + rows * ROW_H + 4;
  });
  const rowCount = Math.ceil(tables.length / cols);
  /** @type {number[]} */
  const rowHeights = [];
  for (let row = 0; row < rowCount; row += 1) {
    let height = 0;
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      if (index < heights.length) height = Math.max(height, heights[index]);
    }
    rowHeights.push(height);
  }
  const gridW = cols * tableW + (cols - 1) * GAP_X;
  const gridH = rowHeights.reduce((sum, height) => sum + height, 0) + (rowCount - 1) * GAP_Y;
  const contentW = gridW + PAD * 2;
  const contentH = gridH + PAD * 2;

  /** @type {Array<{ table: { name: string, fields: string[] }, x: number, y: number, w: number, h: number }>} */
  const boxes = [];
  let cursorY = PAD;
  for (let row = 0; row < rowCount; row += 1) {
    const inRow = Math.min(cols, tables.length - row * cols);
    const rowW = inRow * tableW + (inRow - 1) * GAP_X;
    let cursorX = PAD + (gridW - rowW) / 2;
    for (let col = 0; col < inRow; col += 1) {
      const index = row * cols + col;
      boxes.push({ table: tables[index], x: cursorX, y: cursorY, w: tableW, h: heights[index] });
      cursorX += tableW + GAP_X;
    }
    cursorY += rowHeights[row] + GAP_Y;
  }

  const target = 16 / 10;
  let viewW = contentW;
  let viewH = contentH;
  if (viewW / viewH > target) viewH = viewW / target;
  else viewW = viewH * target;
  const offsetX = (viewW - contentW) / 2;
  const offsetY = (viewH - contentH) / 2;
  for (const box of boxes) {
    box.x += offsetX;
    box.y += offsetY;
  }

  const byName = new Map(boxes.map((box) => [box.table.name.toLowerCase(), box]));
  const seen = new Set();
  /** @type {string[]} */
  const lines = [];
  for (const edge of schema?.edges ?? []) {
    const from = byName.get(edge.from.toLowerCase());
    const to = byName.get(edge.to.toLowerCase());
    if (!from || !to || from === to) continue;
    const key = [from.table.name.toLowerCase(), to.table.name.toLowerCase()].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const start = port(from, to);
    const end = port(to, from);
    lines.push(
      `<line x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="#5dbea4" stroke-width="1.6"/>`,
    );
  }

  const shapes = boxes.map((box, index) => drawTable(box, index));
  const width = viewW.toFixed(1);
  const height = viewH.toFixed(1);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="1.2" cy="1.2" r="0.8" fill="#1c3a44"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="#0d1b20"/>
  <rect width="${width}" height="${height}" fill="url(#dots)"/>
  ${lines.join('\n  ')}
  ${shapes.join('\n  ')}
</svg>`;
}

/** @param {{ x: number, y: number, w: number, h: number }} box @param {{ x: number, y: number, w: number, h: number }} other */
function port(box, other) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = other.x + other.w / 2 - cx;
  const dy = other.y + other.h / 2 - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: dx > 0 ? box.x + box.w : box.x, y: cy };
  }
  return { x: cx, y: dy > 0 ? box.y + box.h : box.y };
}

/** @param {{ table: { name: string, fields: string[] }, x: number, y: number, w: number, h: number }} box @param {number} index */
function drawTable(box, index) {
  const { table, x, y, w, h } = box;
  const fields = table.fields.slice(0, MAX_FIELDS);
  const clip = `t${index}`;
  const rows = fields
    .map((field, row) => {
      const top = y + HEADER_H + row * ROW_H;
      const divider =
        row === fields.length - 1
          ? ''
          : `<line x1="${(x + 1).toFixed(1)}" y1="${(top + ROW_H).toFixed(1)}" x2="${(x + w - 1).toFixed(1)}" y2="${(top + ROW_H).toFixed(1)}" stroke="#24515c" stroke-width="1"/>`;
      return `<text x="${(x + 8).toFixed(1)}" y="${(top + ROW_H - 3).toFixed(1)}" fill="#e7f6f1" font-size="${FIELD_SIZE}" font-family="ui-sans-serif,system-ui,sans-serif">${fitLabel(field, 20)}</text>${divider}`;
    })
    .join('');
  return `<g>
    <clipPath id="${clip}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${h.toFixed(1)}" rx="4"/></clipPath>
    <g clip-path="url(#${clip})">
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${h.toFixed(1)}" fill="#163038"/>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${HEADER_H}" fill="#1a6ca3"/>
      ${rows}
    </g>
    <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${h.toFixed(1)}" rx="4" fill="none" stroke="#3d9a84" stroke-width="1.25"/>
    <text x="${(x + 8).toFixed(1)}" y="${(y + 13).toFixed(1)}" fill="#f3fbff" font-size="${TITLE_SIZE}" font-weight="650" font-family="ui-sans-serif,system-ui,sans-serif">${fitLabel(table.name, 18)}</text>
  </g>`;
}

/** @param {string} svg @param {string} hint */
function assertPreviewSvg(svg, hint) {
  const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!viewBox) throw new Error(`Missing viewBox (${hint})`);
  const width = Number(viewBox[1]);
  const height = Number(viewBox[2]);
  if (!(width > 0) || Math.abs(width / height - 1.6) > 0.08) {
    throw new Error(`Preview aspect ${width}x${height} is not 16/10 (${hint})`);
  }
  if (width > 560) throw new Error(`Preview viewBox ${width} is still zoomed out (${hint})`);
  const texts = svg.match(/<text /g) ?? [];
  if (texts.length < 2) throw new Error(`Preview has no field rows (${hint})`);
}

function assertParser() {
  const schema = parseSqlSchema(`
    CREATE TABLE IF NOT EXISTS "users" (
      -- key
      "id" BIGINT,
      "login" VARCHAR(39) NOT NULL,
      PRIMARY KEY("id")
    );
    CREATE TABLE IF NOT EXISTS "repos" (
      "id" BIGINT,
      "owner_id" BIGINT NOT NULL,
      PRIMARY KEY("id")
    );
    ALTER TABLE "repos"
    ADD FOREIGN KEY("owner_id") REFERENCES "users"("id");
  `);
  if (schema.tables.length !== 2) throw new Error(`Expected 2 tables, got ${schema.tables.length}`);
  const users = schema.tables.find((table) => table.name === 'users');
  if (!users?.fields.includes('login')) throw new Error('Quoted column login was not parsed');
  if (!schema.edges.some((edge) => edge.from === 'repos' && edge.to === 'users')) {
    throw new Error('ALTER TABLE foreign key was not parsed');
  }
  const svg = buildPreviewSvg(schema);
  if (!svg.includes('>login<') || !svg.includes('>owner_id<')) throw new Error('Field names missing from SVG');
  assertPreviewSvg(svg, 'parser fixture');
}

/** @param {string} exampleId */
function studioPreviewSlug(exampleId) {
  return exampleId.replace(/\.(sql|ddl|ya?ml|json|template)$/i, '').replace(/\//g, '-');
}

/**
 * @param {string} examplesDir
 * @returns {Array<{ id: string, file: string, kind: 'sql' | 'dynamo' | 'json-schema' }>}
 */
function listStudioSources(examplesDir) {
  /** @type {Array<{ id: string, file: string, kind: 'sql' | 'dynamo' | 'json-schema' }>} */
  const files = [];
  for (const entry of readdirSync(examplesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'drawdb') continue;
    const domain = entry.name;
    const dir = join(examplesDir, domain);
    if (domain === 'oracle') {
      for (const name of readdirSync(dir).sort()) {
        if (name.toLowerCase().endsWith('.ddl')) {
          files.push({ id: `${domain}/${name}`, file: join(dir, name), kind: 'sql' });
        }
      }
      continue;
    }
    if (domain === 'dynamodb') {
      for (const name of readdirSync(dir).sort()) {
        if (/\.(ya?ml|json|template)$/i.test(name)) {
          files.push({ id: `${domain}/${name}`, file: join(dir, name), kind: 'dynamo' });
        }
      }
      continue;
    }
    if (domain === 'dialects') {
      for (const name of readdirSync(dir).sort()) {
        if (!/\.(sql|ya?ml|json)$/i.test(name)) continue;
        const kind = name.endsWith('.json') ? 'json-schema' : /\.ya?ml$/i.test(name) ? 'dynamo' : 'sql';
        files.push({ id: `${domain}/${name}`, file: join(dir, name), kind });
      }
      continue;
    }
    const sqlPath = join(dir, `${domain}.sql`);
    if (existsSync(sqlPath)) files.push({ id: domain, file: sqlPath, kind: 'sql' });
  }
  return files;
}

/** @param {string} file @param {'sql' | 'dynamo' | 'json-schema'} kind */
function schemaFromFile(file, kind) {
  const text = readFileSync(file, 'utf8');
  if (kind === 'dynamo') return schemaFromDynamo(text);
  if (kind === 'json-schema') return schemaFromJsonSchema(text);
  return parseSqlSchema(text);
}

/** Rewrite gallery SVGs from files already in the repo. Does not fetch or delete DDL. */
function regeneratePreviews() {
  assertParser();
  const studioDir = join(REPO_ROOT, 'web', 'public', 'example-previews', 'studio');
  mkdirSync(PUBLIC_PREVIEWS, { recursive: true });
  mkdirSync(studioDir, { recursive: true });

  const drawdbRoot = join(REPO_ROOT, 'examples', 'drawdb');
  let drawdbCount = 0;
  for (const entry of readdirSync(drawdbRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sqlPath = join(drawdbRoot, entry.name, 'schema.sql');
    if (!existsSync(sqlPath)) continue;
    const schema = parseSqlSchema(readFileSync(sqlPath, 'utf8'));
    if (schema.tables.length === 0) throw new Error(`No tables parsed from ${sqlPath}`);
    const svg = buildPreviewSvg(schema);
    assertPreviewSvg(svg, entry.name);
    writeFileSync(join(drawdbRoot, entry.name, 'preview.svg'), svg);
    writeFileSync(join(PUBLIC_PREVIEWS, `${entry.name}.svg`), svg);
    drawdbCount += 1;
  }
  if (drawdbCount !== 100) {
    throw new Error(`Expected 100 drawdb previews, wrote ${drawdbCount}`);
  }

  const studio = listStudioSources(join(REPO_ROOT, 'examples'));
  if (studio.length === 0) throw new Error('No studio examples found to preview');
  for (const source of studio) {
    const schema = schemaFromFile(source.file, source.kind);
    if (schema.tables.length === 0) throw new Error(`No tables parsed from ${source.file}`);
    const svg = buildPreviewSvg(schema);
    assertPreviewSvg(svg, source.id);
    writeFileSync(join(studioDir, `${studioPreviewSlug(source.id)}.svg`), svg);
  }
  console.log(`[sync-drawdb] Regenerated ${drawdbCount} drawdb and ${studio.length} studio previews`);
}

/** Map drawDB primaryDialect → hvyMETL dialect id for parsing. */
function mapDialect(primaryDialect) {
  const raw = String(primaryDialect ?? 'postgresql').toLowerCase();
  if (raw === 'postgres' || raw === 'postgresql') return 'postgresql';
  if (raw === 'mysql') return 'mysql';
  if (raw === 'mariadb') return 'mariadb';
  if (raw === 'sqlite') return 'sqlite';
  if (raw === 'mssql' || raw === 'transactsql' || raw === 'sqlserver') return 'mssql';
  if (raw === 'oracle' || raw === 'oraclesql') return 'oracle';
  return 'postgresql';
}

/** Pick DDL string for primary dialect from sql.json. */
function pickDdl(sqlJson, primaryDialect) {
  if (!sqlJson || typeof sqlJson !== 'object') return '';
  const preferred = String(primaryDialect ?? 'postgresql').toLowerCase();
  const keys = [
    preferred,
    preferred === 'postgresql' ? 'postgresql' : null,
    'postgresql',
    'mysql',
    'sqlite',
    'mariadb',
    'transactsql',
    'oraclesql',
  ].filter(Boolean);
  for (const key of keys) {
    const value = sqlJson[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

async function main() {
  if (process.argv.includes('--previews')) {
    regeneratePreviews();
    return;
  }
  console.log(`[sync-drawdb] Fetching ${INDEX_URL}`);
  const index = await fetchJson(INDEX_URL);
  const license = String(index.license ?? 'CC0-1.0');
  const examples = Array.isArray(index.examples) ? index.examples : [];
  if (examples.length === 0) {
    throw new Error('drawDB index returned zero examples.');
  }

  if (existsSync(OUT_DIR)) {
    rmSync(OUT_DIR, { recursive: true, force: true });
  }
  if (existsSync(PUBLIC_PREVIEWS)) {
    rmSync(PUBLIC_PREVIEWS, { recursive: true, force: true });
  }
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(PUBLIC_PREVIEWS, { recursive: true });

  const manifestEntries = await mapPool(examples, CONCURRENCY, async (entry) => {
    const slug = String(entry.slug ?? '').trim();
    if (!slug) throw new Error('Example missing slug.');
    const documentUrl = String(entry.document ?? `https://www.drawdb.app/examples/${slug}.json`);
    const sqlUrl = String(entry.sql ?? `https://www.drawdb.app/examples/${slug}.sql.json`);
    const [diagram, sqlJson] = await Promise.all([fetchJson(documentUrl), fetchJson(sqlUrl)]);
    const primaryDialect = String(entry.primaryDialect ?? diagram.database ?? 'postgresql');
    const ddl = pickDdl(sqlJson, primaryDialect);
    if (!ddl.trim()) {
      throw new Error(`No DDL for slug=${slug}`);
    }

    const dir = join(OUT_DIR, slug);
    mkdirSync(dir, { recursive: true });
    const meta = {
      slug,
      title: String(entry.title ?? diagram.title ?? slug),
      description: String(entry.description ?? ''),
      category: String(entry.category ?? 'general'),
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
      primaryDialect,
      dialect: mapDialect(primaryDialect),
      tableCount: Number(entry.tableCount ?? diagram.tables?.length ?? 0),
      columnCount: Number(entry.columnCount ?? 0),
      relationshipCount: Number(entry.relationshipCount ?? diagram.relationships?.length ?? 0),
      sourcePage: String(entry.page ?? `https://www.drawdb.app/examples/${slug}`),
      license,
      attribution: 'Vendored from drawDB examples (CC0-1.0). https://www.drawdb.app/examples',
    };
    writeFileSync(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
    writeFileSync(join(dir, 'schema.sql'), ddl.endsWith('\n') ? ddl : `${ddl}\n`);
    const svg = buildPreviewSvg(schemaFromDiagram(diagram));
    writeFileSync(join(dir, 'preview.svg'), svg);
    writeFileSync(join(PUBLIC_PREVIEWS, `${slug}.svg`), svg);

    process.stdout.write('.');
    return {
      id: `drawdb/${slug}/schema.sql`,
      slug,
      label: meta.title.replace(/\s*\(ER diagram \+ SQL\)\s*$/i, '').trim() || meta.title,
      description: meta.description,
      dialect: meta.dialect,
      primaryDialect: meta.primaryDialect,
      category: meta.category,
      tags: meta.tags,
      tableCount: meta.tableCount,
      columnCount: meta.columnCount,
      relationshipCount: meta.relationshipCount,
      previewUrl: `/example-previews/drawdb/${slug}.svg`,
      source: 'drawdb',
      license,
    };
  });

  process.stdout.write('\n');

  const manifest = {
    license,
    source: 'https://www.drawdb.app/examples',
    generatedAt: new Date().toISOString().slice(0, 10),
    count: manifestEntries.length,
    examples: manifestEntries.sort((a, b) => a.label.localeCompare(b.label)),
  };
  writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    join(OUT_DIR, 'README.md'),
    `# drawDB example schemas (CC0-1.0)

These ${manifest.count} schemas are vendored from [drawDB examples](https://www.drawdb.app/examples)
(\`license: ${license}\` in their public index). They are **public domain / CC0** — not AGPL drawDB editor code.

Refresh with:

\`\`\`bash
node scripts/sync-drawdb-examples.mjs
\`\`\`

Each folder contains \`meta.json\`, \`schema.sql\` (primary dialect DDL), and \`preview.svg\`.
Gallery thumbnails are also copied to \`web/public/example-previews/drawdb/\`.
`,
  );

  console.log(`[sync-drawdb] Wrote ${manifest.count} examples → ${OUT_DIR}`);
  if (manifest.count !== 100) {
    console.warn(`[sync-drawdb] Expected 100 examples, got ${manifest.count}`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
