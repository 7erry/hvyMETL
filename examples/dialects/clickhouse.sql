-- clickhouse dialect example — embed pattern: bounded order line items embedded in parent order documents.

CREATE TABLE customers (
  id Int64,
  email String NOT NULL

) ENGINE = MergeTree ORDER BY id;
CREATE TABLE orders (
  id Int64,
  customer_id Int64 REFERENCES customers(id),
  order_number String NOT NULL,
  placed_at DateTime NOT NULL

) ENGINE = MergeTree ORDER BY id;
CREATE TABLE order_lines (
  id Int64,
  order_id Int64 REFERENCES orders(id),
  sku String NOT NULL,
  quantity Int64,
  unit_price_cents Int64

) ENGINE = MergeTree ORDER BY id;
