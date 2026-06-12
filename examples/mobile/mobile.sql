-- Mobile Backend: users, device registrations, sessions, event stream,
-- purchases. Demonstrates: Extended Reference (user info on purchases),
-- Subset (recent sessions), Bucket (event stream), Computed (lifetime spend).

CREATE TABLE app_users (
  id INTEGER PRIMARY KEY,
  username VARCHAR(60) NOT NULL,
  email VARCHAR(255) NOT NULL,
  country CHAR(2) NOT NULL,
  plan VARCHAR(20) NOT NULL DEFAULT 'free',
  created_at DATETIME NOT NULL
);

CREATE TABLE user_devices (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id),
  platform VARCHAR(10) NOT NULL,
  os_version VARCHAR(20) NOT NULL,
  push_token VARCHAR(255),
  registered_at DATETIME NOT NULL
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id),
  device_id INTEGER NOT NULL REFERENCES user_devices(id),
  started_at DATETIME NOT NULL,
  ended_at DATETIME,
  duration_sec INTEGER
);

-- High-velocity event stream: taps, screens, errors.
CREATE TABLE app_events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id),
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  event_name VARCHAR(80) NOT NULL,
  occurred_at DATETIME NOT NULL,
  properties_json TEXT
);

CREATE TABLE purchases (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_users(id),
  product_code VARCHAR(60) NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  purchased_at DATETIME NOT NULL
);

CREATE TABLE push_notifications (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES user_devices(id),
  title VARCHAR(120) NOT NULL,
  body VARCHAR(500),
  sent_at DATETIME NOT NULL,
  opened_at DATETIME
);
