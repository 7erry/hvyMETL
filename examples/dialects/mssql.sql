-- mssql dialect example — reference pattern: high-volume customer_events kept separate from CRM core tables.

CREATE TABLE customers (
  id INT IDENTITY(1,1) PRIMARY KEY,
  email NVARCHAR(255) NOT NULL,
  full_name NVARCHAR(160) NOT NULL,
  country CHAR(2) NOT NULL,
  lifecycle_stage NVARCHAR(30) NOT NULL DEFAULT 'prospect',
  created_at DATETIME2 NOT NULL
);
CREATE TABLE customer_profiles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  industry NVARCHAR(80),
  employee_count INT,
  annual_revenue_usd INT,
  updated_at DATETIME2 NOT NULL
);
CREATE TABLE subscriptions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  plan_code NVARCHAR(40) NOT NULL,
  status NVARCHAR(20) NOT NULL,
  started_at DATETIME2 NOT NULL,
  renews_at DATETIME2
);
CREATE TABLE payment_methods (
  id INT IDENTITY(1,1) PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  method_type NVARCHAR(20) NOT NULL,
  last_four NVARCHAR(4),
  expires_on DATE,
  is_default BOOLEAN NOT NULL DEFAULT 0
);
CREATE TABLE customer_events (
  id INT IDENTITY(1,1) PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  event_type NVARCHAR(60) NOT NULL,
  event_at DATETIME2 NOT NULL,
  channel NVARCHAR(30),
  payload NVARCHAR(MAX)
);
CREATE TABLE support_tickets (
  id INT IDENTITY(1,1) PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  subject NVARCHAR(255) NOT NULL,
  status NVARCHAR(20) NOT NULL,
  priority NVARCHAR(10) NOT NULL DEFAULT 'normal',
  opened_at DATETIME2 NOT NULL,
  closed_at DATETIME2
);
