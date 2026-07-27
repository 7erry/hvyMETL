-- snowflake dialect example — outlier pattern: skewed review counts on blockbuster products.

CREATE TABLE products (
  id NUMBER AUTOINCREMENT PRIMARY KEY,
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  review_count NUMBER NOT NULL DEFAULT 0
);
CREATE TABLE reviews (
  id NUMBER AUTOINCREMENT PRIMARY KEY,
  product_id NUMBER NOT NULL REFERENCES products(id),
  stars NUMBER NOT NULL,
  body VARIANT,
  created_at TIMESTAMP_NTZ NOT NULL
);
