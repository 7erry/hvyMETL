-- aurora-mysql dialect example — schema-versioning pattern: versioned catalog entities stamped on every MongoDB collection.

CREATE TABLE brands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL,
  website VARCHAR(255)
);
CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
);
CREATE TABLE suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  contact_email VARCHAR(255) NOT NULL
);
CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_id INT NOT NULL REFERENCES brands(id),
  category_id INT NOT NULL REFERENCES categories(id),
  supplier_id INT REFERENCES suppliers(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  base_price_cents INT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD'
);
CREATE TABLE product_variants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  variant_sku VARCHAR(48) NOT NULL,
  barcode VARCHAR(32),
  price_cents INT NOT NULL
);
CREATE TABLE product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  url VARCHAR(500) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
