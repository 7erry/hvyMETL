-- sqlite dialect example — subset pattern: recent reviews embedded on products with overflow collection.

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
);
