-- databricks dialect example — archive pattern: active orders plus orders_archive for Atlas Online Archive routing.

CREATE TABLE customers (
  id BIGINT NOT NULL,
  email STRING NOT NULL,
  full_name STRING NOT NULL,
  country CHAR(2) NOT NULL,
  created_at TIMESTAMP NOT NULL
),
  CONSTRAINT pk PRIMARY KEY (id)
) USING DELTA;
CREATE TABLE orders (
  id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  order_number STRING NOT NULL,
  status STRING NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  placed_at TIMESTAMP NOT NULL,
  total_cents BIGINT NOT NULL
),
  CONSTRAINT pk PRIMARY KEY (id)
) USING DELTA;
CREATE TABLE order_lines (
  id BIGINT NOT NULL,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  sku STRING NOT NULL,
  quantity BIGINT NOT NULL,
  unit_price_cents BIGINT NOT NULL
),
  CONSTRAINT pk PRIMARY KEY (id)
) USING DELTA;
CREATE TABLE order_payments (
  id BIGINT NOT NULL,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  method STRING NOT NULL,
  amount_cents BIGINT NOT NULL,
  captured_at TIMESTAMP NOT NULL
),
  CONSTRAINT pk PRIMARY KEY (id)
) USING DELTA;
CREATE TABLE shipments (
  id BIGINT NOT NULL,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  carrier STRING NOT NULL,
  shipped_at TIMESTAMP,
  tracking_number STRING
),
  CONSTRAINT pk PRIMARY KEY (id)
) USING DELTA;
CREATE TABLE orders_archive (
  id BIGINT NOT NULL,
  order_number STRING NOT NULL,
  customer_email STRING NOT NULL,
  placed_at TIMESTAMP NOT NULL,
  total_cents BIGINT NOT NULL,
  archived_at TIMESTAMP NOT NULL
);
