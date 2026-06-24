/**
 * Run design → ETL → Atlas import for all seven example domains, then validate
 * document counts and bucket integrity against the ETL manifest and SQLite source.
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { MongoClient } from 'mongodb';
import Database from 'better-sqlite3';
import { formatMongoConnectivityFailure, maskMongoUri, verifyMongoUri } from '../dist/utilities/mongoConnectivity.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Fail fast with a clear fix when better-sqlite3 was built for another Node version. */
function assertBetterSqlite3() {
  try {
    const probe = new Database(':memory:');
    probe.close();
  } catch (error) {
    const message = String(error);
    if (error?.code === 'ERR_DLOPEN_FAILED' || message.includes('NODE_MODULE_VERSION')) {
      console.error('better-sqlite3 native module does not match this Node.js version.');
      console.error(`  Node: ${process.version}`);
      console.error('  Fix: npm rebuild better-sqlite3');
      console.error('       (or npm install — postinstall rebuilds native deps automatically)');
      process.exit(1);
    }
    throw error;
  }
}

const DOMAINS = [
  { id: 'catalog', profile: 'catalog', source: 'examples/catalog/catalog.db' },
  { id: 'cms', profile: 'cms', source: 'examples/cms/cms.db' },
  { id: 'iot', profile: 'iot', source: 'examples/iot/iot.db' },
  { id: 'mobile', profile: 'mobile', source: 'examples/mobile/mobile.db' },
  { id: 'personalization', profile: 'personalization', source: 'examples/personalization/personalization.db' },
  { id: 'analytics', profile: 'realtime-analytics', source: 'examples/analytics/analytics.db' },
  { id: 'singleview', profile: 'single-view', source: 'examples/singleview/singleview.db' },
];

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, DRY_RUN: '' } });
}

function sqliteCount(dbPath, table) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const row = db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get();
  db.close();
  return Number(row.c);
}

async function validateDomain(domain, mongoClient) {
  const outDir = join(ROOT, 'out', domain.id);
  const manifestPath = join(outDir, 'etl-manifest.json');
  const planPath = join(outDir, 'migration-plan.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const dbName = `hvymetl_${domain.id}`;
  const db = mongoClient.db(dbName);
  const issues = [];

  for (const coll of manifest.collections) {
    const expected = coll.rowCount;
    const actual = await db.collection(coll.name).countDocuments();
    if (actual !== expected) {
      issues.push(`${coll.name}: expected ${expected} docs, got ${actual}`);
    }

    const dupes = await db
      .collection(coll.name)
      .aggregate([{ $group: { _id: '$_id', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $count: 'dupes' }])
      .toArray();
    if (dupes[0]?.dupes > 0) {
      issues.push(`${coll.name}: ${dupes[0].dupes} duplicate _id groups`);
    }

    const sample = await db.collection(coll.name).findOne({}, { projection: { schemaVersion: 1 } });
    if (!sample || sample.schemaVersion === undefined) {
      issues.push(`${coll.name}: missing schemaVersion on sample document`);
    }
  }

  for (const collection of plan.collections) {
    if (!collection.bucket) continue;
    const sourceTable = collection.sourceTable;
    const sourceRows = sqliteCount(join(ROOT, domain.source), sourceTable);
    const bucketColl = collection.name;
    const sumResult = await db
      .collection(bucketColl)
      .aggregate([{ $group: { _id: null, total: { $sum: '$count' } } }])
      .toArray();
    const summed = sumResult[0]?.total ?? 0;
    if (summed !== sourceRows) {
      issues.push(
        `${bucketColl} bucket integrity: sum(count)=${summed} but source ${sourceTable} has ${sourceRows} rows`,
      );
    }
  }

  return { dbName, collections: manifest.collections.length, issues };
}

async function ensureMongoReady() {
  if (skipAtlasImport) {
    console.log('HVYMETL_SKIP_ATLAS_IMPORT=1 — skipping csvToAtlas import and MongoDB validation.\n');
    return;
  }

  const result = await verifyMongoUri(process.env.MONGODB_URI, { timeoutMs: 12_000 });
  if (!result.ok) {
    console.error('\nMongoDB connectivity check failed:\n');
    console.error(formatMongoConnectivityFailure(result));
    console.error('\nFix MONGODB_URI in .env or set HVYMETL_SKIP_ATLAS_IMPORT=1 to run design + ETL only.\n');
    process.exit(1);
  }
}

const skipAtlasImport =
  process.env.HVYMETL_SKIP_ATLAS_IMPORT === '1' || process.env.HVYMETL_SKIP_ATLAS_IMPORT === 'true';

async function main() {
  if (!process.env.MONGODB_URI && !skipAtlasImport) {
    console.error('MONGODB_URI is not set in .env');
    process.exit(1);
  }
  if (!process.env.CSV_TO_ATLAS_PATH?.trim()) {
    console.error('CSV_TO_ATLAS_PATH is not set in .env (clone https://github.com/7erry/cvsToAtlas)');
    process.exit(1);
  }

  console.log('=== hvyMETL full example run ===');
  if (process.env.MONGODB_URI) {
    console.log(`Cluster: ${maskMongoUri(process.env.MONGODB_URI)}`);
  }
  console.log(`Validation DB prefix: hvymetl_<domain>\n`);

  assertBetterSqlite3();

  run('npm run -s build');
  await ensureMongoReady();
  run('npm test');
  run('npm run -s seed-examples');

  for (const domain of DOMAINS) {
    const out = `out/${domain.id}`;
    run(`node dist/cli.js design --source ${domain.source} --profile ${domain.profile} --out ${out}`);
    run(`node dist/cli.js etl --plan ${out}/migration-plan.json --out ${out}`);

    if (skipAtlasImport) continue;

    const manifest = JSON.parse(readFileSync(join(ROOT, out, 'etl-manifest.json'), 'utf8'));
    const dbName = `hvymetl_${domain.id}`;

    for (const coll of manifest.collections) {
      const actualFiles = coll.files.filter((f) => existsSync(join(ROOT, f)));
      if (actualFiles.length === 0) {
        throw new Error(`No CSV files found for ${domain.id}/${coll.name}: ${coll.files.join(', ')}`);
      }
      const fileArgs = actualFiles.join(' ');
      run(`node scripts/import-cli.mjs ${fileArgs} ${coll.name} --drop --db ${dbName}`);
    }
  }

  if (skipAtlasImport) {
    console.log('\nSkipped Atlas import — design + ETL completed for all domains.');
    return;
  }

  console.log('\n=== Validating MongoDB imports ===\n');
  const mongoClient = new MongoClient(process.env.MONGODB_URI);
  await mongoClient.connect();

  const summary = [];
  let failed = false;

  for (const domain of DOMAINS) {
    const result = await validateDomain(domain, mongoClient);
    summary.push({ domain: domain.id, ...result });
    if (result.issues.length > 0) {
      failed = true;
      console.log(`FAIL  ${domain.id} (${result.dbName})`);
      for (const issue of result.issues) console.log(`  - ${issue}`);
    } else {
      console.log(`PASS  ${domain.id} (${result.dbName}) — ${result.collections} collections OK`);
    }
  }

  await mongoClient.close();

  console.log('\n=== Summary ===');
  for (const row of summary) {
    console.log(`${row.issues.length === 0 ? '✓' : '✗'} ${row.domain.padEnd(18)} ${row.dbName.padEnd(22)} ${row.collections} collections`);
  }

  if (failed) process.exit(1);
  console.log('\nAll examples passed validation.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
