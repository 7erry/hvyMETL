-- db2 dialect example — polymorphic pattern: content_blocks with block_type discriminator and sparse variant columns.

CREATE TABLE pages (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug VARCHAR(140) NOT NULL,
  title VARCHAR(200) NOT NULL
);
CREATE TABLE assets (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL
);
CREATE TABLE content_blocks (
  id INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id),
  asset_id INTEGER REFERENCES assets(id),
  block_type VARCHAR(40) NOT NULL,
  title_text VARCHAR(200),
  image_url VARCHAR(500),
  body_html CLOB
);
