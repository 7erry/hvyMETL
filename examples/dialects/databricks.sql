-- databricks dialect example — reference pattern: unbounded customer_events kept in a separate collection.

CREATE TABLE customers (
  id BIGINT NOT NULL,
  email STRING NOT NULL
),
  CONSTRAINT pk PRIMARY KEY (id)
) USING DELTA;
CREATE TABLE customer_events (
  id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  event_type STRING NOT NULL,
  event_at TIMESTAMP NOT NULL,
  payload STRING
);
