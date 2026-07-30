-- clickhouse dialect example — schema-versioning pattern: versioned catalog entities stamped on every MongoDB collection.

CREATE TABLE brands (
  id Int64,
  name String NOT NULL,
  country String NOT NULL,
  website String

) ENGINE = MergeTree ORDER BY id;
CREATE TABLE categories (
  id Int64,
  name String NOT NULL,
  slug String NOT NULL

) ENGINE = MergeTree ORDER BY id;
CREATE TABLE suppliers (
  id Int64,
  name String NOT NULL,
  contact_email String NOT NULL

) ENGINE = MergeTree ORDER BY id;
CREATE TABLE products (
  id Int64,
  brand_id Int64 REFERENCES brands(id),
  category_id Int64 REFERENCES categories(id),
  supplier_id Int64 REFERENCES suppliers(id),
  sku String NOT NULL,
  name String NOT NULL,
  description String,
  base_price_cents Int64,
  currency CHAR(3) NOT NULL DEFAULT 'USD'

) ENGINE = MergeTree ORDER BY id;
CREATE TABLE product_variants (
  id Int64,
  product_id Int64 REFERENCES products(id),
  variant_sku String NOT NULL,
  barcode String,
  price_cents Int64

) ENGINE = MergeTree ORDER BY id;
CREATE TABLE product_images (
  id Int64,
  product_id Int64 REFERENCES products(id),
  url String NOT NULL,
  sort_order Int64 DEFAULT 0

) ENGINE = MergeTree ORDER BY id;
