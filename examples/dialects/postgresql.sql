-- postgresql dialect example — attribute pattern: EAV product_attributes on a normalized merchandising schema.

CREATE TABLE brands (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL
);
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
);
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  base_price_cents INTEGER NOT NULL
);
CREATE TABLE product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_sku VARCHAR(48) NOT NULL,
  color VARCHAR(40),
  size VARCHAR(20),
  price_cents INTEGER NOT NULL
);
CREATE TABLE product_attributes (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  attr_key VARCHAR(60) NOT NULL,
  attr_value VARCHAR(255) NOT NULL
);
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  stars INTEGER NOT NULL,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE inventory_levels (
  id SERIAL PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  warehouse_code VARCHAR(20) NOT NULL,
  quantity_on_hand INTEGER NOT NULL
);
