import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import './env.js'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(here, '../data')
mkdirSync(dataDir, { recursive: true })

export const db = new Database(process.env.DATABASE_PATH ? resolve(process.env.DATABASE_PATH) : resolve(dataDir, 'mosaic.sqlite'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
    share_token TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS collection_members (
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (collection_id, user_id)
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

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_members_user ON collection_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
`)

ensureColumn('users', 'bio', "TEXT NOT NULL DEFAULT ''")
ensureColumn('users', 'avatar_url', "TEXT NOT NULL DEFAULT ''")

function hashPassword(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

function seedUser(name: string, email: string, password: string) {
  const found = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined
  if (found) return found.id
  const salt = crypto.randomBytes(16).toString('hex')
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)')
    .run(name, email, hashPassword(password, salt), salt)
  return Number(result.lastInsertRowid)
}

const demoUserId = seedUser('Demo Curator', 'demo@mosaic.local', 'demo1234')
seedUser('Sam Rivera', 'sam@mosaic.local', 'demo1234')

const count = db.prepare('SELECT COUNT(*) AS count FROM collections').get() as { count: number }
if (count.count === 0) {
  const result = db
    .prepare('INSERT INTO collections (name, description) VALUES (?, ?)')
    .run('Tokyo after dark', 'Neon, quiet streets, tiny bars, and places worth remembering.')
  const collectionId = Number(result.lastInsertRowid)
  db.prepare('INSERT INTO collection_members (collection_id, user_id, role) VALUES (?, ?, ?)').run(
    collectionId,
    demoUserId,
    'owner',
  )
  db.prepare('INSERT INTO activity (collection_id, message) VALUES (?, ?)').run(
    collectionId,
    'Demo Curator created this collection',
  )
}

// Development databases created before accounts existed keep their data.
db.prepare(`
  INSERT OR IGNORE INTO collection_members (collection_id, user_id, role)
  SELECT c.id, ?, 'owner'
  FROM collections c
  WHERE NOT EXISTS (
    SELECT 1 FROM collection_members m WHERE m.collection_id = c.id
  )
`).run(demoUserId)
