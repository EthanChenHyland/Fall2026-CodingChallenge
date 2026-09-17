import cors from 'cors'
import crypto from 'node:crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { catalog } from './catalog.js'
import { db } from './db.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const SESSION_COOKIE = 'mosaic_session'
const SESSION_DAYS = 7

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

type User = { id: number; name: string; email: string; created_at: string }
type AuthedRequest = Request & { user?: User }
type Membership = { role: 'owner' | 'editor' }

const authSchema = z.object({
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(6).max(128),
})

const registerSchema = authSchema.extend({
  name: z.string().trim().min(2).max(80),
})

const collectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).optional().default(''),
})

const itemSchema = z.object({
  sourceId: z.string().min(1),
  imageUrl: z.string().url(),
  sourcePage: z.string().url().or(z.literal('')).optional().default(''),
  sourceCreator: z.string().max(120).optional().default(''),
  title: z.string().trim().min(1).max(120),
})

const itemPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(500).optional(),
  canvasX: z.number().finite().min(0).max(5000).optional(),
  canvasY: z.number().finite().min(0).max(5000).optional(),
  rotation: z.number().min(-12).max(12).optional(),
})

const inviteSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
})

function parseCookies(req: Request) {
  const entries = (req.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=')
      if (separator < 0) return [part, '']
      return [decodeURIComponent(part.slice(0, separator)), decodeURIComponent(part.slice(separator + 1))]
    })
  return Object.fromEntries(entries) as Record<string, string>
}

function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function passwordHash(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

function safePasswordEqual(password: string, salt: string, storedHash: string) {
  const actual = Buffer.from(passwordHash(password, salt), 'hex')
  const expected = Buffer.from(storedHash, 'hex')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

function setSession(res: Response, userId: number) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    tokenHash(token),
    userId,
    expiresAt.toISOString(),
  )
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

function clearSession(req: Request, res: Response) {
  const token = parseCookies(req)[SESSION_COOKIE]
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token))
  res.clearCookie(SESSION_COOKIE, { path: '/' })
}

function loadUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = parseCookies(req)[SESSION_COOKIE]
  if (!token) return next()
  const row = db.prepare(`
    SELECT u.id, u.name, u.email, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(tokenHash(token), new Date().toISOString()) as User | undefined
  req.user = row
  next()
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' })
  next()
}

app.use(loadUser)

function membership(collectionId: number, userId: number) {
  return db.prepare('SELECT role FROM collection_members WHERE collection_id = ? AND user_id = ?').get(
    collectionId,
    userId,
  ) as Membership | undefined
}

function requireMembership(req: AuthedRequest, res: Response, next: NextFunction) {
  const collectionId = Number(req.params.id)
  if (!Number.isInteger(collectionId)) return res.status(400).json({ error: 'Invalid collection.' })
  const found = req.user ? membership(collectionId, req.user.id) : undefined
  if (!found) return res.status(404).json({ error: 'Collection not found.' })
  res.locals.membership = found
  next()
}

function requireOwner(_req: AuthedRequest, res: Response, next: NextFunction) {
  if (res.locals.membership?.role !== 'owner') {
    return res.status(403).json({ error: 'Only the collection owner can do that.' })
  }
  next()
}

const collectionSelect = `
  SELECT c.*,
    COUNT(DISTINCT i.id) AS item_count,
    (SELECT image_url FROM items WHERE collection_id = c.id ORDER BY id DESC LIMIT 1) AS cover_url
  FROM collections c
  LEFT JOIN items i ON i.collection_id = c.id
`

function getCollection(id: number, userId?: number) {
  const collection = db.prepare(`${collectionSelect} WHERE c.id = ? GROUP BY c.id`).get(id) as Record<string, unknown> | undefined
  if (!collection) return null
  const items = db.prepare('SELECT * FROM items WHERE collection_id = ? ORDER BY id DESC').all(id)
  const activity = db.prepare('SELECT * FROM activity WHERE collection_id = ? ORDER BY id DESC LIMIT 20').all(id)
  const collaborators = db.prepare(`
    SELECT u.id, u.name, u.email, m.role
    FROM collection_members m
    JOIN users u ON u.id = m.user_id
    WHERE m.collection_id = ?
    ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, u.name
  `).all(id)
  return {
    ...collection,
    role: userId ? membership(id, userId)?.role ?? null : null,
    items,
    activity,
    collaborators,
  }
}

function logActivity(collectionId: number, message: string, actorUserId?: number) {
  db.prepare('INSERT INTO activity (collection_id, message) VALUES (?, ?)').run(collectionId, message)
  if (!actorUserId) return
  db.prepare(`
    INSERT INTO notifications (user_id, collection_id, message)
    SELECT user_id, ?, ?
    FROM collection_members
    WHERE collection_id = ? AND user_id != ?
  `).run(collectionId, message, collectionId, actorUserId)
}

function actor(req: AuthedRequest) {
  return req.user?.name ?? 'Someone'
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'mosaic-api' })
})

app.post('/api/auth/register', (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid name, email, and password.' })
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email)
  if (existing) return res.status(409).json({ error: 'An account already exists with that email.' })
  const salt = crypto.randomBytes(16).toString('hex')
  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)
  `).run(parsed.data.name, parsed.data.email, passwordHash(parsed.data.password, salt), salt)
  const userId = Number(result.lastInsertRowid)
  setSession(res, userId)
  const user = db.prepare('SELECT id, name, email, created_at FROM users WHERE id = ?').get(userId)
  return res.status(201).json({ user })
})

