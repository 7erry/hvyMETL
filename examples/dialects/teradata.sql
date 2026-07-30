-- teradata dialect example — outlier pattern: catalog products with skewed review volume and supporting merchandising tables.

CREATE MULTISET TABLE brands (
  id INTEGER NOT NULL,
  name VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL
),
  PRIMARY KEY (id)
);
CREATE MULTISET TABLE categories (
  id INTEGER NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
),
  PRIMARY KEY (id)
);
CREATE MULTISET TABLE products (
  id INTEGER NOT NULL,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  base_price_cents INTEGER NOT NULL,
  review_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT 1
),
  PRIMARY KEY (id)
);
CREATE MULTISET TABLE product_variants (
  id INTEGER NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_sku VARCHAR(48) NOT NULL,
  color VARCHAR(40),
  size VARCHAR(20),
  price_cents INTEGER NOT NULL
),
  PRIMARY KEY (id)
);
CREATE MULTISET TABLE reviews (
  id INTEGER NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  reviewer_name VARCHAR(120) NOT NULL,
  stars INTEGER NOT NULL,
  title VARCHAR(200),
  body TEXT,
  created_at DATETIME NOT NULL
),
  PRIMARY KEY (id)
);
CREATE MULTISET TABLE inventory_levels (
  id INTEGER NOT NULL,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id),
  warehouse_code VARCHAR(20) NOT NULL,
  quantity_on_hand INTEGER NOT NULL,
  updated_at DATETIME NOT NULL
);
