-- postgresql dialect example — outlier pattern: skewed review counts on blockbuster products.

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  review_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  stars INTEGER NOT NULL,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
