-- teradata dialect example — archive pattern: hot orders vs cold orders_archive for Atlas Online Archive.

CREATE MULTISET TABLE orders (
  id INTEGER NOT NULL,
  order_number VARCHAR(40) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  placed_at DATETIME NOT NULL,
  total_cents INTEGER NOT NULL
),
  PRIMARY KEY (id)
);
CREATE MULTISET TABLE orders_archive (
  id INTEGER NOT NULL,
  order_number VARCHAR(40) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  placed_at DATETIME NOT NULL,
  total_cents INTEGER NOT NULL,
  archived_at DATETIME NOT NULL
);