app.post('/api/auth/login', (req, res) => {
  const parsed = authSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' })
  const account = db.prepare('SELECT * FROM users WHERE email = ?').get(parsed.data.email) as
    | (User & { password_hash: string; password_salt: string })
    | undefined
  if (!account || !safePasswordEqual(parsed.data.password, account.password_salt, account.password_hash)) {
    return res.status(401).json({ error: 'Email or password is incorrect.' })
  }
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString())
  setSession(res, account.id)
  return res.json({ user: { id: account.id, name: account.name, email: account.email, created_at: account.created_at } })
})

app.post('/api/auth/demo', (_req, res) => {
  const user = db.prepare("SELECT id, name, email, created_at FROM users WHERE email = 'demo@mosaic.local'").get() as User
  setSession(res, user.id)
  return res.json({ user })
})

app.post('/api/auth/logout', (req, res) => {
  clearSession(req, res)
  return res.status(204).end()
})

app.get('/api/auth/me', (req: AuthedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' })
  return res.json({ user: req.user })
})

app.get('/api/search', (req, res) => {
  const query = String(req.query.q ?? '').trim().toLowerCase()
  const results = query
    ? catalog.filter((image) => `${image.title} ${image.tags.join(' ')}`.toLowerCase().includes(query))
    : catalog
  res.json({ results })
})

app.get('/api/collections', requireAuth, (req: AuthedRequest, res) => {
  const collections = db.prepare(`
    SELECT c.*,
      member.role AS role,
      COUNT(DISTINCT i.id) AS item_count,
      (SELECT image_url FROM items WHERE collection_id = c.id ORDER BY id DESC LIMIT 1) AS cover_url
    FROM collections c
    LEFT JOIN items i ON i.collection_id = c.id
    JOIN collection_members member ON member.collection_id = c.id AND member.user_id = ?
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `).all(req.user!.id)
  res.json({ collections })
})

app.post('/api/collections', requireAuth, (req: AuthedRequest, res) => {
  const parsed = collectionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Please enter a collection name.' })
  const create = db.transaction(() => {
    const result = db.prepare('INSERT INTO collections (name, description) VALUES (?, ?)').run(
      parsed.data.name,
      parsed.data.description,
    )
    const id = Number(result.lastInsertRowid)
    db.prepare('INSERT INTO collection_members (collection_id, user_id, role) VALUES (?, ?, ?)').run(id, req.user!.id, 'owner')
    logActivity(id, `${actor(req)} created this collection`, req.user!.id)
    return id
  })
  const id = create()
  return res.status(201).json({ collection: getCollection(id, req.user!.id) })
})

app.get('/api/collections/:id', requireAuth, requireMembership, (req: AuthedRequest, res) => {
  return res.json({ collection: getCollection(Number(req.params.id), req.user!.id) })
})

app.patch('/api/collections/:id', requireAuth, requireMembership, (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const existing = getCollection(id, req.user!.id) as Record<string, unknown>
  const schema = collectionSchema.partial().extend({ visibility: z.enum(['private', 'public']).optional() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid collection update.' })
  if (parsed.data.visibility && res.locals.membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can change collection visibility.' })
  }
  const next = { ...existing, ...parsed.data }
  db.prepare(`
    UPDATE collections SET name = ?, description = ?, visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(next.name, next.description, next.visibility, id)
  logActivity(id, `${actor(req)} updated collection details`, req.user!.id)
  return res.json({ collection: getCollection(id, req.user!.id) })
})

app.delete('/api/collections/:id', requireAuth, requireMembership, requireOwner, (req, res) => {
  db.prepare('DELETE FROM collections WHERE id = ?').run(Number(req.params.id))
  return res.status(204).end()
})

app.post('/api/collections/:id/items', requireAuth, requireMembership, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const parsed = itemSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid image.' })
  const p = parsed.data
  const offset = (db.prepare('SELECT COUNT(*) AS count FROM items WHERE collection_id = ?').get(collectionId) as { count: number }).count
  const result = db.prepare(`
    INSERT INTO items (collection_id, source_id, image_url, source_page, source_creator, title, canvas_x, canvas_y, rotation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(collectionId, p.sourceId, p.imageUrl, p.sourcePage, p.sourceCreator, p.title, 36 + (offset % 3) * 220, 40 + Math.floor(offset / 3) * 250, (offset % 3 - 1) * 2)
  db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(collectionId)
  logActivity(collectionId, `${actor(req)} saved “${p.title}”`, req.user!.id)
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid)
  return res.status(201).json({ item })
})

app.patch('/api/collections/:id/items/:itemId', requireAuth, requireMembership, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const itemId = Number(req.params.itemId)
  const current = db.prepare('SELECT * FROM items WHERE id = ? AND collection_id = ?').get(itemId, collectionId) as Record<string, unknown> | undefined
  if (!current) return res.status(404).json({ error: 'Saved image not found.' })
  const parsed = itemPatchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid image update.' })
  const p = parsed.data
  db.prepare(`
    UPDATE items SET title = ?, note = ?, canvas_x = ?, canvas_y = ?, rotation = ?
    WHERE id = ? AND collection_id = ?
  `).run(
    p.title ?? current.title,
    p.note ?? current.note,
    p.canvasX ?? current.canvas_x,
    p.canvasY ?? current.canvas_y,
    p.rotation ?? current.rotation,
    itemId,
    collectionId,
  )
  db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(collectionId)
  if (p.title !== undefined || p.note !== undefined) {
    logActivity(collectionId, `${actor(req)} edited “${String(p.title ?? current.title)}”`, req.user!.id)
  }
  return res.json({ item: db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) })
})

app.delete('/api/collections/:id/items/:itemId', requireAuth, requireMembership, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const item = db.prepare('SELECT title FROM items WHERE id = ? AND collection_id = ?').get(Number(req.params.itemId), collectionId) as { title: string } | undefined
  if (!item) return res.status(404).json({ error: 'Saved image not found.' })
  db.prepare('DELETE FROM items WHERE id = ? AND collection_id = ?').run(Number(req.params.itemId), collectionId)
  db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(collectionId)
  logActivity(collectionId, `${actor(req)} removed “${item.title}”`, req.user!.id)
  return res.status(204).end()
})

