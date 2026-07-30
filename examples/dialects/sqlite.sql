-- sqlite dialect example — embed pattern: bounded order line items embedded in parent orders (fulfillment-style schema).

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  company_name VARCHAR(200),
  tier VARCHAR(20) NOT NULL DEFAULT 'standard',
  created_at DATETIME NOT NULL
);
CREATE TABLE customer_addresses (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  label VARCHAR(40) NOT NULL,
  line1 VARCHAR(200) NOT NULL,
  city VARCHAR(80) NOT NULL,
  region VARCHAR(80),
  postal_code VARCHAR(20) NOT NULL,
  country CHAR(2) NOT NULL
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  ship_to_address_id INTEGER NOT NULL REFERENCES customer_addresses(id),
  order_number VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  placed_at DATETIME NOT NULL,
  promised_ship_at DATETIME
);
CREATE TABLE order_lines (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  sku VARCHAR(40) NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE order_payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  method VARCHAR(30) NOT NULL,
  amount_cents INTEGER NOT NULL,
  captured_at DATETIME NOT NULL,
  processor_ref VARCHAR(80)
);
CREATE TABLE shipments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  carrier VARCHAR(40) NOT NULL,
  tracking_number VARCHAR(80),
  shipped_at DATETIME,
  delivered_at DATETIME
);
CREATE TABLE shipment_items (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id),
  order_line_id INTEGER NOT NULL REFERENCES order_lines(id),
  quantity INTEGER NOT NULL
);
