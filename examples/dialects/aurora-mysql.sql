-- aurora-mysql dialect example — schema-versioning pattern: schemaVersion stamp applied to every planned collection.

CREATE TABLE brands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL
);
CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_id INT NOT NULL REFERENCES brands(id),
  sku VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL
);
