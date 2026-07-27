-- bigquery dialect example — bucket pattern: time-series sensor_readings grouped into time-window buckets.

CREATE TABLE `demo.sensors` (
  id 
  label STRING(80) NOT NULL
) PRIMARY KEY (id);
CREATE TABLE `demo.sensor_readings` (
  id 
  sensor_id INT64 NOT NULL REFERENCES sensors(id),
  recorded_at TIMESTAMP NOT NULL,
  value FLOAT64 NOT NULL
) PRIMARY KEY (id);
