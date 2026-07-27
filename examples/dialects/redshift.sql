-- redshift dialect example — tree pattern: self-referencing category hierarchy via parent_id.

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER REFERENCES categories(id),
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL
);
