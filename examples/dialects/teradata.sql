-- teradata dialect example — archive pattern: active orders plus orders_archive for Atlas Online Archive routing.

CREATE MULTISET TABLE customers (
  id INTEGER NOT NULL,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  country CHAR(2) NOT NULL,
  created_at DATETIME NOT NULL
),
  PRIMARY KEY (id)
);
CREATE MULTISET TABLE orders (
  id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  order_number VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  placed_at DATETIME NOT NULL,
  total_cents INTEGER NOT NULL
),
  PRIMARY KEY (id)
);
CREATE MULTISET TABLE order_lines (
  id INTEGER NOT NULL,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  sku VARCHAR(40) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
),
  PRIMARY KEY (id)
);
CREATE MULTISET TABLE order_payments (
  id INTEGER NOT NULL,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  method VARCHAR(30) NOT NULL,
  amount_cents INTEGER NOT NULL,
  captured_at DATETIME NOT NULL
),
  PRIMARY KEY (id)
);
CREATE MULTISET TABLE shipments (
  id INTEGER NOT NULL,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  carrier VARCHAR(40) NOT NULL,
  shipped_at DATETIME,
  tracking_number VARCHAR(80)
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
