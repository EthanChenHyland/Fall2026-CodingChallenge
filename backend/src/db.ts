import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import './env.js'
import { catalog } from './catalog.js'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(here, '../data')
export const databasePath = process.env.DATABASE_PATH ? resolve(process.env.DATABASE_PATH) : resolve(dataDir, 'mosaic.sqlite')
mkdirSync(dirname(databasePath), { recursive: true })

export const db = new Database(databasePath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

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
    audience TEXT NOT NULL DEFAULT 'private',
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

  CREATE TABLE IF NOT EXISTS collection_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role = 'editor'),
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS collection_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    section_id INTEGER,
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

  CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id != following_id)
  );

  CREATE TABLE IF NOT EXISTS collection_follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, collection_id)
  );

  CREATE TABLE IF NOT EXISTS item_likes (
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (item_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS item_lineage (
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    ancestor_item_id INTEGER NOT NULL,
    depth INTEGER NOT NULL CHECK (depth > 0),
    PRIMARY KEY (item_id, depth)
  );

  CREATE TABLE IF NOT EXISTS recommendation_feedback (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    signal TEXT NOT NULL CHECK (signal IN ('more', 'not_interested')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    parent_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_a_id, user_b_id),
    CHECK (user_a_id < user_b_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    pin_id INTEGER,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS search_cache (
    key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS deleted_items (
    item_id INTEGER PRIMARY KEY,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    snapshot TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_items_collection ON items(collection_id, source_id);
  CREATE INDEX IF NOT EXISTS idx_sections_collection ON collection_sections(collection_id, position, id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_items_collection_source_unique ON items(collection_id, source_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_single_owner ON collection_members(collection_id) WHERE role = 'owner';
  CREATE INDEX IF NOT EXISTS idx_activity_collection ON activity(collection_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_members_user ON collection_members(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_active_invite ON collection_invites(collection_id) WHERE revoked_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_collection_follows_collection ON collection_follows(collection_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_item_likes_item ON item_likes(item_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_item_lineage_ancestor ON item_lineage(ancestor_item_id, item_id);
  CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_user ON recommendation_feedback(user_id, signal, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_comments_item ON comments(item_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_conversations_user_a ON conversations(user_a_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_conversations_user_b ON conversations(user_b_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id ASC);
`)

ensureColumn('users', 'bio', "TEXT NOT NULL DEFAULT ''")
ensureColumn('users', 'avatar_url', "TEXT NOT NULL DEFAULT ''")
ensureColumn('collections', 'cover_item_id', 'INTEGER')
ensureColumn('collections', 'cover_focus_x', 'REAL NOT NULL DEFAULT 50')
ensureColumn('collections', 'cover_focus_y', 'REAL NOT NULL DEFAULT 50')
ensureColumn('collections', 'theme', "TEXT NOT NULL DEFAULT 'paper'")
ensureColumn('collections', 'grid_layout', "TEXT NOT NULL DEFAULT 'gallery'")
ensureColumn('collections', 'audience', "TEXT NOT NULL DEFAULT 'private'")
ensureColumn('items', 'tags', "TEXT NOT NULL DEFAULT ''")
ensureColumn('items', 'section_id', 'INTEGER')
ensureColumn('messages', 'pin_id', 'INTEGER')
ensureColumn('comments', 'parent_id', 'INTEGER')
db.prepare("UPDATE collections SET audience = 'public' WHERE visibility = 'public' AND audience = 'private'").run()

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

// Seed only a new database. Existing accounts and edits are never repaired by demo data.
if (!(db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count) {
  db.transaction(() => {
    const demoUserId = seedUser('Demo Curator', 'demo@mosaic.local', 'demo1234')
    const samUserId = seedUser('Sam Rivera', 'sam@mosaic.local', 'demo1234')
    const mayaUserId = seedUser('Maya Park', 'maya@mosaic.local', 'demo1234')

    db.prepare("UPDATE users SET bio = ? WHERE id = ? AND bio = ''").run('Collecting spaces, street light, printed matter, and small things with good proportions.', demoUserId)
    db.prepare("UPDATE users SET bio = ? WHERE id = ? AND bio = ''").run('Architecture student saving materials, signage, and places worth revisiting.', samUserId)
    db.prepare("UPDATE users SET bio = ? WHERE id = ? AND bio = ''").run('Color, objects, and quiet visual references.', mayaUserId)

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

    const publicDemo = db.prepare("SELECT id FROM collections WHERE share_token = 'mosaic-demo-public'").get() as { id: number } | undefined
    if (!publicDemo) {
      const created = db.prepare(`
        INSERT INTO collections (name, description, visibility, audience, share_token)
        VALUES (?, ?, 'public', 'public', 'mosaic-demo-public')
      `).run('Museum of small things', 'Objects, rooms, colors, and details worth looking at twice.')
      const collectionId = Number(created.lastInsertRowid)
      db.prepare("INSERT INTO collection_members (collection_id, user_id, role) VALUES (?, ?, 'owner')").run(collectionId, demoUserId)
      for (const [index, image] of catalog.slice(0, 8).entries()) {
        db.prepare(`
          INSERT INTO items (collection_id, source_id, image_url, source_page, source_creator, title, canvas_x, canvas_y, rotation)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(collectionId, image.id, image.imageUrl, image.pageUrl, image.creator, image.title, 36 + (index % 3) * 220, 40 + Math.floor(index / 3) * 250, (index % 3 - 1) * 2)
      }
      db.prepare('INSERT INTO activity (collection_id, message) VALUES (?, ?)').run(collectionId, 'Demo Curator published this collection')
    }

    function ensureDemoCollection(
      name: string,
      description: string,
      imageIndexes: number[],
      visibility: 'private' | 'public',
      shareToken: string | null,
      ownerId = demoUserId,
      ownerName = 'Demo Curator',
    ) {
      let row = db.prepare(`
        SELECT c.id FROM collections c
        JOIN collection_members m ON m.collection_id = c.id AND m.user_id = ? AND m.role = 'owner'
        WHERE c.name = ? LIMIT 1
      `).get(ownerId, name) as { id: number } | undefined

      if (!row) {
        const created = db.prepare(`
          INSERT INTO collections (name, description, visibility, audience, share_token)
          VALUES (?, ?, ?, ?, ?)
        `).run(name, description, visibility, visibility, shareToken)
        row = { id: Number(created.lastInsertRowid) }
        db.prepare("INSERT INTO collection_members (collection_id, user_id, role) VALUES (?, ?, 'owner')").run(row.id, ownerId)
        db.prepare('INSERT INTO activity (collection_id, message) VALUES (?, ?)').run(row.id, `${ownerName} created “${name}”`)
      }

      imageIndexes.forEach((catalogIndex, index) => {
        const image = catalog[catalogIndex % catalog.length]
        const existing = db.prepare('SELECT id FROM items WHERE collection_id = ? AND source_id = ?').get(row!.id, image.id) as { id: number } | undefined
        if (existing) return
        db.prepare(`
          INSERT INTO items (collection_id, source_id, image_url, source_page, source_creator, title, note, canvas_x, canvas_y, rotation)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          row!.id,
          image.id,
          image.imageUrl,
          image.pageUrl,
          image.creator,
          image.title,
          index % 2 === 0 ? 'Saved for the shape, light, and texture.' : 'Reference for later — especially the composition.',
          38 + (index % 3) * 232,
          48 + Math.floor(index / 3) * 255,
          (index % 4 - 1.5) * 1.5,
        )
      })

      const firstItem = db.prepare('SELECT id FROM items WHERE collection_id = ? ORDER BY id ASC LIMIT 1').get(row.id) as { id: number } | undefined
      if (firstItem) db.prepare('UPDATE collections SET cover_item_id = COALESCE(cover_item_id, ?) WHERE id = ?').run(firstItem.id, row.id)
      return row.id
    }

    const museumId = (db.prepare("SELECT id FROM collections WHERE share_token = 'mosaic-demo-public'").get() as { id: number }).id
    const fieldNotesId = ensureDemoCollection(
      'Weekend field notes',
      'Roads, water, diners, trailheads, and the places between plans.',
      [1, 3, 6, 9, 0],
      'public',
      'mosaic-demo-field-notes',
    )
    const roomsId = ensureDemoCollection(
      'Rooms I would steal',
      'Interiors, details, and materials worth borrowing for a future room.',
      [2, 4, 8, 11, 10],
      'public',
      'mosaic-demo-rooms',
    )
    ensureDemoCollection(
      'Color studies',
      'A private pile of palettes, contrast, and combinations that keep working.',
      [5, 7, 9, 10, 2],
      'private',
      null,
    )
    const samMaterialsId = ensureDemoCollection(
      'Material walks',
      'Concrete, tile, metal, storefronts, and details collected on foot.',
      [11, 6, 4, 1, 8],
      'public',
      'mosaic-demo-material-walks',
      samUserId,
      'Sam Rivera',
    )

    const backfillCatalogTags = db.prepare("UPDATE items SET tags = ? WHERE source_id = ? AND TRIM(tags) = ''")
    for (const image of catalog) backfillCatalogTags.run(image.tags.join(', '), image.id)

    db.prepare("INSERT OR IGNORE INTO collection_members (collection_id, user_id, role) VALUES (?, ?, 'editor')").run(museumId, samUserId)
    db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').run(demoUserId, samUserId)
    db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').run(mayaUserId, demoUserId)

    const socialPins = db.prepare(`
      SELECT i.id, i.collection_id FROM items i
      WHERE i.collection_id IN (?, ?, ?, ?)
      ORDER BY i.id ASC LIMIT 4
    `).all(museumId, fieldNotesId, roomsId, samMaterialsId) as Array<{ id: number; collection_id: number }>
    for (const [index, pin] of socialPins.entries()) {
      const liker = index % 2 === 0 ? samUserId : mayaUserId
      db.prepare('INSERT OR IGNORE INTO item_likes (item_id, user_id) VALUES (?, ?)').run(pin.id, liker)
      const existingComment = db.prepare('SELECT id FROM comments WHERE item_id = ? AND user_id = ?').get(pin.id, liker)
      if (!existingComment && index < 3) {
        db.prepare('INSERT INTO comments (item_id, user_id, body) VALUES (?, ?, ?)').run(
          pin.id,
          liker,
          index === 0 ? 'The framing on this is so good.' : index === 1 ? 'Saving this for the material palette.' : 'This belongs on the reference wall.',
        )
      }
    }

    const collaboratorActivity = 'Sam Rivera arranged a few references on the canvas'
    if (!db.prepare('SELECT id FROM activity WHERE collection_id = ? AND message = ?').get(museumId, collaboratorActivity)) {
      db.prepare('INSERT INTO activity (collection_id, message) VALUES (?, ?)').run(museumId, collaboratorActivity)
    }

    const seededNotice = db.prepare("SELECT id FROM notifications WHERE user_id = ? AND message = 'Sam Rivera moved a pin on Museum of small things'").get(demoUserId)
    if (!seededNotice) {
      db.prepare('INSERT INTO notifications (user_id, collection_id, message) VALUES (?, ?, ?)').run(
        demoUserId,
        museumId,
        'Sam Rivera moved a pin on Museum of small things',
      )
    }
  })()
}
