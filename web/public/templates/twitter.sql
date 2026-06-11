-- Twitter-style social graph (simplified)
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  handle VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  bio VARCHAR(500),
  created_at DATETIME NOT NULL
);

CREATE TABLE tweets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  body VARCHAR(280) NOT NULL,
  created_at DATETIME NOT NULL,
  reply_to_id INTEGER REFERENCES tweets(id)
);

CREATE TABLE follows (
  follower_id INTEGER NOT NULL REFERENCES users(id),
  following_id INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE likes (
  user_id INTEGER NOT NULL REFERENCES users(id),
  tweet_id INTEGER NOT NULL REFERENCES tweets(id),
  created_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, tweet_id)
);
