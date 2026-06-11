-- E-commerce Catalog: classic normalized product schema.
-- Demonstrates: Extended Reference (brand lookups), Subset/Outlier (skewed
-- review counts), Attribute (EAV table), Computed (rating aggregates),
-- Tree (self-referencing categories).

CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL,
  website VARCHAR(255)
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER REFERENCES categories(id),
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
  base_price_cents INTEGER NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL
);

CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_sku VARCHAR(48) NOT NULL,
  color VARCHAR(40),
  size VARCHAR(20),
  price_cents INTEGER NOT NULL,
  weight_grams INTEGER
);

-- Entity-Attribute-Value table: sparse per-product characteristics.
CREATE TABLE product_attributes (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  attr_key VARCHAR(60) NOT NULL,
  attr_value VARCHAR(255) NOT NULL
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
);
