-- mssql dialect example — single-collection pattern: article_tags junction merged into a single hub collection.

CREATE TABLE articles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  slug NVARCHAR(140) NOT NULL,
  title NVARCHAR(200) NOT NULL
);
CREATE TABLE tags (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(80) NOT NULL
);
CREATE TABLE article_tags (
  article_id INT NOT NULL REFERENCES articles(id),
  tag_id INT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (article_id, tag_id)
);
