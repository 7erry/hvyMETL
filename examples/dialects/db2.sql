-- db2 dialect example — extended-reference pattern: read-heavy product catalog with duplicated brand lookup fields.

CREATE TABLE brands (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL,
  website VARCHAR(255)
);
CREATE TABLE categories (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
);
CREATE TABLE suppliers (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  lead_time_days INTEGER NOT NULL DEFAULT 7
);
CREATE TABLE warehouses (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  region VARCHAR(40) NOT NULL,
  address_line VARCHAR(200) NOT NULL
);
CREATE TABLE products (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description CLOB,
  base_price_cents INTEGER NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD'
);
CREATE TABLE product_variants (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_sku VARCHAR(48) NOT NULL,
  barcode VARCHAR(32),
  price_cents INTEGER NOT NULL,
  weight_grams INTEGER
);
CREATE TABLE supplier_products (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  supplier_sku VARCHAR(60) NOT NULL,
  cost_cents INTEGER NOT NULL
);
CREATE TABLE inventory_levels (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  quantity_on_hand INTEGER NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
