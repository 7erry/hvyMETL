-- Personalization Engine: profiles, item affinities, recommendations.
-- Demonstrates: Computed (continuously updated affinity scores),
-- Extended Reference (item metadata on recommendations), Subset (top-N
-- recommendations per user), Attribute (sparse profile traits).

CREATE TABLE profiles (
  id INTEGER PRIMARY KEY,
  external_user_id VARCHAR(64) NOT NULL,
  email VARCHAR(255),
  locale VARCHAR(10) NOT NULL DEFAULT 'en-US',
  created_at DATETIME NOT NULL
);

-- Sparse profile traits captured as EAV rows.
CREATE TABLE profile_traits (
  id INTEGER PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES profiles(id),
  trait_key VARCHAR(60) NOT NULL,
  trait_value VARCHAR(255) NOT NULL,
  observed_at DATETIME NOT NULL
);

CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  external_item_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  item_type VARCHAR(40) NOT NULL,
  metadata_json TEXT
);

-- One row per (profile, item) with a continuously updated score.
CREATE TABLE affinities (
  id INTEGER PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES profiles(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  score REAL NOT NULL,
  interaction_count INTEGER NOT NULL DEFAULT 0,
  last_interaction_at DATETIME
);

CREATE TABLE recommendations (
  id INTEGER PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES profiles(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  rank INTEGER NOT NULL,
  reason VARCHAR(120),
  generated_at DATETIME NOT NULL
);

CREATE TABLE segments (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  rule_json TEXT NOT NULL
);

CREATE TABLE profile_segments (
  id INTEGER PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES profiles(id),
  segment_id INTEGER NOT NULL REFERENCES segments(id),
  entered_at DATETIME NOT NULL
);
