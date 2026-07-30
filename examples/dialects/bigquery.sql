-- bigquery dialect example — bucket pattern: IoT sensor_readings time series with sites, devices, and operational metadata.

CREATE TABLE `demo.sites` (
  id 
  name STRING(120) NOT NULL,
  timezone STRING(60) NOT NULL,
  latitude FLOAT64,
  longitude FLOAT64
) PRIMARY KEY (id);
CREATE TABLE `demo.firmware_versions` (
  id 
  version STRING(40) NOT NULL,
  released_at TIMESTAMP NOT NULL,
  changelog STRING
) PRIMARY KEY (id);
CREATE TABLE `demo.devices` (
  id 
  site_id INT64 NOT NULL REFERENCES sites(id),
  firmware_id INT64 NOT NULL REFERENCES firmware_versions(id),
  serial_number STRING(64) NOT NULL,
  model STRING(80) NOT NULL,
  installed_at TIMESTAMP NOT NULL,
  is_online BOOLEAN NOT NULL DEFAULT 1
) PRIMARY KEY (id);
CREATE TABLE `demo.sensors` (
  id 
  device_id INT64 NOT NULL REFERENCES devices(id),
  label STRING(80) NOT NULL,
  kind STRING(40) NOT NULL,
  unit STRING(20) NOT NULL,
  precision_digits INT64 NOT NULL DEFAULT 2
) PRIMARY KEY (id);
CREATE TABLE `demo.sensor_readings` (
  id 
  sensor_id INT64 NOT NULL REFERENCES sensors(id),
  device_id INT64 NOT NULL REFERENCES devices(id),
  recorded_at TIMESTAMP NOT NULL,
  value FLOAT64 NOT NULL,
  quality_flag INT64 NOT NULL DEFAULT 0
) PRIMARY KEY (id);
CREATE TABLE `demo.device_alerts` (
  id 
  device_id INT64 NOT NULL REFERENCES devices(id),
  severity STRING(20) NOT NULL,
  message STRING(500) NOT NULL,
  raised_at TIMESTAMP NOT NULL,
  acknowledged_at TIMESTAMP
) PRIMARY KEY (id);
CREATE TABLE `demo.maintenance_visits` (
  id 
  site_id INT64 NOT NULL REFERENCES sites(id),
  technician STRING(120) NOT NULL,
  scheduled_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  notes STRING
) PRIMARY KEY (id);
