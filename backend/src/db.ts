import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(here, '../data')
mkdirSync(dataDir, { recursive: true })

export const db = new Database(resolve(dataDir, 'mosaic.sqlite'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    share_token TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    image_url TEXT NOT NULL,
    source_page TEXT NOT NULL DEFAULT '',
    source_creator TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    canvas_x REAL NOT NULL DEFAULT 40,
    canvas_y REAL NOT NULL DEFAULT 40,
    rotation REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

const count = db.prepare('SELECT COUNT(*) AS count FROM collections').get() as { count: number }
if (count.count === 0) {
  const result = db
    .prepare('INSERT INTO collections (name, description) VALUES (?, ?)')
    .run('Tokyo after dark', 'Neon, quiet streets, tiny bars, and places worth remembering.')
  db.prepare('INSERT INTO activity (collection_id, message) VALUES (?, ?)').run(
    result.lastInsertRowid,
    'Created this collection',
  )
}
