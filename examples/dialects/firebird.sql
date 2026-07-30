-- firebird dialect example — archive pattern: active orders plus orders_archive for Atlas Online Archive routing.

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  country CHAR(2) NOT NULL,
  created_at DATETIME NOT NULL
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  order_number VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  placed_at DATETIME NOT NULL,
  total_cents INTEGER NOT NULL
);
CREATE TABLE order_lines (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  sku VARCHAR(40) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
);
CREATE TABLE order_payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  method VARCHAR(30) NOT NULL,
  amount_cents INTEGER NOT NULL,
  captured_at DATETIME NOT NULL
);
CREATE TABLE shipments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  carrier VARCHAR(40) NOT NULL,
  shipped_at DATETIME,
  tracking_number VARCHAR(80)
);
CREATE TABLE orders_archive (
  id INTEGER PRIMARY KEY,
  order_number VARCHAR(40) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  placed_at DATETIME NOT NULL,
  total_cents INTEGER NOT NULL,
  archived_at DATETIME NOT NULL
);
