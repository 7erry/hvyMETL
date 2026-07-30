-- spanner dialect example — attribute pattern: EAV product_attributes on a normalized merchandising schema.

CREATE TABLE brands (
  id INT64 NOT NULL,

    name STRING(120) NOT NULL,
  country STRING(60) NOT NULL

) PRIMARY KEY (id);
CREATE TABLE categories (
  id INT64 NOT NULL,

    name STRING(120) NOT NULL,
  slug STRING(140) NOT NULL

) PRIMARY KEY (id);
CREATE TABLE products (
  id INT64 NOT NULL,

    brand_id INT64 NOT NULL REFERENCES brands(id),
  category_id INT64 NOT NULL REFERENCES categories(id),
  sku STRING(40) NOT NULL,
  name STRING(200) NOT NULL,
  description STRING(MAX),
  base_price_cents INT64 NOT NULL

) PRIMARY KEY (id);
CREATE TABLE product_variants (
  id INT64 NOT NULL,

    product_id INT64 NOT NULL REFERENCES products(id),
  variant_sku STRING(48) NOT NULL,
  color STRING(40),
  size STRING(20),
  price_cents INT64 NOT NULL

) PRIMARY KEY (id);
CREATE TABLE product_attributes (
  id INT64 NOT NULL,

    product_id INT64 NOT NULL REFERENCES products(id),
  attr_key STRING(60) NOT NULL,
  attr_value STRING(255) NOT NULL

) PRIMARY KEY (id);
CREATE TABLE reviews (
  id INT64 NOT NULL,

    product_id INT64 NOT NULL REFERENCES products(id),
  stars INT64 NOT NULL,
  body STRING(MAX),
  created_at TIMESTAMP NOT NULL

) PRIMARY KEY (id);
CREATE TABLE inventory_levels (
  id INT64 NOT NULL,

    variant_id INT64 NOT NULL REFERENCES product_variants(id),
  warehouse_code STRING(20) NOT NULL,
  quantity_on_hand INT64 NOT NULL

) PRIMARY KEY (id);
