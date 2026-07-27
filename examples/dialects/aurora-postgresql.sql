-- aurora-postgresql dialect example — extended-reference pattern: brand lookup fields duplicated on products for read-heavy paths.

CREATE TABLE brands (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL
);
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL
);
