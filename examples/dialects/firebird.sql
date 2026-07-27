-- firebird dialect example — archive pattern: hot orders vs cold orders_archive for Atlas Online Archive.

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  order_number VARCHAR(40) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  placed_at DATETIME NOT NULL,
  total_cents INTEGER NOT NULL
);
CREATE TABLE orders_archive (
  id INTEGER PRIMARY KEY,
  order_number VARCHAR(40) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  placed_at DATETIME NOT NULL,
  total_cents INTEGER NOT NULL,
  archived_at DATETIME NOT NULL
);
