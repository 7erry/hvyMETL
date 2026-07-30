/**
 * Renders dialect-specific DDL for bundled design-pattern examples.
 * Each pattern uses a minimal schema shape documented in examples/dialects/README.md.
 */

import { getDialectParserFamily } from '../dialects.js';
import type { PatternId } from '../types.js';

const PATTERN_DESCRIPTIONS: Record<PatternId, string> = {
  embed: 'bounded order line items embedded in parent orders (fulfillment-style schema)',
  reference: 'high-volume customer_events kept separate from CRM core tables',
  bucket: 'IoT sensor_readings time series with sites, devices, and operational metadata',
  'time-series': 'native MongoDB time series measurement tables (IoT sensor_readings shape)',
  outlier: 'catalog products with skewed review volume and supporting merchandising tables',
  'extended-reference': 'read-heavy product catalog with duplicated brand lookup fields',
  computed: 'ledger accounts with running balances and posting audit tables',
  subset: 'product catalog with recent reviews embedded and full review history elsewhere',
  attribute: 'EAV product_attributes on a normalized merchandising schema',
  polymorphic: 'CMS pages with block_type variants, assets, revisions, and tags',
  tree: 'self-referencing category hierarchy with products and brand assignments',
  archive: 'active orders plus orders_archive for Atlas Online Archive routing',
  'single-collection': 'articles and tags linked through article_tags for hub merge',
  'schema-versioning': 'versioned catalog entities stamped on every MongoDB collection',
  preallocation: 'analytics rollups and event streams for dashboard pre-allocation',
};



/** Human-readable first-line comment for a dialect example file. */
export function dialectExampleHeader(dialectId: string, pattern: PatternId): string {
  return `-- ${dialectId} dialect example — ${pattern} pattern: ${PATTERN_DESCRIPTIONS[pattern]}.`;
}

type FamilyRenderer = (pattern: PatternId, header: string) => string;

