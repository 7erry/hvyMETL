-- mysql dialect example — reference pattern: high-volume customer_events kept separate from CRM core tables.

CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  country CHAR(2) NOT NULL,
  lifecycle_stage VARCHAR(30) NOT NULL DEFAULT 'prospect',
  created_at DATETIME NOT NULL
);
CREATE TABLE customer_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  industry VARCHAR(80),
  employee_count INT,
  annual_revenue_usd INT,
  updated_at DATETIME NOT NULL
);
CREATE TABLE subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  plan_code VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  started_at DATETIME NOT NULL,
  renews_at DATETIME
);
CREATE TABLE payment_methods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  method_type VARCHAR(20) NOT NULL,
  last_four VARCHAR(4),
  expires_on DATE,
  is_default BOOLEAN NOT NULL DEFAULT 0
);
CREATE TABLE customer_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  event_type VARCHAR(60) NOT NULL,
  event_at DATETIME NOT NULL,
  channel VARCHAR(30),
  payload TEXT
);
CREATE TABLE support_tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  subject VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  opened_at DATETIME NOT NULL,
  closed_at DATETIME
);