app.post('/api/collections/:id/share', requireAuth, requireMembership, requireOwner, (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const existing = db.prepare('SELECT share_token FROM collections WHERE id = ?').get(id) as { share_token: string | null }
  const token = existing.share_token ?? crypto.randomBytes(10).toString('base64url')
  db.prepare("UPDATE collections SET share_token = ?, visibility = 'public', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(token, id)
  logActivity(id, `${actor(req)} enabled public sharing`, req.user!.id)
  return res.json({ token })
})

app.delete('/api/collections/:id/share', requireAuth, requireMembership, requireOwner, (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  db.prepare("UPDATE collections SET share_token = NULL, visibility = 'private', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id)
  logActivity(id, `${actor(req)} disabled public sharing`, req.user!.id)
  return res.status(204).end()
})

app.post('/api/collections/:id/collaborators', requireAuth, requireMembership, requireOwner, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const parsed = inviteSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid account email.' })
  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(parsed.data.email) as { id: number; name: string; email: string } | undefined
  if (!user) return res.status(404).json({ error: 'No Mosaic account uses that email yet.' })
  if (user.id === req.user!.id) return res.status(400).json({ error: 'You already own this collection.' })
  const result = db.prepare(`
    INSERT OR IGNORE INTO collection_members (collection_id, user_id, role) VALUES (?, ?, 'editor')
  `).run(collectionId, user.id)
  if (result.changes === 0) return res.status(409).json({ error: 'That person already collaborates on this collection.' })
  logActivity(collectionId, `${actor(req)} added ${user.name} as an editor`, req.user!.id)
  return res.status(201).json({ collection: getCollection(collectionId, req.user!.id) })
})

app.delete('/api/collections/:id/collaborators/:userId', requireAuth, requireMembership, requireOwner, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const userId = Number(req.params.userId)
  const user = db.prepare(`
    SELECT u.name FROM collection_members m JOIN users u ON u.id = m.user_id
    WHERE m.collection_id = ? AND m.user_id = ? AND m.role = 'editor'
  `).get(collectionId, userId) as { name: string } | undefined
  if (!user) return res.status(404).json({ error: 'Collaborator not found.' })
  db.prepare("DELETE FROM collection_members WHERE collection_id = ? AND user_id = ? AND role = 'editor'").run(collectionId, userId)
  logActivity(collectionId, `${actor(req)} removed ${user.name} from collaborators`, req.user!.id)
  return res.status(204).end()
})

app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
  const notifications = db.prepare(`
    SELECT n.*, c.name AS collection_name
    FROM notifications n
    LEFT JOIN collections c ON c.id = n.collection_id
    WHERE n.user_id = ?
    ORDER BY n.id DESC
    LIMIT 30
  `).all(req.user!.id)
  return res.json({ notifications })
})

app.post('/api/notifications/read', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE user_id = ?').run(req.user!.id)
  return res.status(204).end()
})

app.get('/api/shared/:token', (req, res) => {
  const row = db.prepare("SELECT id FROM collections WHERE share_token = ? AND visibility = 'public'").get(req.params.token) as { id: number } | undefined
  if (!row) return res.status(404).json({ error: 'Shared collection not found.' })
  const collection = getCollection(row.id) as Record<string, unknown>
  delete collection.collaborators
  delete collection.activity
  delete collection.role
  return res.json({ collection })
})

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong.' })
})

app.listen(port, '127.0.0.1', () => {
  console.log(`Mosaic API listening on http://127.0.0.1:${port}`)
})
