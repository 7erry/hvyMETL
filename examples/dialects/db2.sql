-- db2 dialect example — polymorphic pattern: CMS pages with block_type variants, assets, revisions, and tags.

CREATE TABLE authors (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'editor'
);
CREATE TABLE assets (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  byte_size INTEGER NOT NULL,
  storage_url VARCHAR(500) NOT NULL,
  uploaded_at TIMESTAMP NOT NULL
);
CREATE TABLE pages (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES authors(id),
  slug VARCHAR(200) NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  published_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL
);
CREATE TABLE content_blocks (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  position INTEGER NOT NULL,
  block_type VARCHAR(40) NOT NULL,
  title_text VARCHAR(200),
  text_body CLOB,
  image_asset_id INTEGER REFERENCES assets(id),
  image_url VARCHAR(500),
  video_asset_id INTEGER REFERENCES assets(id),
  video_duration_sec INTEGER,
  embed_url VARCHAR(500)
);
CREATE TABLE page_revisions (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  author_id INTEGER NOT NULL REFERENCES authors(id),
  revision_number INTEGER NOT NULL,
  change_summary VARCHAR(500),
  snapshot_json CLOB NOT NULL,
  created_at TIMESTAMP NOT NULL
);
CREATE TABLE tags (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  slug VARCHAR(80) NOT NULL
);
CREATE TABLE page_tags (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id)
);
