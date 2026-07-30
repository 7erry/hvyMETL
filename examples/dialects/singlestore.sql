-- singlestore dialect example — single-collection pattern: articles and tags linked through article_tags for hub merge.

CREATE TABLE authors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL
);
CREATE TABLE articles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  author_id INT NOT NULL REFERENCES authors(id),
  slug VARCHAR(140) NOT NULL,
  title VARCHAR(200) NOT NULL,
  summary VARCHAR(500),
  published_at DATETIME
);
CREATE TABLE tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(100) NOT NULL
);
CREATE TABLE article_tags (
  article_id INT NOT NULL REFERENCES articles(id),
  tag_id INT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (article_id, tag_id)
);
CREATE TABLE article_revisions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  article_id INT NOT NULL REFERENCES articles(id),
  revision_number INT NOT NULL,
  body_markdown TEXT NOT NULL,
  created_at DATETIME NOT NULL
);
CREATE TABLE media_assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  article_id INT REFERENCES articles(id),
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  byte_size INT NOT NULL,
  cdn_url VARCHAR(500) NOT NULL
);
