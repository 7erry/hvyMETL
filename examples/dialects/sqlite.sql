-- sqlite dialect example — subset pattern: product catalog with recent reviews embedded and full review history elsewhere.

CREATE TABLE brands (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  base_price_cents INTEGER NOT NULL
);
CREATE TABLE product_images (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  url VARCHAR(500) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  alt_text VARCHAR(255)
);
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  reviewer_name VARCHAR(120) NOT NULL,
  stars INTEGER NOT NULL,
  title VARCHAR(200),
  body TEXT,
  created_at DATETIME NOT NULL
);
CREATE TABLE review_votes (
  id INTEGER PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES reviews(id),
  voter_email VARCHAR(255) NOT NULL,
  vote_value INTEGER NOT NULL,
  voted_at DATETIME NOT NULL
);
