-- Django-style auth + content schema (simplified)
CREATE TABLE auth_user (
  id INTEGER PRIMARY KEY,
  username VARCHAR(150) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  date_joined DATETIME NOT NULL
);

CREATE TABLE blog_category (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL
);

CREATE TABLE blog_post (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES auth_user(id),
  category_id INTEGER REFERENCES blog_category(id),
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT 0
);

CREATE TABLE blog_comment (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES blog_post(id),
  author_id INTEGER NOT NULL REFERENCES auth_user(id),
  text TEXT NOT NULL,
  created_at DATETIME NOT NULL
);
