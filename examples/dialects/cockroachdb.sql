-- cockroachdb dialect example — tree pattern: self-referencing category hierarchy with products and brand assignments.

CREATE TABLE brands (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL
);
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER REFERENCES categories(id),
  brand_id INTEGER REFERENCES brands(id),
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE category_managers (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  manager_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  base_price_cents INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1
);
CREATE TABLE product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_sku VARCHAR(48) NOT NULL,
  color VARCHAR(40),
  size VARCHAR(20),
  price_cents INTEGER NOT NULL
);
