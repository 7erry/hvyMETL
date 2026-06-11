-- Real-Time Analytics: raw event firehose plus rollups and funnels.
-- Demonstrates: Bucket (event stream), Pre-allocation (hourly rollup slots),
-- Computed (running totals), Reference (unbounded event sets).

CREATE TABLE tracked_sites (
  id INTEGER PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  owner_email VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL
);

CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES tracked_sites(id),
  name VARCHAR(120) NOT NULL,
  utm_code VARCHAR(80) NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME
);

-- The firehose: one row per page event at very high velocity.
CREATE TABLE page_events (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES tracked_sites(id),
  campaign_id INTEGER REFERENCES campaigns(id),
  visitor_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  url_path VARCHAR(500) NOT NULL,
  occurred_at DATETIME NOT NULL,
  load_time_ms INTEGER
);

CREATE TABLE funnels (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES tracked_sites(id),
  name VARCHAR(120) NOT NULL
);

CREATE TABLE funnel_steps (
  id INTEGER PRIMARY KEY,
  funnel_id INTEGER NOT NULL REFERENCES funnels(id),
  step_number INTEGER NOT NULL,
  match_url_path VARCHAR(500) NOT NULL,
  label VARCHAR(120) NOT NULL
);

-- Pre-aggregated rollups the dashboard reads instead of scanning events.
CREATE TABLE hourly_rollups (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES tracked_sites(id),
  hour_start DATETIME NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  avg_load_time_ms REAL
);
