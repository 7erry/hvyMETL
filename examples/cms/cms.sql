-- Content Management: pages, polymorphic blocks, revisions, assets, tags.
-- Demonstrates: Polymorphic (block subtypes), Tree (page hierarchy),
-- Schema Versioning (revisions), Embed (bounded blocks per page).

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'editor'
);

CREATE TABLE pages (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER REFERENCES pages(id),
  author_id INTEGER NOT NULL REFERENCES authors(id),
  slug VARCHAR(200) NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  published_at DATETIME,
  created_at DATETIME NOT NULL
);

-- Class-table-inheritance flattened to a type column with sparse variant
-- columns: a textbook polymorphic candidate.
CREATE TABLE content_blocks (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  position INTEGER NOT NULL,
  block_type VARCHAR(20) NOT NULL,
  text_body TEXT,
  image_asset_id INTEGER REFERENCES assets(id),
  image_alt VARCHAR(255),
  video_asset_id INTEGER REFERENCES assets(id),
  video_duration_sec INTEGER,
  embed_url VARCHAR(500)
);

CREATE TABLE assets (
  id INTEGER PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  byte_size INTEGER NOT NULL,
  storage_url VARCHAR(500) NOT NULL,
  uploaded_at DATETIME NOT NULL
);

CREATE TABLE page_revisions (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  author_id INTEGER NOT NULL REFERENCES authors(id),
  revision_number INTEGER NOT NULL,
  change_summary VARCHAR(500),
  snapshot_json TEXT NOT NULL,
  created_at DATETIME NOT NULL
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  slug VARCHAR(80) NOT NULL
);

CREATE TABLE page_tags (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id)
);
