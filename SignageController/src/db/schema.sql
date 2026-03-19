CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  online INTEGER NOT NULL DEFAULT 0,
  last_heartbeat INTEGER,
  current_state TEXT NOT NULL DEFAULT 'fallback',
  current_content_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS device_groups (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (device_id, group_id)
);

CREATE TABLE IF NOT EXISTS content (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('stream','image')),
  url TEXT,
  file_path TEXT,
  metadata TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK(target_type IN ('device','group','global')),
  target_id TEXT,
  content_id TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
