-- mssql dialect example — single-collection pattern: articles and tags linked through article_tags for hub merge.

CREATE TABLE authors (
  id INT IDENTITY(1,1) PRIMARY KEY,
  display_name NVARCHAR(120) NOT NULL,
  email NVARCHAR(255) NOT NULL
);
CREATE TABLE articles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  author_id INT NOT NULL REFERENCES authors(id),
  slug NVARCHAR(140) NOT NULL,
  title NVARCHAR(200) NOT NULL,
  summary NVARCHAR(500),
  published_at DATETIME2
);
CREATE TABLE tags (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(80) NOT NULL,
  slug NVARCHAR(100) NOT NULL
);
CREATE TABLE article_tags (
  article_id INT NOT NULL REFERENCES articles(id),
  tag_id INT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (article_id, tag_id)
);
CREATE TABLE article_revisions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  article_id INT NOT NULL REFERENCES articles(id),
  revision_number INT NOT NULL,
  body_markdown NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2 NOT NULL
);
CREATE TABLE media_assets (
  id INT IDENTITY(1,1) PRIMARY KEY,
  article_id INT REFERENCES articles(id),
  file_name NVARCHAR(255) NOT NULL,
  mime_type NVARCHAR(80) NOT NULL,
  byte_size INT NOT NULL,
  cdn_url NVARCHAR(500) NOT NULL
);