const SQLITE_RENDERER: FamilyRenderer = (pattern, header) => {
  const blocks: Record<Exclude<PatternId, 'time-series'>, string> = {
    embed: `
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  company_name VARCHAR(200),
  tier VARCHAR(20) NOT NULL DEFAULT 'standard',
  created_at DATETIME NOT NULL
);
CREATE TABLE customer_addresses (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  label VARCHAR(40) NOT NULL,
  line1 VARCHAR(200) NOT NULL,
  city VARCHAR(80) NOT NULL,
  region VARCHAR(80),
  postal_code VARCHAR(20) NOT NULL,
  country CHAR(2) NOT NULL
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  ship_to_address_id INTEGER NOT NULL REFERENCES customer_addresses(id),
  order_number VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  placed_at DATETIME NOT NULL,
  promised_ship_at DATETIME
);
CREATE TABLE order_lines (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  sku VARCHAR(40) NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE order_payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  method VARCHAR(30) NOT NULL,
  amount_cents INTEGER NOT NULL,
  captured_at DATETIME NOT NULL,
  processor_ref VARCHAR(80)
);
CREATE TABLE shipments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  carrier VARCHAR(40) NOT NULL,
  tracking_number VARCHAR(80),
  shipped_at DATETIME,
  delivered_at DATETIME
);
CREATE TABLE shipment_items (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id),
  order_line_id INTEGER NOT NULL REFERENCES order_lines(id),
  quantity INTEGER NOT NULL
);`,
    reference: `
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  country CHAR(2) NOT NULL,
  lifecycle_stage VARCHAR(30) NOT NULL DEFAULT 'prospect',
  created_at DATETIME NOT NULL
);
CREATE TABLE customer_profiles (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  industry VARCHAR(80),
  employee_count INTEGER,
  annual_revenue_usd INTEGER,
  updated_at DATETIME NOT NULL
);
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  plan_code VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  started_at DATETIME NOT NULL,
  renews_at DATETIME
);
CREATE TABLE payment_methods (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  method_type VARCHAR(20) NOT NULL,
  last_four VARCHAR(4),
  expires_on DATE,
  is_default BOOLEAN NOT NULL DEFAULT 0
);
CREATE TABLE customer_events (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  event_type VARCHAR(60) NOT NULL,
  event_at DATETIME NOT NULL,
  channel VARCHAR(30),
  payload TEXT
);
CREATE TABLE support_tickets (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  subject VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  opened_at DATETIME NOT NULL,
  closed_at DATETIME
);`,
    bucket: `
CREATE TABLE sites (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  timezone VARCHAR(60) NOT NULL,
  latitude REAL,
  longitude REAL
);
CREATE TABLE firmware_versions (
  id INTEGER PRIMARY KEY,
  version VARCHAR(40) NOT NULL,
  released_at DATETIME NOT NULL,
  changelog TEXT
);
CREATE TABLE devices (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id),
  firmware_id INTEGER NOT NULL REFERENCES firmware_versions(id),
  serial_number VARCHAR(64) NOT NULL,
  model VARCHAR(80) NOT NULL,
  installed_at DATETIME NOT NULL,
  is_online BOOLEAN NOT NULL DEFAULT 1
);
CREATE TABLE sensors (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  label VARCHAR(80) NOT NULL,
  kind VARCHAR(40) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  precision_digits INTEGER NOT NULL DEFAULT 2
);
CREATE TABLE sensor_readings (
  id INTEGER PRIMARY KEY,
  sensor_id INTEGER NOT NULL REFERENCES sensors(id),
  device_id INTEGER NOT NULL REFERENCES devices(id),
  recorded_at DATETIME NOT NULL,
  value REAL NOT NULL,
  quality_flag INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE device_alerts (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  severity VARCHAR(20) NOT NULL,
  message VARCHAR(500) NOT NULL,
  raised_at DATETIME NOT NULL,
  acknowledged_at DATETIME
);
CREATE TABLE maintenance_visits (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id),
  technician VARCHAR(120) NOT NULL,
  scheduled_at DATETIME NOT NULL,
  completed_at DATETIME,
  notes TEXT
);`,
    outlier: `
CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  base_price_cents INTEGER NOT NULL,
  review_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT 1
);
CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_sku VARCHAR(48) NOT NULL,
  color VARCHAR(40),
  size VARCHAR(20),
  price_cents INTEGER NOT NULL
);
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  reviewer_name VARCHAR(120) NOT NULL,
  stars INTEGER NOT NULL,
  title VARCHAR(200),
  body TEXT,
  created_at DATETIME NOT NULL
);
CREATE TABLE inventory_levels (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  warehouse_code VARCHAR(20) NOT NULL,
  quantity_on_hand INTEGER NOT NULL,
  updated_at DATETIME NOT NULL
);`,
    'extended-reference': `
CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL,
  website VARCHAR(255)
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
);
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  lead_time_days INTEGER NOT NULL DEFAULT 7
);
CREATE TABLE warehouses (
  id INTEGER PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  region VARCHAR(40) NOT NULL,
  address_line VARCHAR(200) NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  base_price_cents INTEGER NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD'
);
CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_sku VARCHAR(48) NOT NULL,
  barcode VARCHAR(32),
  price_cents INTEGER NOT NULL,
  weight_grams INTEGER
);
CREATE TABLE supplier_products (
  id INTEGER PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  supplier_sku VARCHAR(60) NOT NULL,
  cost_cents INTEGER NOT NULL
);
CREATE TABLE inventory_levels (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  quantity_on_hand INTEGER NOT NULL,
  updated_at DATETIME NOT NULL
);`,
    computed: `
CREATE TABLE legal_entities (
  id INTEGER PRIMARY KEY,
  legal_name VARCHAR(255) NOT NULL,
  tax_id VARCHAR(40) NOT NULL,
  country CHAR(2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1
);
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES legal_entities(id),
  account_number VARCHAR(40) NOT NULL,
  account_name VARCHAR(160) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  opened_at DATETIME NOT NULL
);
CREATE TABLE posting_batches (
  id INTEGER PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES legal_entities(id),
  batch_ref VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  submitted_at DATETIME NOT NULL,
  posted_at DATETIME
);
CREATE TABLE ledger_entries (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  batch_id INTEGER NOT NULL REFERENCES posting_batches(id),
  amount NUMERIC(14,2) NOT NULL,
  posting_type VARCHAR(10) NOT NULL,
  memo VARCHAR(255),
  posted_at DATETIME NOT NULL
);
CREATE TABLE account_daily_snapshots (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  snapshot_date DATE NOT NULL,
  opening_balance NUMERIC(14,2) NOT NULL,
  closing_balance NUMERIC(14,2) NOT NULL
);
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES legal_entities(id),
  actor VARCHAR(120) NOT NULL,
  action VARCHAR(60) NOT NULL,
  occurred_at DATETIME NOT NULL,
  details TEXT
);`,
    subset: `
CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  base_price_cents INTEGER NOT NULL
);
CREATE TABLE product_images (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  url VARCHAR(500) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  alt_text VARCHAR(255)
);
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  reviewer_name VARCHAR(120) NOT NULL,
  stars INTEGER NOT NULL,
  title VARCHAR(200),
  body TEXT,
  created_at DATETIME NOT NULL
);
CREATE TABLE review_votes (
  id INTEGER PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES reviews(id),
  voter_email VARCHAR(255) NOT NULL,
  vote_value INTEGER NOT NULL,
  voted_at DATETIME NOT NULL
);`,
    attribute: `
CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  base_price_cents INTEGER NOT NULL
);
CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_sku VARCHAR(48) NOT NULL,
  color VARCHAR(40),
  size VARCHAR(20),
  price_cents INTEGER NOT NULL
);
CREATE TABLE product_attributes (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  attr_key VARCHAR(60) NOT NULL,
  attr_value VARCHAR(255) NOT NULL
);
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  stars INTEGER NOT NULL,
  body TEXT,
  created_at DATETIME NOT NULL
);
CREATE TABLE inventory_levels (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  warehouse_code VARCHAR(20) NOT NULL,
  quantity_on_hand INTEGER NOT NULL
);`,
    polymorphic: `
CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'editor'
);
CREATE TABLE assets (
  id INTEGER PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  byte_size INTEGER NOT NULL,
  storage_url VARCHAR(500) NOT NULL,
  uploaded_at DATETIME NOT NULL
);
CREATE TABLE pages (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES authors(id),
  slug VARCHAR(200) NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  published_at DATETIME,
  created_at DATETIME NOT NULL
);
CREATE TABLE content_blocks (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  position INTEGER NOT NULL,
  block_type VARCHAR(40) NOT NULL,
  title_text VARCHAR(200),
  text_body TEXT,
  image_asset_id INTEGER REFERENCES assets(id),
  image_url VARCHAR(500),
  video_asset_id INTEGER REFERENCES assets(id),
  video_duration_sec INTEGER,
  embed_url VARCHAR(500)
);
CREATE TABLE page_revisions (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  author_id INTEGER NOT NULL REFERENCES authors(id),
  revision_number INTEGER NOT NULL,
  change_summary VARCHAR(500),
  snapshot_json TEXT NOT NULL,
  created_at DATETIME NOT NULL
);
CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  slug VARCHAR(80) NOT NULL
);
CREATE TABLE page_tags (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id)
);`,
    tree: `
CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER REFERENCES categories(id),
  brand_id INTEGER REFERENCES brands(id),
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE category_managers (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  manager_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  assigned_at DATETIME NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  base_price_cents INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1
);
CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_sku VARCHAR(48) NOT NULL,
  color VARCHAR(40),
  size VARCHAR(20),
  price_cents INTEGER NOT NULL
);`,
    archive: `
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  country CHAR(2) NOT NULL,
  created_at DATETIME NOT NULL
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  order_number VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  placed_at DATETIME NOT NULL,
  total_cents INTEGER NOT NULL
);
CREATE TABLE order_lines (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  sku VARCHAR(40) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
);
CREATE TABLE order_payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  method VARCHAR(30) NOT NULL,
  amount_cents INTEGER NOT NULL,
  captured_at DATETIME NOT NULL
);
CREATE TABLE shipments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  carrier VARCHAR(40) NOT NULL,
  shipped_at DATETIME,
  tracking_number VARCHAR(80)
);
CREATE TABLE orders_archive (
  id INTEGER PRIMARY KEY,
  order_number VARCHAR(40) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  placed_at DATETIME NOT NULL,
  total_cents INTEGER NOT NULL,
  archived_at DATETIME NOT NULL
);`,
    'single-collection': `
CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL
);
CREATE TABLE articles (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES authors(id),
  slug VARCHAR(140) NOT NULL,
  title VARCHAR(200) NOT NULL,
  summary VARCHAR(500),
  published_at DATETIME
);
CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(100) NOT NULL
);
CREATE TABLE article_tags (
  article_id INTEGER NOT NULL REFERENCES articles(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id),
  PRIMARY KEY (article_id, tag_id)
);
CREATE TABLE article_revisions (
  id INTEGER PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES articles(id),
  revision_number INTEGER NOT NULL,
  body_markdown TEXT NOT NULL,
  created_at DATETIME NOT NULL
);
CREATE TABLE media_assets (
  id INTEGER PRIMARY KEY,
  article_id INTEGER REFERENCES articles(id),
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  byte_size INTEGER NOT NULL,
  cdn_url VARCHAR(500) NOT NULL
);`,
    'schema-versioning': `
CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL,
  website VARCHAR(255)
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
);
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  contact_email VARCHAR(255) NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  base_price_cents INTEGER NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD'
);
CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_sku VARCHAR(48) NOT NULL,
  barcode VARCHAR(32),
  price_cents INTEGER NOT NULL
);
CREATE TABLE product_images (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  url VARCHAR(500) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);`,
    preallocation: `
CREATE TABLE tenants (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  plan VARCHAR(30) NOT NULL DEFAULT 'standard',
  created_at DATETIME NOT NULL
);
CREATE TABLE dashboards (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  title VARCHAR(160) NOT NULL,
  owner_email VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL
);
CREATE TABLE dashboard_widgets (
  id INTEGER PRIMARY KEY,
  dashboard_id INTEGER NOT NULL REFERENCES dashboards(id),
  widget_type VARCHAR(40) NOT NULL,
  metric_name VARCHAR(80) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE metric_definitions (
  id INTEGER PRIMARY KEY,
  metric_name VARCHAR(80) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  description VARCHAR(255)
);
CREATE TABLE hourly_rollups (
  id INTEGER PRIMARY KEY,
  metric_name VARCHAR(80) NOT NULL,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  hour_start DATETIME NOT NULL,
  value NUMERIC(14,4) NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE page_events (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  session_id VARCHAR(64) NOT NULL,
  page_path VARCHAR(500) NOT NULL,
  occurred_at DATETIME NOT NULL,
  properties_json TEXT
);`,
  };
  const body =
    pattern === 'time-series' ? blocks.bucket : (blocks[pattern as Exclude<PatternId, 'time-series'>] ?? blocks['schema-versioning']);
  return `${header}\n${body}\n`;
};

