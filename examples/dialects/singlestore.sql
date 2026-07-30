-- singlestore dialect example — subset pattern: product catalog with recent reviews embedded and full review history elsewhere.

CREATE TABLE brands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL
);
CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
);
CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_id INT NOT NULL REFERENCES brands(id),
  category_id INT NOT NULL REFERENCES categories(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  base_price_cents INT NOT NULL
);
CREATE TABLE product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  url VARCHAR(500) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  alt_text VARCHAR(255)
);
CREATE TABLE reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  reviewer_name VARCHAR(120) NOT NULL,
  stars INT NOT NULL,
  title VARCHAR(200),
  body TEXT,
  created_at DATETIME NOT NULL
);
CREATE TABLE review_votes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  review_id INT NOT NULL REFERENCES reviews(id),
  voter_email VARCHAR(255) NOT NULL,
  vote_value INT NOT NULL,
  voted_at DATETIME NOT NULL
);
