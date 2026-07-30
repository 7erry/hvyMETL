-- snowflake dialect example — outlier pattern: catalog products with skewed review volume and supporting merchandising tables.

CREATE TABLE brands (
  id NUMBER AUTOINCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL
);
CREATE TABLE categories (
  id NUMBER AUTOINCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
);
CREATE TABLE products (
  id NUMBER AUTOINCREMENT PRIMARY KEY,
  brand_id NUMBER NOT NULL REFERENCES brands(id),
  category_id NUMBER NOT NULL REFERENCES categories(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  base_price_cents NUMBER NOT NULL,
  review_count NUMBER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT 1
);
CREATE TABLE product_variants (
  id NUMBER AUTOINCREMENT PRIMARY KEY,
  product_id NUMBER NOT NULL REFERENCES products(id),
  variant_sku VARCHAR(48) NOT NULL,
  color VARCHAR(40),
  size VARCHAR(20),
  price_cents NUMBER NOT NULL
);
CREATE TABLE reviews (
  id NUMBER AUTOINCREMENT PRIMARY KEY,
  product_id NUMBER NOT NULL REFERENCES products(id),
  reviewer_name VARCHAR(120) NOT NULL,
  stars NUMBER NOT NULL,
  title VARCHAR(200),
  body VARIANT,
  created_at TIMESTAMP_NTZ NOT NULL
);
CREATE TABLE inventory_levels (
  id NUMBER AUTOINCREMENT PRIMARY KEY,
  variant_id NUMBER NOT NULL REFERENCES product_variants(id),
  warehouse_code VARCHAR(20) NOT NULL,
  quantity_on_hand NUMBER NOT NULL,
  updated_at TIMESTAMP_NTZ NOT NULL
);
