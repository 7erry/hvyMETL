-- sybase dialect example — subset pattern: product catalog with recent reviews embedded and full review history elsewhere.

CREATE TABLE dbo.brands (
  id INT IDENTITY NOT NULL,
  PRIMARY KEY (id),
  name VARCHAR(120) NOT NULL
);
CREATE TABLE dbo.categories (
  id INT IDENTITY NOT NULL,
  PRIMARY KEY (id),
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
);
CREATE TABLE dbo.products (
  id INT IDENTITY NOT NULL,
  PRIMARY KEY (id),
  brand_id INT NOT NULL REFERENCES brands(id),
  category_id INT NOT NULL REFERENCES categories(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  base_price_cents INT NOT NULL
);
CREATE TABLE dbo.product_images (
  id INT IDENTITY NOT NULL,
  PRIMARY KEY (id),
  product_id INT NOT NULL REFERENCES products(id),
  url VARCHAR(500) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  alt_text VARCHAR(255)
);
CREATE TABLE dbo.reviews (
  id INT IDENTITY NOT NULL,
  PRIMARY KEY (id),
  product_id INT NOT NULL REFERENCES products(id),
  reviewer_name VARCHAR(120) NOT NULL,
  stars INT NOT NULL,
  title VARCHAR(200),
  body TEXT,
  created_at DATETIME NOT NULL
);
CREATE TABLE dbo.review_votes (
  id INT IDENTITY NOT NULL,
  PRIMARY KEY (id),
  review_id INT NOT NULL REFERENCES reviews(id),
  voter_email VARCHAR(255) NOT NULL,
  vote_value INT NOT NULL,
  voted_at DATETIME NOT NULL
);
