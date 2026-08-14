CREATE TABLE IF NOT EXISTS telegram_pet_client_performance (
  sample_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  quality_tier TEXT NOT NULL CHECK (quality_tier IN ('low', 'medium', 'high')),
  average_fps REAL NOT NULL CHECK (average_fps >= 0 AND average_fps <= 240),
  slow_frame_pct REAL NOT NULL CHECK (slow_frame_pct >= 0 AND slow_frame_pct <= 100),
  render_duration_ms REAL CHECK (render_duration_ms > 0 AND render_duration_ms <= 10000),
  device_memory REAL,
  hardware_concurrency INTEGER,
  viewport_width INTEGER NOT NULL CHECK (viewport_width BETWEEN 1 AND 10000),
  viewport_height INTEGER NOT NULL CHECK (viewport_height BETWEEN 1 AND 10000),
  reduced_motion INTEGER NOT NULL DEFAULT 0 CHECK (reduced_motion IN (0, 1)),
  sampled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pet_client_performance_tuning ON telegram_pet_client_performance(sampled_at DESC, quality_tier, average_fps);
