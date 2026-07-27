-- singlestore dialect example — single-collection pattern: article_tags junction merged into a single hub collection.

CREATE TABLE articles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(140) NOT NULL,
  title VARCHAR(200) NOT NULL
);
CREATE TABLE tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL
);
CREATE TABLE article_tags (
  article_id INT NOT NULL REFERENCES articles(id),
  tag_id INT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (article_id, tag_id)
);
