-- redshift dialect example — polymorphic pattern: CMS pages with block_type variants, assets, revisions, and tags.

CREATE TABLE authors (
  id SERIAL PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'editor'
);
CREATE TABLE assets (
  id SERIAL PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  byte_size INTEGER NOT NULL,
  storage_url VARCHAR(500) NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE pages (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES authors(id),
  slug VARCHAR(200) NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE content_blocks (
  id SERIAL PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  position INTEGER NOT NULL,
  block_type VARCHAR(40) NOT NULL,
  title_text VARCHAR(200),
  text_body TEXT,
  image_asset_id INTEGER REFERENCES assets(id),
  image_url VARCHAR(500),
  video_asset_id INTEGER REFERENCES assets(id),
  video_duration_sec INTEGER,
  embed_url VARCHAR(500)
);
CREATE TABLE page_revisions (
  id SERIAL PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  author_id INTEGER NOT NULL REFERENCES authors(id),
  revision_number INTEGER NOT NULL,
  change_summary VARCHAR(500),
  snapshot_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  slug VARCHAR(80) NOT NULL
);
CREATE TABLE page_tags (
  id SERIAL PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id)
);
