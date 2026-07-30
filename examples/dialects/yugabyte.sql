-- yugabyte dialect example — single-collection pattern: articles and tags linked through article_tags for hub merge.

CREATE TABLE authors (
  id SERIAL PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL
);
CREATE TABLE articles (
  id SERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES authors(id),
  slug VARCHAR(140) NOT NULL,
  title VARCHAR(200) NOT NULL,
  summary VARCHAR(500),
  published_at TIMESTAMPTZ
);
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(100) NOT NULL
);
CREATE TABLE article_tags (
  article_id INTEGER NOT NULL REFERENCES articles(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id),
  PRIMARY KEY (article_id, tag_id)
);
CREATE TABLE article_revisions (
  id SERIAL PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES articles(id),
  revision_number INTEGER NOT NULL,
  body_markdown TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE media_assets (
  id SERIAL PRIMARY KEY,
  article_id INTEGER REFERENCES articles(id),
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  byte_size INTEGER NOT NULL,
  cdn_url VARCHAR(500) NOT NULL
);
