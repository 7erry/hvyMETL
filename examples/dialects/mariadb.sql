-- mariadb dialect example — embed pattern: bounded order line items embedded in parent order documents.

CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL
);
CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  order_number VARCHAR(40) NOT NULL,
  placed_at DATETIME NOT NULL
);
CREATE TABLE order_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id),
  sku VARCHAR(40) NOT NULL,
  quantity INT NOT NULL,
  unit_price_cents INT NOT NULL
);
