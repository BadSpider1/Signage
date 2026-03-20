'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('../config');

const dbDir = path.dirname(path.resolve(config.dbPath));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.resolve(config.dbPath));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ---- Migrations for existing databases ----

// M001: add processing_status column to content if missing
try {
  db.prepare(`SELECT processing_status FROM content LIMIT 1`).get();
} catch (_) {
  db.prepare(`ALTER TABLE content ADD COLUMN processing_status TEXT NOT NULL DEFAULT 'ready'`).run();
  console.log('[DB] Migration: added processing_status column to content');
}

// M002: recreate content table without old CHECK constraint if the type column is too restrictive.
// We detect this by attempting to insert a temporary row with type='video'.
try {
  db.prepare(`INSERT OR IGNORE INTO content (id, name, type, url, file_path, metadata, processing_status, created_at)
    VALUES ('__migration_probe__','probe','video',NULL,NULL,'{}','ready',0)`).run();
  db.prepare(`DELETE FROM content WHERE id = '__migration_probe__'`).run();
} catch (_) {
  // The CHECK constraint is too restrictive; recreate the table without it.
  console.log('[DB] Migration: relaxing content.type CHECK constraint');
  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE content_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      url TEXT,
      file_path TEXT,
      metadata TEXT DEFAULT '{}',
      processing_status TEXT NOT NULL DEFAULT 'ready',
      created_at INTEGER NOT NULL
    );
    INSERT INTO content_new SELECT id, name, type, url, file_path, metadata,
      COALESCE(processing_status, 'ready'), created_at FROM content;
    DROP TABLE content;
    ALTER TABLE content_new RENAME TO content;
    PRAGMA foreign_keys = ON;
  `);
}

module.exports = db;
