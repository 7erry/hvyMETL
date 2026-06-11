-- Single View (Customer 360): one customer fragmented across CRM, web,
-- orders, support, marketing, and loyalty systems.
-- Demonstrates: Extended Reference (denormalizing the fragments into one
-- document), Subset (recent orders), Outlier (mega accounts), Computed
-- (lifetime value), Schema Versioning (sources evolve independently).

CREATE TABLE crm_customers (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(80),
  last_name VARCHAR(80),
  phone VARCHAR(40),
  account_manager VARCHAR(120),
  created_at DATETIME NOT NULL
);

CREATE TABLE web_accounts (
  id INTEGER PRIMARY KEY,
  crm_customer_id INTEGER NOT NULL REFERENCES crm_customers(id),
  username VARCHAR(60) NOT NULL,
  last_login_at DATETIME,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  crm_customer_id INTEGER NOT NULL REFERENCES crm_customers(id),
  order_number VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  total_cents INTEGER NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  placed_at DATETIME NOT NULL
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  sku VARCHAR(40) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL
);

CREATE TABLE support_tickets (
  id INTEGER PRIMARY KEY,
  crm_customer_id INTEGER NOT NULL REFERENCES crm_customers(id),
  subject VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  opened_at DATETIME NOT NULL,
  closed_at DATETIME
);

CREATE TABLE marketing_touches (
  id INTEGER PRIMARY KEY,
  crm_customer_id INTEGER NOT NULL REFERENCES crm_customers(id),
  channel VARCHAR(30) NOT NULL,
  campaign_name VARCHAR(120) NOT NULL,
  touched_at DATETIME NOT NULL,
  converted BOOLEAN NOT NULL DEFAULT 0
);

CREATE TABLE loyalty_accounts (
  id INTEGER PRIMARY KEY,
  crm_customer_id INTEGER NOT NULL REFERENCES crm_customers(id),
  tier VARCHAR(20) NOT NULL DEFAULT 'bronze',
  points_balance INTEGER NOT NULL DEFAULT 0,
  enrolled_at DATETIME NOT NULL
);
