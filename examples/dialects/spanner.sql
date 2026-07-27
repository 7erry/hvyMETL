-- spanner dialect example — attribute pattern: EAV product_attributes collapsed into a key/value array.

CREATE TABLE products (
  id INT64 NOT NULL,

    sku STRING(40) NOT NULL,
  name STRING(200) NOT NULL

) PRIMARY KEY (id);
CREATE TABLE product_attributes (
  id INT64 NOT NULL,

    product_id INT64 NOT NULL REFERENCES products(id),
  attr_key STRING(60) NOT NULL,
  attr_value STRING(255) NOT NULL

) PRIMARY KEY (id);
