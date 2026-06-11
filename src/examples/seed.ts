/**
 * Example database seeder.
 *
 * Builds seven realistic SQLite databases (one per workload domain) from the
 * DDL files in examples/*.sql, then fills them with deterministic
 * pseudo-random data. The data is intentionally shaped to exercise the
 * pattern selector:
 *   - skewed child counts (most parents have few children, a few have
 *     thousands) so the Outlier/Subset patterns trigger,
 *   - high-volume timestamped tables so the Bucket pattern triggers,
 *   - EAV tables so the Attribute pattern triggers,
 *   - self-referencing tables so the Tree pattern triggers.
 *
 * Run with: npm run seed-examples
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Folder holding the .sql DDL files and receiving the .db outputs. */
const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples');

/* -------------------------------------------------------------------------- */
/* Deterministic random helpers                                               */
/* -------------------------------------------------------------------------- */

/**
 * A tiny linear congruential generator. Seeded once per domain so every run
 * of the seeder produces byte-identical databases (reproducible demos).
 */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** Random integer in [min, max] inclusive. */
function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pick one element of an array at random. */
function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** True with the given probability (0 to 1). */
function chance(rng: () => number, probability: number): boolean {
  return rng() < probability;
}

/** ISO-8601 timestamp a random number of minutes back from a fixed anchor. */
function isoMinutesAgo(minutesAgo: number): string {
  // Fixed anchor keeps seeding deterministic across runs.
  const anchor = Date.parse('2026-06-01T00:00:00Z');
  return new Date(anchor - minutesAgo * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/* -------------------------------------------------------------------------- */
/* Database helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Delete any previous .db file and create a fresh one from its DDL script. */
function createDatabase(name: string): Database.Database {
  const dbPath = join(EXAMPLES_DIR, `${name}.db`);
  if (existsSync(dbPath)) rmSync(dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(readFileSync(join(EXAMPLES_DIR, `${name}.sql`), 'utf8'));
  return db;
}

/** Run a seeding function inside one transaction (fast bulk inserts). */
function seedInTransaction(db: Database.Database, seedFn: () => void): void {
  db.transaction(seedFn)();
}

/* -------------------------------------------------------------------------- */
/* Domain seeders                                                             */
/* -------------------------------------------------------------------------- */

const FIRST_NAMES = ['Ada', 'Grace', 'Alan', 'Edsger', 'Barbara', 'Donald', 'Margaret', 'Linus', 'Radia', 'Vint'];
const LAST_NAMES = ['Lovelace', 'Hopper', 'Turing', 'Dijkstra', 'Liskov', 'Knuth', 'Hamilton', 'Torvalds', 'Perlman', 'Cerf'];
const WORDS = ['quantum', 'turbo', 'nova', 'apex', 'prime', 'flux', 'core', 'hyper', 'ultra', 'metro', 'zen', 'volt'];

/** Build a deterministic human name from the RNG. */
function personName(rng: () => number): string {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
}

/** Build a deterministic product-ish name from the RNG. */
function thingName(rng: () => number): string {
  return `${pick(rng, WORDS)}-${pick(rng, WORDS)}-${randInt(rng, 100, 999)}`;
}

/** Seed the e-commerce catalog domain with skewed review counts. */
function seedCatalog(): void {
  const db = createDatabase('catalog');
  const rng = makeRng(101);
  seedInTransaction(db, () => {
    const insertBrand = db.prepare('INSERT INTO brands (name, country, website) VALUES (?, ?, ?)');
    for (let i = 1; i <= 12; i += 1) {
      insertBrand.run(`Brand ${thingName(rng)}`, pick(rng, ['US', 'DE', 'JP', 'KR', 'FR']), `https://brand${i}.example.com`);
    }

    const insertCategory = db.prepare('INSERT INTO categories (parent_id, name, slug) VALUES (?, ?, ?)');
    // Three-level category tree: 5 roots, 3 children each, 1-2 grandchildren.
    let categoryCount = 0;
    for (let root = 0; root < 5; root += 1) {
      const rootId = Number(insertCategory.run(null, `Root ${thingName(rng)}`, `root-${root}`).lastInsertRowid);
      categoryCount += 1;
      for (let mid = 0; mid < 3; mid += 1) {
        const midId = Number(insertCategory.run(rootId, `Sub ${thingName(rng)}`, `sub-${root}-${mid}`).lastInsertRowid);
        categoryCount += 1;
        for (let leaf = 0; leaf < randInt(rng, 1, 2); leaf += 1) {
          insertCategory.run(midId, `Leaf ${thingName(rng)}`, `leaf-${root}-${mid}-${leaf}`);
          categoryCount += 1;
        }
      }
    }

    const insertProduct = db.prepare(
      'INSERT INTO products (brand_id, category_id, sku, name, description, base_price_cents, currency, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const insertVariant = db.prepare(
      'INSERT INTO product_variants (product_id, variant_sku, color, size, price_cents, weight_grams) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertAttribute = db.prepare(
      'INSERT INTO product_attributes (product_id, attr_key, attr_value) VALUES (?, ?, ?)',
    );
    const insertReview = db.prepare(
      'INSERT INTO reviews (product_id, reviewer_name, stars, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertInventory = db.prepare(
      'INSERT INTO inventory_levels (variant_id, warehouse_code, quantity_on_hand, updated_at) VALUES (?, ?, ?, ?)',
    );

    const attributeKeys = ['color_family', 'voltage', 'material', 'region', 'warranty_months', 'certification', 'finish', 'capacity'];
    const variantColors: (string | null)[] = ['red', 'blue', 'black', 'silver', null];
    for (let p = 1; p <= 400; p += 1) {
      const productId = Number(
        insertProduct.run(
          randInt(rng, 1, 12),
          randInt(rng, 1, categoryCount),
          `SKU-${10000 + p}`,
          `Product ${thingName(rng)}`,
          `A reliable ${pick(rng, WORDS)} product for everyday use.`,
          randInt(rng, 499, 99999),
          'USD',
          chance(rng, 0.92) ? 1 : 0,
          isoMinutesAgo(randInt(rng, 0, 500000)),
        ).lastInsertRowid,
      );

      for (let v = 0; v < randInt(rng, 1, 4); v += 1) {
        const variantId = Number(
          insertVariant.run(
            productId,
            `SKU-${10000 + p}-V${v}`,
            pick(rng, variantColors),
            pick(rng, ['S', 'M', 'L', 'XL']),
            randInt(rng, 499, 109999),
            randInt(rng, 50, 9000),
          ).lastInsertRowid,
        );
        for (const warehouse of ['EAST', 'WEST', 'EU']) {
          insertInventory.run(variantId, warehouse, randInt(rng, 0, 500), isoMinutesAgo(randInt(rng, 0, 10000)));
        }
      }

      for (let a = 0; a < randInt(rng, 0, 8); a += 1) {
        insertAttribute.run(productId, pick(rng, attributeKeys), `${pick(rng, WORDS)}-${randInt(rng, 1, 50)}`);
      }

      // Skewed reviews: 5 hand-picked outlier products get 800-1500 reviews;
      // everyone else gets 0-15. This exercises Outlier + Subset selection.
      const reviewCount = p <= 5 ? randInt(rng, 800, 1500) : randInt(rng, 0, 15);
      for (let r = 0; r < reviewCount; r += 1) {
        insertReview.run(
          productId,
          personName(rng),
          randInt(rng, 1, 5),
          `Review of product ${p}`,
          `The ${pick(rng, WORDS)} is ${pick(rng, ['great', 'fine', 'poor', 'stellar'])}.`,
          isoMinutesAgo(randInt(rng, 0, 500000)),
        );
      }
    }
  });
  db.close();
  console.log('Seeded examples/catalog.db');
}

/** Seed the content-management domain with polymorphic blocks. */
function seedCms(): void {
  const db = createDatabase('cms');
  const rng = makeRng(202);
  seedInTransaction(db, () => {
    const insertAuthor = db.prepare('INSERT INTO authors (display_name, email, role) VALUES (?, ?, ?)');
    for (let i = 1; i <= 15; i += 1) {
      insertAuthor.run(personName(rng), `author${i}@example.com`, pick(rng, ['editor', 'admin', 'contributor']));
    }

    const insertAsset = db.prepare(
      'INSERT INTO assets (file_name, mime_type, byte_size, storage_url, uploaded_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (let i = 1; i <= 200; i += 1) {
      const isVideo = chance(rng, 0.25);
      insertAsset.run(
        `asset-${i}.${isVideo ? 'mp4' : 'jpg'}`,
        isVideo ? 'video/mp4' : 'image/jpeg',
        randInt(rng, 20000, 80000000),
        `https://cdn.example.com/assets/asset-${i}`,
        isoMinutesAgo(randInt(rng, 0, 700000)),
      );
    }

    const insertPage = db.prepare(
      'INSERT INTO pages (parent_id, author_id, slug, title, status, published_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const insertBlock = db.prepare(
      'INSERT INTO content_blocks (page_id, position, block_type, text_body, image_asset_id, image_alt, video_asset_id, video_duration_sec, embed_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const insertRevision = db.prepare(
      'INSERT INTO page_revisions (page_id, author_id, revision_number, change_summary, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );

    const pageIds: number[] = [];
    for (let p = 1; p <= 120; p += 1) {
      // Roughly a third of pages nest under an earlier page (tree shape).
      const parentId = pageIds.length > 3 && chance(rng, 0.35) ? pick(rng, pageIds) : null;
      const published = chance(rng, 0.7);
      const pageId = Number(
        insertPage.run(
          parentId,
          randInt(rng, 1, 15),
          `page-${p}`,
          `Page ${thingName(rng)}`,
          published ? 'published' : 'draft',
          published ? isoMinutesAgo(randInt(rng, 0, 400000)) : null,
          isoMinutesAgo(randInt(rng, 400000, 700000)),
        ).lastInsertRowid,
      );
      pageIds.push(pageId);

      for (let b = 0; b < randInt(rng, 3, 12); b += 1) {
        const blockType = pick(rng, ['text', 'text', 'text', 'image', 'video', 'embed']);
        insertBlock.run(
          pageId,
          b,
          blockType,
          blockType === 'text' ? `Paragraph about ${pick(rng, WORDS)} ${pick(rng, WORDS)}.` : null,
          blockType === 'image' ? randInt(rng, 1, 200) : null,
          blockType === 'image' ? `Alt text ${b}` : null,
          blockType === 'video' ? randInt(rng, 1, 200) : null,
          blockType === 'video' ? randInt(rng, 15, 1800) : null,
          blockType === 'embed' ? `https://embed.example.com/${pick(rng, WORDS)}` : null,
        );
      }

      for (let r = 1; r <= randInt(rng, 1, 10); r += 1) {
        insertRevision.run(
          pageId,
          randInt(rng, 1, 15),
          r,
          `Edit pass ${r}`,
          JSON.stringify({ title: `Page ${p} rev ${r}`, blocks: randInt(rng, 3, 12) }),
          isoMinutesAgo(randInt(rng, 0, 400000)),
        );
      }
    }

    const insertTag = db.prepare('INSERT INTO tags (name, slug) VALUES (?, ?)');
    for (let t = 1; t <= 40; t += 1) insertTag.run(`Tag ${pick(rng, WORDS)} ${t}`, `tag-${t}`);
    const insertPageTag = db.prepare('INSERT INTO page_tags (page_id, tag_id) VALUES (?, ?)');
    for (const pageId of pageIds) {
      const tagCount = randInt(rng, 0, 5);
      const usedTags = new Set<number>();
      for (let t = 0; t < tagCount; t += 1) {
        const tagId = randInt(rng, 1, 40);
        if (usedTags.has(tagId)) continue;
        usedTags.add(tagId);
        insertPageTag.run(pageId, tagId);
      }
    }
  });
  db.close();
  console.log('Seeded examples/cms.db');
}

/** Seed the IoT domain with a 60k-row sensor reading firehose. */
function seedIot(): void {
  const db = createDatabase('iot');
  const rng = makeRng(303);
  seedInTransaction(db, () => {
    const insertSite = db.prepare('INSERT INTO sites (name, timezone, latitude, longitude) VALUES (?, ?, ?, ?)');
    for (let s = 1; s <= 5; s += 1) {
      insertSite.run(`Site ${thingName(rng)}`, pick(rng, ['UTC', 'America/New_York', 'Europe/Berlin']), rng() * 180 - 90, rng() * 360 - 180);
    }

    const insertFirmware = db.prepare('INSERT INTO firmware_versions (version, released_at, changelog) VALUES (?, ?, ?)');
    for (let f = 1; f <= 4; f += 1) insertFirmware.run(`v2.${f}.0`, isoMinutesAgo(f * 100000), `Release notes for v2.${f}.0`);

    const insertDevice = db.prepare(
      'INSERT INTO devices (site_id, firmware_id, serial_number, model, installed_at, is_online) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertSensor = db.prepare(
      'INSERT INTO sensors (device_id, kind, unit, precision_digits) VALUES (?, ?, ?, ?)',
    );
    const sensorRows: { sensorId: number; deviceId: number }[] = [];
    for (let d = 1; d <= 60; d += 1) {
      const deviceId = Number(
        insertDevice.run(randInt(rng, 1, 5), randInt(rng, 1, 4), `SN-${100000 + d}`, pick(rng, ['TH-200', 'PX-9', 'AQ-50']), isoMinutesAgo(randInt(rng, 100000, 800000)), chance(rng, 0.9) ? 1 : 0).lastInsertRowid,
      );
      for (const kind of [['temperature', 'C'], ['humidity', '%'], ['pressure', 'hPa']]) {
        const sensorId = Number(insertSensor.run(deviceId, kind[0], kind[1], 2).lastInsertRowid);
        sensorRows.push({ sensorId, deviceId });
      }
    }

    // 60,000 readings spread over the last 7 days (10,080 minutes).
    const insertReading = db.prepare(
      'INSERT INTO sensor_readings (sensor_id, device_id, recorded_at, value, quality_flag) VALUES (?, ?, ?, ?, ?)',
    );
    for (let r = 0; r < 60000; r += 1) {
      const sensor = pick(rng, sensorRows);
      insertReading.run(sensor.sensorId, sensor.deviceId, isoMinutesAgo(randInt(rng, 0, 10080)), Math.round(rng() * 10000) / 100, chance(rng, 0.97) ? 0 : 1);
    }

    const insertAlert = db.prepare(
      'INSERT INTO device_alerts (device_id, severity, message, raised_at, acknowledged_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (let a = 0; a < 300; a += 1) {
      insertAlert.run(
        randInt(rng, 1, 60),
        pick(rng, ['info', 'warning', 'critical']),
        `Threshold breach on ${pick(rng, WORDS)}`,
        isoMinutesAgo(randInt(rng, 0, 10080)),
        chance(rng, 0.6) ? isoMinutesAgo(randInt(rng, 0, 5000)) : null,
      );
    }
  });
  db.close();
  console.log('Seeded examples/iot.db');
}

/** Seed the mobile backend domain with sessions and an event stream. */
function seedMobile(): void {
  const db = createDatabase('mobile');
  const rng = makeRng(404);
  seedInTransaction(db, () => {
    const insertUser = db.prepare(
      'INSERT INTO app_users (username, email, country, plan, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    const insertDevice = db.prepare(
      'INSERT INTO user_devices (user_id, platform, os_version, push_token, registered_at) VALUES (?, ?, ?, ?, ?)',
    );
    const insertSession = db.prepare(
      'INSERT INTO sessions (user_id, device_id, started_at, ended_at, duration_sec) VALUES (?, ?, ?, ?, ?)',
    );
    const insertEvent = db.prepare(
      'INSERT INTO app_events (user_id, session_id, event_name, occurred_at, properties_json) VALUES (?, ?, ?, ?, ?)',
    );
    const insertPurchase = db.prepare(
      'INSERT INTO purchases (user_id, product_code, amount_cents, currency, purchased_at) VALUES (?, ?, ?, ?, ?)',
    );
    const insertPush = db.prepare(
      'INSERT INTO push_notifications (device_id, title, body, sent_at, opened_at) VALUES (?, ?, ?, ?, ?)',
    );

    const deviceIdsByUser: number[][] = [];
    for (let u = 1; u <= 800; u += 1) {
      insertUser.run(`user_${u}`, `user${u}@example.com`, pick(rng, ['US', 'GB', 'DE', 'BR', 'IN', 'JP']), pick(rng, ['free', 'free', 'free', 'pro', 'team']), isoMinutesAgo(randInt(rng, 0, 800000)));
      const deviceIds: number[] = [];
      for (let d = 0; d < randInt(rng, 1, 3); d += 1) {
        deviceIds.push(
          Number(
            insertDevice.run(u, pick(rng, ['ios', 'android']), `${randInt(rng, 14, 19)}.${randInt(rng, 0, 5)}`, chance(rng, 0.85) ? `tok_${u}_${d}_${randInt(rng, 1000, 9999)}` : null, isoMinutesAgo(randInt(rng, 0, 800000))).lastInsertRowid,
          ),
        );
      }
      deviceIdsByUser.push(deviceIds);
    }

    const eventNames = ['screen_view', 'tap', 'scroll', 'error', 'share', 'search'];
    let totalEvents = 0;
    for (let s = 0; s < 5000; s += 1) {
      const userId = randInt(rng, 1, 800);
      const deviceId = pick(rng, deviceIdsByUser[userId - 1]);
      const startedMinutesAgo = randInt(rng, 0, 100000);
      const durationSec = randInt(rng, 10, 3600);
      const sessionId = Number(
        insertSession.run(userId, deviceId, isoMinutesAgo(startedMinutesAgo), isoMinutesAgo(Math.max(startedMinutesAgo - Math.ceil(durationSec / 60), 0)), durationSec).lastInsertRowid,
      );
      // ~8 events per session on average; cap the total at 40k.
      for (let e = 0; e < randInt(rng, 2, 14) && totalEvents < 40000; e += 1) {
        insertEvent.run(userId, sessionId, pick(rng, eventNames), isoMinutesAgo(randInt(rng, Math.max(startedMinutesAgo - 60, 0), startedMinutesAgo)), JSON.stringify({ screen: pick(rng, WORDS) }));
        totalEvents += 1;
      }
    }

    for (let p = 0; p < 1200; p += 1) {
      insertPurchase.run(randInt(rng, 1, 800), `iap_${pick(rng, WORDS)}`, pick(rng, [99, 499, 999, 1999, 4999]), 'USD', isoMinutesAgo(randInt(rng, 0, 400000)));
    }
    for (let n = 0; n < 2000; n += 1) {
      const userDevices = deviceIdsByUser[randInt(rng, 1, 800) - 1];
      insertPush.run(pick(rng, userDevices), `Update from ${pick(rng, WORDS)}`, 'Tap to see what is new.', isoMinutesAgo(randInt(rng, 0, 200000)), chance(rng, 0.3) ? isoMinutesAgo(randInt(rng, 0, 100000)) : null);
    }
  });
  db.close();
  console.log('Seeded examples/mobile.db');
}

/** Seed the personalization domain with affinity scores and traits. */
function seedPersonalization(): void {
  const db = createDatabase('personalization');
  const rng = makeRng(505);
  seedInTransaction(db, () => {
    const insertProfile = db.prepare(
      'INSERT INTO profiles (external_user_id, email, locale, created_at) VALUES (?, ?, ?, ?)',
    );
    const insertTrait = db.prepare(
      'INSERT INTO profile_traits (profile_id, trait_key, trait_value, observed_at) VALUES (?, ?, ?, ?)',
    );
    const insertItem = db.prepare(
      'INSERT INTO items (external_item_id, title, item_type, metadata_json) VALUES (?, ?, ?, ?)',
    );
    const insertAffinity = db.prepare(
      'INSERT INTO affinities (profile_id, item_id, score, interaction_count, last_interaction_at) VALUES (?, ?, ?, ?, ?)',
    );
    const insertRecommendation = db.prepare(
      'INSERT INTO recommendations (profile_id, item_id, rank, reason, generated_at) VALUES (?, ?, ?, ?, ?)',
    );
    const insertSegment = db.prepare('INSERT INTO segments (name, rule_json) VALUES (?, ?)');
    const insertProfileSegment = db.prepare(
      'INSERT INTO profile_segments (profile_id, segment_id, entered_at) VALUES (?, ?, ?)',
    );

    const traitKeys = ['favorite_genre', 'price_sensitivity', 'device_pref', 'newsletter', 'churn_risk', 'avg_basket', 'preferred_time', 'theme', 'beta_user', 'language'];
    for (let p = 1; p <= 600; p += 1) {
      insertProfile.run(`ext-${100000 + p}`, chance(rng, 0.8) ? `profile${p}@example.com` : null, pick(rng, ['en-US', 'de-DE', 'pt-BR', 'ja-JP']), isoMinutesAgo(randInt(rng, 0, 800000)));
      for (let t = 0; t < randInt(rng, 0, 10); t += 1) {
        insertTrait.run(p, pick(rng, traitKeys), `${pick(rng, WORDS)}`, isoMinutesAgo(randInt(rng, 0, 400000)));
      }
    }

    for (let i = 1; i <= 300; i += 1) {
      insertItem.run(`item-${5000 + i}`, `Item ${thingName(rng)}`, pick(rng, ['article', 'video', 'product', 'playlist']), JSON.stringify({ tags: [pick(rng, WORDS), pick(rng, WORDS)] }));
    }

    for (let a = 0; a < 8000; a += 1) {
      insertAffinity.run(randInt(rng, 1, 600), randInt(rng, 1, 300), Math.round(rng() * 1000) / 1000, randInt(rng, 1, 500), isoMinutesAgo(randInt(rng, 0, 100000)));
    }

    for (let p = 1; p <= 600; p += 1) {
      for (let r = 1; r <= 10; r += 1) {
        insertRecommendation.run(p, randInt(rng, 1, 300), r, pick(rng, ['similar_users', 'trending', 'recent_view', 'editorial']), isoMinutesAgo(randInt(rng, 0, 1440)));
      }
    }

    for (let s = 1; s <= 12; s += 1) {
      insertSegment.run(`Segment ${pick(rng, WORDS)} ${s}`, JSON.stringify({ all: [{ trait: pick(rng, traitKeys), op: 'exists' }] }));
    }
    for (let p = 1; p <= 600; p += 1) {
      const segmentCount = randInt(rng, 0, 4);
      const usedSegments = new Set<number>();
      for (let s = 0; s < segmentCount; s += 1) {
        const segmentId = randInt(rng, 1, 12);
        if (usedSegments.has(segmentId)) continue;
        usedSegments.add(segmentId);
        insertProfileSegment.run(p, segmentId, isoMinutesAgo(randInt(rng, 0, 300000)));
      }
    }
  });
  db.close();
  console.log('Seeded examples/personalization.db');
}

/** Seed the real-time analytics domain with a 60k-row event firehose. */
function seedAnalytics(): void {
  const db = createDatabase('analytics');
  const rng = makeRng(606);
  seedInTransaction(db, () => {
    const insertSite = db.prepare(
      'INSERT INTO tracked_sites (domain, owner_email, created_at) VALUES (?, ?, ?)',
    );
    for (let s = 1; s <= 8; s += 1) insertSite.run(`site${s}.example.com`, `owner${s}@example.com`, isoMinutesAgo(randInt(rng, 400000, 900000)));

    const insertCampaign = db.prepare(
      'INSERT INTO campaigns (site_id, name, utm_code, started_at, ended_at) VALUES (?, ?, ?, ?, ?)',
    );
    for (let c = 1; c <= 20; c += 1) {
      insertCampaign.run(randInt(rng, 1, 8), `Campaign ${thingName(rng)}`, `utm-${c}`, isoMinutesAgo(randInt(rng, 100000, 400000)), chance(rng, 0.5) ? isoMinutesAgo(randInt(rng, 0, 100000)) : null);
    }

    const insertEvent = db.prepare(
      'INSERT INTO page_events (site_id, campaign_id, visitor_id, event_type, url_path, occurred_at, load_time_ms) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const paths = ['/', '/pricing', '/docs', '/blog', '/signup', '/checkout', '/about'];
    for (let e = 0; e < 60000; e += 1) {
      insertEvent.run(
        randInt(rng, 1, 8),
        chance(rng, 0.4) ? randInt(rng, 1, 20) : null,
        `v-${randInt(rng, 1, 9000)}`,
        pick(rng, ['view', 'view', 'view', 'click', 'conversion']),
        pick(rng, paths),
        isoMinutesAgo(randInt(rng, 0, 10080)),
        randInt(rng, 40, 4000),
      );
    }

    const insertFunnel = db.prepare('INSERT INTO funnels (site_id, name) VALUES (?, ?)');
    const insertStep = db.prepare(
      'INSERT INTO funnel_steps (funnel_id, step_number, match_url_path, label) VALUES (?, ?, ?, ?)',
    );
    for (let f = 1; f <= 10; f += 1) {
      const funnelId = Number(insertFunnel.run(randInt(rng, 1, 8), `Funnel ${thingName(rng)}`).lastInsertRowid);
      const funnelPaths = ['/', '/pricing', '/signup', '/checkout'];
      funnelPaths.forEach((path, index) => insertStep.run(funnelId, index + 1, path, `Step ${index + 1}`));
    }

    // One pre-aggregated rollup row per site per hour for the last 7 days.
    const insertRollup = db.prepare(
      'INSERT INTO hourly_rollups (site_id, hour_start, views, clicks, conversions, avg_load_time_ms) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (let s = 1; s <= 8; s += 1) {
      for (let h = 0; h < 168; h += 1) {
        insertRollup.run(s, isoMinutesAgo(h * 60), randInt(rng, 50, 4000), randInt(rng, 5, 600), randInt(rng, 0, 60), Math.round(rng() * 300000) / 100);
      }
    }
  });
  db.close();
  console.log('Seeded examples/analytics.db');
}

/** Seed the single-view domain with skewed order counts (mega accounts). */
function seedSingleView(): void {
  const db = createDatabase('singleview');
  const rng = makeRng(707);
  seedInTransaction(db, () => {
    const insertCustomer = db.prepare(
      'INSERT INTO crm_customers (email, first_name, last_name, phone, account_manager, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertWebAccount = db.prepare(
      'INSERT INTO web_accounts (crm_customer_id, username, last_login_at, marketing_opt_in) VALUES (?, ?, ?, ?)',
    );
    const insertOrder = db.prepare(
      'INSERT INTO orders (crm_customer_id, order_number, status, total_cents, currency, placed_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertOrderItem = db.prepare(
      'INSERT INTO order_items (order_id, sku, product_name, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?)',
    );
    const insertTicket = db.prepare(
      'INSERT INTO support_tickets (crm_customer_id, subject, status, priority, opened_at, closed_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertTouch = db.prepare(
      'INSERT INTO marketing_touches (crm_customer_id, channel, campaign_name, touched_at, converted) VALUES (?, ?, ?, ?, ?)',
    );
    const insertLoyalty = db.prepare(
      'INSERT INTO loyalty_accounts (crm_customer_id, tier, points_balance, enrolled_at) VALUES (?, ?, ?, ?)',
    );

    let orderNumber = 50000;
    for (let c = 1; c <= 500; c += 1) {
      insertCustomer.run(
        `customer${c}@example.com`,
        pick(rng, FIRST_NAMES),
        pick(rng, LAST_NAMES),
        chance(rng, 0.7) ? `+1-555-${randInt(rng, 1000, 9999)}` : null,
        chance(rng, 0.3) ? personName(rng) : null,
        isoMinutesAgo(randInt(rng, 100000, 900000)),
      );
      if (chance(rng, 0.85)) {
        insertWebAccount.run(c, `cust_${c}`, chance(rng, 0.9) ? isoMinutesAgo(randInt(rng, 0, 50000)) : null, chance(rng, 0.5) ? 1 : 0);
      }

      // Three mega accounts place 400-700 orders; everyone else 0-8.
      const orderCount = c <= 3 ? randInt(rng, 400, 700) : randInt(rng, 0, 8);
      for (let o = 0; o < orderCount; o += 1) {
        orderNumber += 1;
        const orderId = Number(
          insertOrder.run(c, `ORD-${orderNumber}`, pick(rng, ['delivered', 'delivered', 'shipped', 'returned', 'cancelled']), randInt(rng, 999, 250000), 'USD', isoMinutesAgo(randInt(rng, 0, 500000))).lastInsertRowid,
        );
        for (let i = 0; i < randInt(rng, 1, 5); i += 1) {
          insertOrderItem.run(orderId, `SKU-${randInt(rng, 10000, 10400)}`, `Product ${thingName(rng)}`, randInt(rng, 1, 4), randInt(rng, 499, 49999));
        }
      }

      for (let t = 0; t < randInt(rng, 0, 6); t += 1) {
        const closed = chance(rng, 0.7);
        insertTicket.run(c, `Issue with ${pick(rng, WORDS)}`, closed ? 'closed' : pick(rng, ['open', 'pending']), pick(rng, ['low', 'normal', 'high']), isoMinutesAgo(randInt(rng, 1000, 400000)), closed ? isoMinutesAgo(randInt(rng, 0, 1000)) : null);
      }
      for (let m = 0; m < randInt(rng, 0, 12); m += 1) {
        insertTouch.run(c, pick(rng, ['email', 'sms', 'display', 'social']), `Campaign ${pick(rng, WORDS)}`, isoMinutesAgo(randInt(rng, 0, 300000)), chance(rng, 0.15) ? 1 : 0);
      }
      if (chance(rng, 0.7)) {
        insertLoyalty.run(c, pick(rng, ['bronze', 'bronze', 'silver', 'gold', 'platinum']), randInt(rng, 0, 90000), isoMinutesAgo(randInt(rng, 50000, 800000)));
      }
    }
  });
  db.close();
  console.log('Seeded examples/singleview.db');
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

/** Build every example database in sequence. */
function main(): void {
  mkdirSync(EXAMPLES_DIR, { recursive: true });
  console.log('Seeding example databases (deterministic, ~250k rows total)...');
  seedCatalog();
  seedCms();
  seedIot();
  seedMobile();
  seedPersonalization();
  seedAnalytics();
  seedSingleView();
  console.log('Done. Databases are in examples/*.db');
}

main();