function postgresRenderer(pattern: PatternId, header: string): string {
  const body = SQLITE_RENDERER(pattern, '').trim();
  const adapted = body
    .replace(/\bINTEGER PRIMARY KEY\b/g, 'SERIAL PRIMARY KEY')
    .replace(/\bDATETIME\b/g, 'TIMESTAMPTZ')
    .replace(/\bREAL\b/g, 'DOUBLE PRECISION');
  return `${header}\n\n${adapted}\n`;
}

function mysqlRenderer(pattern: PatternId, header: string): string {
  const body = SQLITE_RENDERER(pattern, '').trim();
  const adapted = body
    .replace(/\bINTEGER PRIMARY KEY\b/g, 'INT AUTO_INCREMENT PRIMARY KEY')
    .replace(/\bINTEGER NOT NULL\b/g, 'INT NOT NULL')
    .replace(/\bINTEGER\b/g, 'INT');
  return `${header}\n\n${adapted}\n`;
}

function mssqlRenderer(pattern: PatternId, header: string): string {
  const body = SQLITE_RENDERER(pattern, '').trim();
  const adapted = body
    .replace(/\bINTEGER PRIMARY KEY\b/g, 'INT IDENTITY(1,1) PRIMARY KEY')
    .replace(/\bINTEGER NOT NULL\b/g, 'INT NOT NULL')
    .replace(/\bINTEGER\b/g, 'INT')
    .replace(/\bDATETIME\b/g, 'DATETIME2')
    .replace(/\bTEXT\b/g, 'NVARCHAR(MAX)')
    .replace(/\bVARCHAR\(/g, 'NVARCHAR(');
  return `${header}\n\n${adapted}\n`;
}

function oracleRenderer(pattern: PatternId, header: string): string {
  const body = SQLITE_RENDERER(pattern, '').trim();
  const adapted = body
    .replace(/\bINTEGER PRIMARY KEY\b/g, 'NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY')
    .replace(/\bINTEGER NOT NULL\b/g, 'NUMBER NOT NULL')
    .replace(/\bINTEGER\b/g, 'NUMBER')
    .replace(/\bDATETIME\b/g, 'TIMESTAMP')
    .replace(/\bTEXT\b/g, 'CLOB')
    .replace(/\bVARCHAR\(/g, 'VARCHAR2(')
    .replace(/\bREAL\b/g, 'NUMBER(10,4)')
    .replace(/\bNUMERIC\(/g, 'NUMBER(');
  return `${header}\n\n${adapted}\n`;
}

function db2Renderer(pattern: PatternId, header: string): string {
  const body = SQLITE_RENDERER(pattern, '').trim();
  const adapted = body
    .replace(/\bINTEGER PRIMARY KEY\b/g, 'INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY')
    .replace(/\bDATETIME\b/g, 'TIMESTAMP')
    .replace(/\bTEXT\b/g, 'CLOB');
  return `${header}\n\n${adapted}\n`;
}

function snowflakeRenderer(pattern: PatternId, header: string): string {
  const body = SQLITE_RENDERER(pattern, '').trim();
  const adapted = body
    .replace(/\bINTEGER PRIMARY KEY\b/g, 'NUMBER AUTOINCREMENT PRIMARY KEY')
    .replace(/\bINTEGER NOT NULL\b/g, 'NUMBER NOT NULL')
    .replace(/\bINTEGER\b/g, 'NUMBER')
    .replace(/\bDATETIME\b/g, 'TIMESTAMP_NTZ')
    .replace(/\bTEXT\b/g, 'VARIANT');
  return `${header}\n\n${adapted}\n`;
}

function bigqueryRenderer(pattern: PatternId, header: string): string {
  const body = SQLITE_RENDERER(pattern, '').trim();
  const lines = body.split('\n');
  const output: string[] = [];
  for (const line of lines) {
    if (line.startsWith('CREATE TABLE ')) {
      const match = line.match(/CREATE TABLE (\w+)/);
      if (match) {
        output.push(`CREATE TABLE \`demo.${match[1]}\` (`);
        continue;
      }
    }
    let next = line
      .replace(/\bINTEGER PRIMARY KEY,\n?/g, '')
      .replace(/\bINTEGER NOT NULL\b/g, 'INT64 NOT NULL')
      .replace(/\bINTEGER\b/g, 'INT64')
      .replace(/\bVARCHAR\(/g, 'STRING(')
      .replace(/\bTEXT\b/g, 'STRING')
      .replace(/\bDATETIME\b/g, 'TIMESTAMP')
      .replace(/\bREAL\b/g, 'FLOAT64');
    if (line.trim() === ');') {
      output.push(') PRIMARY KEY (id);');
      continue;
    }
    output.push(next);
  }
  return `${header}\n\n${output.join('\n')}\n`;
}

function spannerRenderer(pattern: PatternId, header: string): string {
  const body = SQLITE_RENDERER(pattern, '').trim();
  const adapted = body
    .replace(/CREATE TABLE (\w+) \([\s\S]*?\);/g, (block, tableName) => {
      const inner = block
        .replace(/CREATE TABLE \w+ \(/, '')
        .replace(/\);$/, '')
        .replace(/\bid INTEGER PRIMARY KEY,\n?/g, '')
        .replace(/\bPRIMARY KEY \([^)]+\),?\n?/g, '')
        .replace(/\bINTEGER NOT NULL\b/g, 'INT64 NOT NULL')
        .replace(/\bINTEGER\b/g, 'INT64')
        .replace(/\bBOOLEAN\b/g, 'BOOL')
        .replace(/\bDATE\b/g, 'DATE')
        .replace(/\bVARCHAR\(/g, 'STRING(')
        .replace(/\bTEXT\b/g, 'STRING(MAX)')
        .replace(/\bDATETIME\b/g, 'TIMESTAMP')
        .replace(/\bREAL\b/g, 'FLOAT64')
        .replace(/\bNUMERIC\([^)]+\)/g, 'NUMERIC');
      return `CREATE TABLE ${tableName} (\n  id INT64 NOT NULL,\n${inner}\n) PRIMARY KEY (id);`;
    });
  return `${header}\n\n${adapted}\n`;
}

function databricksRenderer(pattern: PatternId, header: string): string {
  const body = SQLITE_RENDERER(pattern, '').trim();
  const adapted = body
    .replace(/\bINTEGER PRIMARY KEY\b/g, 'BIGINT NOT NULL')
    .replace(/\bINTEGER NOT NULL\b/g, 'BIGINT NOT NULL')
    .replace(/\bINTEGER\b/g, 'BIGINT')
    .replace(/\bVARCHAR\([^)]+\)/g, 'STRING')
    .replace(/\bTEXT\b/g, 'STRING')
    .replace(/\bDATETIME\b/g, 'TIMESTAMP')
    .replace(/;\n/g, ',\n  CONSTRAINT pk PRIMARY KEY (id)\n) USING DELTA;\n');
  return `${header}\n\n${adapted}\n`;
}

function teradataRenderer(pattern: PatternId, header: string): string {
  const body = SQLITE_RENDERER(pattern, '').trim();
  const adapted = body
    .replace(/CREATE TABLE/g, 'CREATE MULTISET TABLE')
    .replace(/\bINTEGER PRIMARY KEY\b/g, 'INTEGER NOT NULL')
    .replace(/;\n/g, ',\n  PRIMARY KEY (id)\n);\n');
  return `${header}\n\n${adapted}\n`;
}

function firebirdRenderer(pattern: PatternId, header: string): string {
  return SQLITE_RENDERER(pattern, header);
}

function hanaRenderer(pattern: PatternId, header: string): string {
  const body = SQLITE_RENDERER(pattern, '').trim();
  const adapted = body
    .replace(/\bINTEGER PRIMARY KEY\b/g, 'INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY')
    .replace(/\bVARCHAR\(/g, 'NVARCHAR(')
    .replace(/\bTEXT\b/g, 'NCLOB')
    .replace(/\bDATETIME\b/g, 'TIMESTAMP');
  return `${header}\n\n${adapted}\n`;
}

function sybaseRenderer(pattern: PatternId, header: string): string {
  const body = SQLITE_RENDERER(pattern, '').trim();
  const adapted = body
    .replace(/CREATE TABLE (\w+)/g, 'CREATE TABLE dbo.$1')
    .replace(/\bINTEGER PRIMARY KEY\b/g, 'INT IDENTITY NOT NULL,\n  PRIMARY KEY (id)')
    .replace(/\bINTEGER NOT NULL\b/g, 'INT NOT NULL')
    .replace(/\bINTEGER\b/g, 'INT')
    .replace(/\bDATETIME\b/g, 'DATETIME')
    .replace(/\bTEXT\b/g, 'TEXT');
  return `${header}\n\n${adapted}\n`;
}

function clickhouseRenderer(pattern: PatternId, header: string): string {
  const body = SQLITE_RENDERER(pattern, '').trim();
  const adapted = body
    .replace(/\bid INTEGER PRIMARY KEY,?\n/g, 'id Int64,\n')
    .replace(/\bINTEGER NOT NULL\b/g, 'Int64')
    .replace(/\bINTEGER\b/g, 'Int64')
    .replace(/\bVARCHAR\([^)]+\)/g, 'String')
    .replace(/\bTEXT\b/g, 'String')
    .replace(/\bDATETIME\b/g, 'DateTime')
    .replace(/\bREAL\b/g, 'Float64')
    .replace(/\bNUMERIC\([^)]+\)/g, 'Float64')
    .replace(/\);/g, '\n) ENGINE = MergeTree ORDER BY id;');
  return `${header}\n\n${adapted}\n`;
}

