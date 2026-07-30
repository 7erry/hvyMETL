-- databricks dialect example — reference pattern: high-volume customer_events kept separate from CRM core tables.

CREATE TABLE customers (
  id BIGINT NOT NULL,
  email STRING NOT NULL,
  full_name STRING NOT NULL,
  country CHAR(2) NOT NULL,
  lifecycle_stage STRING NOT NULL DEFAULT 'prospect',
  created_at TIMESTAMP NOT NULL
),
  CONSTRAINT pk PRIMARY KEY (id)
) USING DELTA;
CREATE TABLE customer_profiles (
  id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  industry STRING,
  employee_count BIGINT,
  annual_revenue_usd BIGINT,
  updated_at TIMESTAMP NOT NULL
),
  CONSTRAINT pk PRIMARY KEY (id)
) USING DELTA;
CREATE TABLE subscriptions (
  id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  plan_code STRING NOT NULL,
  status STRING NOT NULL,
  started_at TIMESTAMP NOT NULL,
  renews_at TIMESTAMP
),
  CONSTRAINT pk PRIMARY KEY (id)
) USING DELTA;
CREATE TABLE payment_methods (
  id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  method_type STRING NOT NULL,
  last_four STRING,
  expires_on DATE,
  is_default BOOLEAN NOT NULL DEFAULT 0
),
  CONSTRAINT pk PRIMARY KEY (id)
) USING DELTA;
CREATE TABLE customer_events (
  id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  event_type STRING NOT NULL,
  event_at TIMESTAMP NOT NULL,
  channel STRING,
  payload STRING
),
  CONSTRAINT pk PRIMARY KEY (id)
) USING DELTA;
CREATE TABLE support_tickets (
  id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  subject STRING NOT NULL,
  status STRING NOT NULL,
  priority STRING NOT NULL DEFAULT 'normal',
  opened_at TIMESTAMP NOT NULL,
  closed_at TIMESTAMP
);
