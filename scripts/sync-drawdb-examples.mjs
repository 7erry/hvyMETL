#!/usr/bin/env node
/**
 * Vendor CC0 drawDB example schemas into examples/drawdb/ for offline gallery use.
 * Source: https://www.drawdb.app/examples/index.json (license: CC0-1.0)
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/**
 * Compact ER thumbnail from drawDB diagram tables + relationships.
 * @param {{ tables?: Array<Record<string, unknown>>; relationships?: Array<Record<string, unknown>> }} diagram
 */
function buildPreviewSvg(diagram) {
  const tables = Array.isArray(diagram.tables) ? diagram.tables : [];
  if (tables.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
  <rect width="320" height="180" fill="#0f1c1c"/>
  <text x="160" y="95" fill="#6b8f8f" font-size="12" text-anchor="middle" font-family="system-ui,sans-serif">No preview</text>
</svg>`;
  }

  const xs = tables.map((table) => Number(table.x) || 0);
  const ys = tables.map((table) => Number(table.y) || 0);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs.map((x, index) => x + 180));
  const maxY = Math.max(...ys.map((y, index) => y + 40 + Math.min(6, (tables[index]?.fields?.length ?? 1)) * 14));
  const width = Math.max(320, maxX - minX + 40);
  const height = Math.max(180, maxY - minY + 40);
  const pad = 20;

  const byId = new Map(tables.map((table) => [String(table.id), table]));
  const lines = [];
  for (const rel of diagram.relationships ?? []) {
    const start = byId.get(String(rel.startTableId));
    const end = byId.get(String(rel.endTableId));
    if (!start || !end) continue;
    const x1 = (Number(start.x) || 0) - minX + pad + 90;
    const y1 = (Number(start.y) || 0) - minY + pad + 20;
    const x2 = (Number(end.x) || 0) - minX + pad + 90;
    const y2 = (Number(end.y) || 0) - minY + pad + 20;
    lines.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#2a6b5a" stroke-width="1.2" opacity="0.75"/>`,
    );
  }

  const boxes = tables.map((table) => {
    const x = (Number(table.x) || 0) - minX + pad;
    const y = (Number(table.y) || 0) - minY + pad;
    const fieldCount = Array.isArray(table.fields) ? Math.min(table.fields.length, 5) : 1;
    const h = 22 + fieldCount * 11;
    const name = String(table.name ?? 'table').replace(/[<>&"]/g, '');
    return [
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="160" height="${h}" rx="4" fill="#16302c" stroke="#2f8f6d" stroke-width="1"/>`,
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="160" height="16" rx="4" fill="#1f4a42"/>`,
      `<text x="${(x + 6).toFixed(1)}" y="${(y + 12).toFixed(1)}" fill="#d7fff0" font-size="9" font-family="system-ui,sans-serif">${name.slice(0, 22)}</text>`,
    ].join('');
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#0b1616"/>
  ${lines.join('\n  ')}
  ${boxes.join('\n  ')}
</svg>`;
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
    const svg = buildPreviewSvg(diagram);
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
