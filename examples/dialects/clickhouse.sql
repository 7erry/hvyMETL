-- clickhouse dialect example — embed pattern: bounded order line items embedded in parent orders (fulfillment-style schema).

CREATE TABLE customers (
  id Int64,
  email String NOT NULL,
  company_name String,
  tier String NOT NULL DEFAULT 'standard',
  created_at DateTime NOT NULL

) ENGINE = MergeTree ORDER BY id;
CREATE TABLE customer_addresses (
  id Int64,
  customer_id Int64 REFERENCES customers(id),
  label String NOT NULL,
  line1 String NOT NULL,
  city String NOT NULL,
  region String,
  postal_code String NOT NULL,
  country CHAR(2) NOT NULL

) ENGINE = MergeTree ORDER BY id;
CREATE TABLE orders (
  id Int64,
  customer_id Int64 REFERENCES customers(id),
  ship_to_address_id Int64 REFERENCES customer_addresses(id),
  order_number String NOT NULL,
  status String NOT NULL DEFAULT 'open',
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  placed_at DateTime NOT NULL,
  promised_ship_at DateTime

) ENGINE = MergeTree ORDER BY id;
CREATE TABLE order_lines (
  id Int64,
  order_id Int64 REFERENCES orders(id),
  sku String NOT NULL,
  description String NOT NULL,
  quantity Int64,
  unit_price_cents Int64,
  tax_cents Int64 DEFAULT 0

) ENGINE = MergeTree ORDER BY id;
CREATE TABLE order_payments (
  id Int64,
  order_id Int64 REFERENCES orders(id),
  method String NOT NULL,
  amount_cents Int64,
  captured_at DateTime NOT NULL,
  processor_ref String

) ENGINE = MergeTree ORDER BY id;
CREATE TABLE shipments (
  id Int64,
  order_id Int64 REFERENCES orders(id),
  carrier String NOT NULL,
  tracking_number String,
  shipped_at DateTime,
  delivered_at DateTime

) ENGINE = MergeTree ORDER BY id;
CREATE TABLE shipment_items (
  id Int64,
  shipment_id Int64 REFERENCES shipments(id),
  order_line_id Int64 REFERENCES order_lines(id),
  quantity Int64

) ENGINE = MergeTree ORDER BY id;
