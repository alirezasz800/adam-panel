-- Stores only hashed session IDs and hashed client IP identifiers.
CREATE TABLE IF NOT EXISTS auth_attempts (
  ip_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
);
