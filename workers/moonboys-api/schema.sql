-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email_hash TEXT,
  telegram_username TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  approved INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Votes on comments
CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  vote TEXT NOT NULL CHECK(vote IN ('up','down')),
);

-- Page likes
CREATE TABLE IF NOT EXISTS page_likes (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- XP events
CREATE TABLE IF NOT EXISTS xp_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT,
  xp INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Citation votes
CREATE TABLE IF NOT EXISTS citation_votes (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  cite_id TEXT NOT NULL,
  vote TEXT NOT NULL CHECK(vote IN ('up','down')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Daily keywords
CREATE TABLE IF NOT EXISTS daily_keywords (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  rarity TEXT,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Keyword hits
CREATE TABLE IF NOT EXISTS keyword_hits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  keyword TEXT,
  xp_awarded INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);