const FAMILY_RENDERERS: Record<string, FamilyRenderer> = {
  sqlite: SQLITE_RENDERER,
  postgresql: postgresRenderer,
  mysql: mysqlRenderer,
  mssql: mssqlRenderer,
  sybase: sybaseRenderer,
  clickhouse: clickhouseRenderer,
  oracle: oracleRenderer,
  db2: db2Renderer,
  snowflake: snowflakeRenderer,
  bigquery: bigqueryRenderer,
  spanner: spannerRenderer,
  spark: databricksRenderer,
  hana: hanaRenderer,
  teradata: teradataRenderer,
  firebird: firebirdRenderer,
};

/** Render SQL DDL for a dialect id and assigned design pattern. */
export function renderDialectExampleDdl(dialectId: string, pattern: PatternId): string {
  const header = dialectExampleHeader(dialectId, pattern);
  const family = getDialectParserFamily(dialectId) ?? 'postgresql';
  const renderer = FAMILY_RENDERERS[family] ?? postgresRenderer;
  return renderer(pattern, header);
}

/** CloudFormation template illustrating a design pattern for DynamoDB. */
export function renderDynamoDbExample(pattern: PatternId, header: string): string {
  const yamlHeader = header.replace(/^-- /, '# ');
  if (pattern === 'single-collection') {
    return `${yamlHeader}
AWSTemplateFormatVersion: '2010-09-09'
Description: 'Single-table DynamoDB design — articles, tags, and article_tags in one hub table (single-collection pattern).'

Resources:
  ContentHubTable:
    Type: 'AWS::DynamoDB::Table'
    Properties:
      TableName: 'ContentHub'
      BillingMode: 'PAY_PER_REQUEST'
      AttributeDefinitions:
        - AttributeName: 'PK'
          AttributeType: 'S'
        - AttributeName: 'SK'
          AttributeType: 'S'
        - AttributeName: 'GSI1PK'
          AttributeType: 'S'
        - AttributeName: 'GSI1SK'
          AttributeType: 'S'
      KeySchema:
        - AttributeName: 'PK'
          KeyType: 'HASH'
        - AttributeName: 'SK'
          KeyType: 'RANGE'
      GlobalSecondaryIndexes:
        - IndexName: 'TagArticles'
          KeySchema:
            - AttributeName: 'GSI1PK'
              KeyType: 'HASH'
            - AttributeName: 'GSI1SK'
              KeyType: 'RANGE'
          Projection:
            ProjectionType: 'ALL'
`;
  }

  const tableSets: Partial<Record<PatternId, Array<{ name: string; hash: string; range?: string }>>> = {
    subset: [
      { name: 'Brands', hash: 'BrandId' },
      { name: 'Categories', hash: 'CategoryId' },
      { name: 'Products', hash: 'ProductId' },
      { name: 'ProductImages', hash: 'ImageId', range: 'ProductId' },
      { name: 'Reviews', hash: 'ReviewId', range: 'ProductId' },
      { name: 'ReviewVotes', hash: 'VoteId', range: 'ReviewId' },
    ],
    embed: [
      { name: 'Customers', hash: 'CustomerId' },
      { name: 'CustomerAddresses', hash: 'AddressId', range: 'CustomerId' },
      { name: 'Orders', hash: 'CustomerId', range: 'OrderId' },
      { name: 'OrderLines', hash: 'OrderId', range: 'LineId' },
      { name: 'OrderPayments', hash: 'OrderId', range: 'PaymentId' },
      { name: 'Shipments', hash: 'OrderId', range: 'ShipmentId' },
    ],
    reference: [
      { name: 'Customers', hash: 'CustomerId' },
      { name: 'CustomerProfiles', hash: 'CustomerId', range: 'ProfileId' },
      { name: 'Subscriptions', hash: 'CustomerId', range: 'SubscriptionId' },
      { name: 'PaymentMethods', hash: 'CustomerId', range: 'PaymentMethodId' },
      { name: 'CustomerEvents', hash: 'CustomerId', range: 'EventId' },
      { name: 'SupportTickets', hash: 'CustomerId', range: 'TicketId' },
    ],
    bucket: [
      { name: 'Sites', hash: 'SiteId' },
      { name: 'Devices', hash: 'SiteId', range: 'DeviceId' },
      { name: 'Sensors', hash: 'DeviceId', range: 'SensorId' },
      { name: 'SensorReadings', hash: 'SensorId', range: 'RecordedAt' },
      { name: 'DeviceAlerts', hash: 'DeviceId', range: 'AlertId' },
      { name: 'MaintenanceVisits', hash: 'SiteId', range: 'VisitId' },
    ],
  };

  const tables = tableSets[pattern] ?? (pattern === 'time-series' ? tableSets.bucket : undefined) ?? tableSets.subset!;
  const resources = tables
    .map((table, index) => {
      const attrs = [
        `        - AttributeName: '${table.hash}'`,
        `          AttributeType: 'S'`,
      ];
      const keys = [`        - AttributeName: '${table.hash}'`, `          KeyType: 'HASH'`];
      if (table.range) {
        attrs.push(`        - AttributeName: '${table.range}'`, `          AttributeType: 'S'`);
        keys.push(`        - AttributeName: '${table.range}'`, `          KeyType: 'RANGE'`);
      }
      return `  Table${index + 1}:
    Type: 'AWS::DynamoDB::Table'
    Properties:
      TableName: '${table.name}'
      BillingMode: 'PAY_PER_REQUEST'
      AttributeDefinitions:
${attrs.join('\n')}
      KeySchema:
${keys.join('\n')}`;
    })
    .join('\n');

  return `${yamlHeader}
AWSTemplateFormatVersion: '2010-09-09'
Description: 'DynamoDB tables demonstrating the ${pattern} migration pattern.'

Resources:
${resources}
`;
}

