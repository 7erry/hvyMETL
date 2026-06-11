-- IoT Telemetry: sites, devices, sensors, and a massive readings table.
-- Demonstrates: Bucket (time-series readings), Computed (per-bucket
-- aggregates), Reference (unbounded child sets), Extended Reference
-- (device metadata on alerts).

CREATE TABLE sites (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  timezone VARCHAR(60) NOT NULL,
  latitude REAL,
  longitude REAL
);

CREATE TABLE firmware_versions (
  id INTEGER PRIMARY KEY,
  version VARCHAR(40) NOT NULL,
  released_at DATETIME NOT NULL,
  changelog TEXT
);

CREATE TABLE devices (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id),
  firmware_id INTEGER NOT NULL REFERENCES firmware_versions(id),
  serial_number VARCHAR(64) NOT NULL,
  model VARCHAR(80) NOT NULL,
  installed_at DATETIME NOT NULL,
  is_online BOOLEAN NOT NULL DEFAULT 1
);

CREATE TABLE sensors (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  kind VARCHAR(40) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  precision_digits INTEGER NOT NULL DEFAULT 2
);

-- The fire hose: one row per measurement. In MongoDB this becomes
-- bucketed documents, never one document per row.
CREATE TABLE sensor_readings (
  id INTEGER PRIMARY KEY,
  sensor_id INTEGER NOT NULL REFERENCES sensors(id),
  device_id INTEGER NOT NULL REFERENCES devices(id),
  recorded_at DATETIME NOT NULL,
  value REAL NOT NULL,
  quality_flag INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE device_alerts (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  severity VARCHAR(20) NOT NULL,
  message VARCHAR(500) NOT NULL,
  raised_at DATETIME NOT NULL,
  acknowledged_at DATETIME
);
