-- mysql dialect example — reference pattern: unbounded customer_events kept in a separate collection.

CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL
);
CREATE TABLE customer_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  event_type VARCHAR(60) NOT NULL,
  event_at DATETIME NOT NULL,
  payload TEXT
);