/** @deprecated Use renderDynamoDbExample */
export function renderDynamoDbSingleCollectionExample(header: string): string {
  return renderDynamoDbExample('single-collection', header);
}

/** Render example file contents (SQL or CloudFormation YAML). */
export function renderDialectExampleFile(dialectId: string, pattern: PatternId): string {
  if (dialectId === 'dynamodb') {
    return renderDynamoDbExample(pattern, dialectExampleHeader(dialectId, pattern));
  }
  return renderDialectExampleDdl(dialectId, pattern);
}

/** Table names that must exist for a pattern (used by tests). */
export const PATTERN_SIGNATURE_TABLES: Record<PatternId, string[]> = {
  embed: ['orders', 'order_lines'],
  reference: ['customers', 'customer_events'],
  bucket: ['sensors', 'sensor_readings'],
  'time-series': ['sensors', 'sensor_readings'],
  outlier: ['products', 'reviews'],
  'extended-reference': ['brands', 'products'],
  computed: ['accounts', 'ledger_entries'],
  subset: ['products', 'reviews'],
  attribute: ['products', 'product_attributes'],
  polymorphic: ['pages', 'assets', 'content_blocks'],
  tree: ['categories'],
  archive: ['orders', 'orders_archive'],
  'single-collection': ['articles', 'tags', 'article_tags'],
  'schema-versioning': ['brands', 'products'],
  preallocation: ['hourly_rollups'],
};
