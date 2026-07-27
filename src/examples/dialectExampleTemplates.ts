/**
 * Renders dialect-specific DDL for bundled design-pattern examples.
 * Each pattern uses a minimal schema shape documented in examples/dialects/README.md.
 */

import { getDialectParserFamily } from '../dialects.js';
import type { PatternId } from '../types.js';

const PATTERN_DESCRIPTIONS: Record<PatternId, string> = {
  embed: 'bounded order line items embedded in parent order documents',
  reference: 'unbounded customer_events kept in a separate collection',
  bucket: 'time-series sensor_readings grouped into time-window buckets',
  outlier: 'skewed review counts on blockbuster products',
  'extended-reference': 'brand lookup fields duplicated on products for read-heavy paths',
  computed: 'account balances and counters maintained at write time',
  subset: 'recent reviews embedded on products with overflow collection',
  attribute: 'EAV product_attributes collapsed into a key/value array',
  polymorphic: 'content_blocks with block_type discriminator and sparse variant columns',
  tree: 'self-referencing category hierarchy via parent_id',
  archive: 'hot orders vs cold orders_archive for Atlas Online Archive',
  'single-collection': 'article_tags junction merged into a single hub collection',
  'schema-versioning': 'schemaVersion stamp applied to every planned collection',
  preallocation: 'pre-allocated dashboard slots for write-heavy analytics',
};

/** Human-readable first-line comment for a dialect example file. */
export function dialectExampleHeader(dialectId: string, pattern: PatternId): string {
  return `-- ${dialectId} dialect example — ${pattern} pattern: ${PATTERN_DESCRIPTIONS[pattern]}.`;
}

type FamilyRenderer = (pattern: PatternId, header: string) => string;

const SQLITE_RENDERER: FamilyRenderer = (pattern, header) => {
  const blocks: Record<PatternId, string> = {
    embed: `
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  order_number VARCHAR(40) NOT NULL,
  placed_at DATETIME NOT NULL
);
CREATE TABLE order_lines (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  sku VARCHAR(40) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
);`,
    reference: `
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL
);
CREATE TABLE customer_events (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  event_type VARCHAR(60) NOT NULL,
  event_at DATETIME NOT NULL,
  payload TEXT
);`,
    bucket: `
CREATE TABLE sensors (
  id INTEGER PRIMARY KEY,
  label VARCHAR(80) NOT NULL
);
CREATE TABLE sensor_readings (
  id INTEGER PRIMARY KEY,
  sensor_id INTEGER NOT NULL REFERENCES sensors(id),
  recorded_at DATETIME NOT NULL,
  value REAL NOT NULL
);`,
    outlier: `
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  review_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  stars INTEGER NOT NULL,
  body TEXT,
  created_at DATETIME NOT NULL
);`,
    'extended-reference': `
CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL
);`,
    computed: `
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  account_number VARCHAR(40) NOT NULL,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE ledger_entries (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount NUMERIC(14,2) NOT NULL,
  posted_at DATETIME NOT NULL
);`,
    subset: `
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL
);
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  stars INTEGER NOT NULL,
  title VARCHAR(200),
  created_at DATETIME NOT NULL
);`,
    attribute: `
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL
);
CREATE TABLE product_attributes (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  attr_key VARCHAR(60) NOT NULL,
  attr_value VARCHAR(255) NOT NULL
);`,
    polymorphic: `
CREATE TABLE pages (
  id INTEGER PRIMARY KEY,
  slug VARCHAR(140) NOT NULL,
  title VARCHAR(200) NOT NULL
);
CREATE TABLE assets (
  id INTEGER PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL
);
CREATE TABLE content_blocks (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  asset_id INTEGER REFERENCES assets(id),
  block_type VARCHAR(40) NOT NULL,
  title_text VARCHAR(200),
  image_url VARCHAR(500),
  body_html TEXT
);`,
    tree: `
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER REFERENCES categories(id),
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
);`,
    archive: `
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  order_number VARCHAR(40) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  placed_at DATETIME NOT NULL,
  total_cents INTEGER NOT NULL
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
CREATE TABLE articles (
  id INTEGER PRIMARY KEY,
  slug VARCHAR(140) NOT NULL,
  title VARCHAR(200) NOT NULL
);
CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name VARCHAR(80) NOT NULL
);
CREATE TABLE article_tags (
  article_id INTEGER NOT NULL REFERENCES articles(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id),
  PRIMARY KEY (article_id, tag_id)
);`,
    'schema-versioning': `
CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL
);`,
    preallocation: `
CREATE TABLE hourly_rollups (
  id INTEGER PRIMARY KEY,
  metric_name VARCHAR(80) NOT NULL,
  hour_start DATETIME NOT NULL,
  value NUMERIC(14,4) NOT NULL DEFAULT 0
);`,
  };
  return `${header}\n${blocks[pattern] ?? blocks['schema-versioning']}\n`;
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
  if (pattern === 'tree') {
    return `${header}

CREATE TABLE Categories (
  CategoryId INT64 NOT NULL,
  ParentCategoryId INT64,
  Name STRING(120) NOT NULL
) PRIMARY KEY (CategoryId);
`;
  }
  const body = SQLITE_RENDERER(pattern, '').trim();
  const adapted = body
    .replace(/CREATE TABLE (\w+) \([\s\S]*?\);/g, (block, tableName) => {
      const inner = block
        .replace(/CREATE TABLE \w+ \(/, '')
        .replace(/\);$/, '')
        .replace(/\bid INTEGER PRIMARY KEY,\n?/g, '')
        .replace(/\bINTEGER NOT NULL\b/g, 'INT64 NOT NULL')
        .replace(/\bINTEGER\b/g, 'INT64')
        .replace(/\bVARCHAR\(/g, 'STRING(')
        .replace(/\bTEXT\b/g, 'STRING(MAX)')
        .replace(/\bDATETIME\b/g, 'TIMESTAMP')
        .replace(/\bREAL\b/g, 'FLOAT64');
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
      { name: 'Products', hash: 'ProductId' },
      { name: 'Reviews', hash: 'ReviewId', range: 'ProductId' },
    ],
    embed: [
      { name: 'Orders', hash: 'CustomerId', range: 'OrderId' },
      { name: 'OrderLines', hash: 'OrderId', range: 'LineId' },
    ],
    reference: [
      { name: 'Customers', hash: 'CustomerId' },
      { name: 'CustomerEvents', hash: 'CustomerId', range: 'EventId' },
    ],
    bucket: [
      { name: 'Sensors', hash: 'SensorId' },
      { name: 'SensorReadings', hash: 'SensorId', range: 'RecordedAt' },
    ],
  };

  const tables = tableSets[pattern] ?? tableSets.subset!;
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
