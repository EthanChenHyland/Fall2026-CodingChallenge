import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { imageUrlSchema, sourceUrlSchema } from '../lib/urls.js'
import { persistProviderImage } from '../lib/media.js'
import { snapshotItem, restoreSnapshot } from '../lib/restore.js'
import { actor, getCollection, logActivity, normalizeCollectionRow } from '../lib/collections.js'
import {
  requireAuth,
  requireMembership,
  requireOwner,
  type AuthedRequest,
} from '../middleware/auth.js'

export const collectionsRouter = Router()
collectionsRouter.use(requireAuth)

const collectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).optional().default(''),
})

const itemSchema = z.object({
  sourceId: z.string().min(1).max(200),
  imageUrl: imageUrlSchema,
  sourcePage: sourceUrlSchema.optional().default(''),
  sourceCreator: z.string().max(120).optional().default(''),
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).optional().default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).optional().default([]),
})

const itemPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(500).optional(),
  tags: z.string().trim().max(240).optional(),
  canvasX: z.number().finite().min(0).max(5000).optional(),
  canvasY: z.number().finite().min(0).max(5000).optional(),
  rotation: z.number().min(-12).max(12).optional(),
})

const inviteSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
})

const sectionSchema = z.object({ name: z.string().trim().min(1).max(80) })

collectionsRouter.get('/', (req: AuthedRequest, res) => {
  const rows = db.prepare(`
    SELECT c.*,
      member.role AS role,
      COUNT(DISTINCT i.id) AS item_count,
      COALESCE(
        (SELECT image_url FROM items WHERE id = c.cover_item_id AND collection_id = c.id),
        (SELECT image_url FROM items WHERE collection_id = c.id ORDER BY id DESC LIMIT 1)
      ) AS cover_url,
      (
        SELECT json_group_array(image_url)
        FROM (
          SELECT image_url
          FROM items AS cover_items
          WHERE cover_items.collection_id = c.id
          ORDER BY CASE WHEN cover_items.id = c.cover_item_id THEN 0 ELSE 1 END, cover_items.id DESC
          LIMIT 4
        )
      ) AS cover_urls_json
    FROM collections c
    LEFT JOIN items i ON i.collection_id = c.id
    JOIN collection_members member ON member.collection_id = c.id AND member.user_id = ?
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `).all(req.user!.id) as Array<Record<string, unknown>>
  const collections = rows.map(normalizeCollectionRow)
  res.json({ collections })
})

collectionsRouter.get('/smart/:view', (req: AuthedRequest, res) => {
  const view = String(req.params.view)
  if (!['recent', 'popular', 'unsorted'].includes(view)) return res.status(404).json({ error: 'Smart view not found.' })
  const where = view === 'unsorted' ? "AND TRIM(i.note) = '' AND TRIM(i.tags) = ''" : ''
  const order = view === 'popular'
    ? 'like_count DESC, comment_count DESC, i.created_at DESC'
    : 'i.created_at DESC'
  const items = db.prepare(`
    SELECT i.*, c.name AS collection_name,
      (SELECT COUNT(*) FROM item_likes likes WHERE likes.item_id = i.id) AS like_count,
      (SELECT COUNT(*) FROM comments comments WHERE comments.item_id = i.id) AS comment_count
    FROM items i
    JOIN collections c ON c.id = i.collection_id
    JOIN collection_members m ON m.collection_id = c.id AND m.user_id = ?
    WHERE 1 = 1 ${where}
    ORDER BY ${order}
    LIMIT 60
  `).all(req.user!.id)
  res.json({ view, items })
})

collectionsRouter.post('/', (req: AuthedRequest, res) => {
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
  res.status(201).json({ collection: getCollection(id, req.user!.id) })
})

collectionsRouter.get('/:id', requireMembership, (req: AuthedRequest, res) => {
  res.json({ collection: getCollection(Number(req.params.id), req.user!.id) })
})

collectionsRouter.patch('/:id', requireMembership, (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const existing = getCollection(id, req.user!.id) as Record<string, unknown>
  const schema = collectionSchema.partial().extend({
    visibility: z.enum(['private', 'public']).optional(),
    audience: z.enum(['private', 'followers', 'public']).optional(),
    coverItemId: z.number().int().positive().nullable().optional(),
    coverFocusX: z.number().min(0).max(100).optional(),
    coverFocusY: z.number().min(0).max(100).optional(),
    theme: z.enum(['paper', 'sage', 'clay', 'slate']).optional(),
    gridLayout: z.enum(['gallery', 'compact', 'masonry']).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid collection update.' })
  if ((parsed.data.visibility || parsed.data.audience) && res.locals.membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can change collection visibility.' })
  }
  if (parsed.data.coverItemId != null) {
    const coverItem = db.prepare('SELECT id FROM items WHERE id = ? AND collection_id = ?').get(parsed.data.coverItemId, id)
    if (!coverItem) return res.status(400).json({ error: 'Choose an image from this collection for the cover.' })
  }
  const requestedAudience = parsed.data.audience
    ?? parsed.data.visibility
    ?? String(existing.audience ?? existing.visibility ?? 'private') as 'private' | 'followers' | 'public'
  const next = { ...existing, ...parsed.data }
  const visibility = requestedAudience === 'public' ? 'public' : 'private'
  const shareToken = requestedAudience === 'private' ? null : existing.share_token ?? crypto.randomBytes(16).toString('base64url')
  const coverItemId = parsed.data.coverItemId === undefined ? existing.cover_item_id : parsed.data.coverItemId
  const coverFocusX = parsed.data.coverFocusX ?? Number(existing.cover_focus_x ?? 50)
  const coverFocusY = parsed.data.coverFocusY ?? Number(existing.cover_focus_y ?? 50)
  const theme = parsed.data.theme ?? String(existing.theme ?? 'paper')
  const gridLayout = parsed.data.gridLayout ?? String(existing.grid_layout ?? 'gallery')
  db.transaction(() => {
    db.prepare(`
      UPDATE collections
      SET name = ?, description = ?, visibility = ?, audience = ?, share_token = ?, cover_item_id = ?, cover_focus_x = ?, cover_focus_y = ?, theme = ?, grid_layout = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(next.name, next.description, visibility, requestedAudience, shareToken, coverItemId, coverFocusX, coverFocusY, theme, gridLayout, id)
    logActivity(id, `${actor(req)} updated collection details`, req.user!.id)
  })()
  res.json({ collection: getCollection(id, req.user!.id) })
})

collectionsRouter.delete('/:id', requireMembership, requireOwner, (req, res) => {
  db.prepare('DELETE FROM collections WHERE id = ?').run(Number(req.params.id))
  res.status(204).end()
})

collectionsRouter.post('/:id/sections', requireMembership, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const parsed = sectionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Give the section a name.' })
  const position = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM collection_sections WHERE collection_id = ?').get(collectionId) as { next: number }).next
  const section = db.transaction(() => {
    const result = db.prepare('INSERT INTO collection_sections (collection_id, name, position) VALUES (?, ?, ?)').run(collectionId, parsed.data.name, position)
    db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(collectionId)
    logActivity(collectionId, `${actor(req)} created section “${parsed.data.name}”`, req.user!.id)
    return db.prepare('SELECT * FROM collection_sections WHERE id = ?').get(result.lastInsertRowid)
  })()
  return res.status(201).json({ section })
})

collectionsRouter.patch('/:id/sections/:sectionId', requireMembership, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const sectionId = Number(req.params.sectionId)
  const parsed = sectionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Give the section a name.' })
  const current = db.prepare('SELECT id FROM collection_sections WHERE id = ? AND collection_id = ?').get(sectionId, collectionId)
  if (!current) return res.status(404).json({ error: 'Section not found.' })
  db.transaction(() => {
    db.prepare('UPDATE collection_sections SET name = ? WHERE id = ? AND collection_id = ?').run(parsed.data.name, sectionId, collectionId)
    db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(collectionId)
    logActivity(collectionId, `${actor(req)} renamed a section to “${parsed.data.name}”`, req.user!.id)
  })()
  return res.json({ section: db.prepare('SELECT * FROM collection_sections WHERE id = ?').get(sectionId) })
})

collectionsRouter.delete('/:id/sections/:sectionId', requireMembership, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const sectionId = Number(req.params.sectionId)
  const section = db.prepare('SELECT name FROM collection_sections WHERE id = ? AND collection_id = ?').get(sectionId, collectionId) as { name: string } | undefined
  if (!section) return res.status(404).json({ error: 'Section not found.' })
  db.transaction(() => {
    db.prepare('UPDATE items SET section_id = NULL WHERE collection_id = ? AND section_id = ?').run(collectionId, sectionId)
    db.prepare('DELETE FROM collection_sections WHERE id = ? AND collection_id = ?').run(sectionId, collectionId)
    db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(collectionId)
    logActivity(collectionId, `${actor(req)} removed section “${section.name}”`, req.user!.id)
  })()
  return res.status(204).end()
})

collectionsRouter.post('/:id/items', requireMembership, async (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const parsed = itemSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid image.' })
  const p = parsed.data
  const duplicate = db.prepare('SELECT id FROM items WHERE collection_id = ? AND source_id = ?').get(collectionId, p.sourceId)
  if (duplicate) return res.status(409).json({ error: 'That pin is already in this collection.' })
  let persistedImage: Awaited<ReturnType<typeof persistProviderImage>>
  try { persistedImage = await persistProviderImage(p.imageUrl) }
  catch { return res.status(502).json({ error: 'Could not store this image. Please try again.' }) }
  // Recheck access and duplicates after the asynchronous provider download.
  if (!db.prepare('SELECT 1 FROM collection_members WHERE collection_id = ? AND user_id = ?').get(collectionId, req.user!.id)) {
    persistedImage.discard()
    return res.status(404).json({ error: 'Collection not found.' })
  }
  if (db.prepare('SELECT 1 FROM items WHERE collection_id = ? AND source_id = ?').get(collectionId, p.sourceId)) {
    persistedImage.discard()
    return res.status(409).json({ error: 'That pin is already in this collection.' })
  }
  const offset = (db.prepare('SELECT COUNT(*) AS count FROM items WHERE collection_id = ?').get(collectionId) as { count: number }).count
  let item: unknown
  try {
    item = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO items (collection_id, source_id, image_url, source_page, source_creator, title, note, tags, canvas_x, canvas_y, rotation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(collectionId, p.sourceId, persistedImage.imageUrl, p.sourcePage, p.sourceCreator, p.title, p.note, p.tags.join(', '), 36 + (offset % 3) * 220, Math.min(5000, 40 + Math.floor(offset / 3) * 250), (offset % 3 - 1) * 2)
      db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(collectionId)
      logActivity(collectionId, `${actor(req)} saved “${p.title}”`, req.user!.id)
      return db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid)
    })()
  } catch (error) {
    persistedImage.discard()
    throw error
  }
  res.status(201).json({ item })
})

collectionsRouter.patch('/:id/items/:itemId', requireMembership, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const itemId = Number(req.params.itemId)
  const current = db.prepare('SELECT * FROM items WHERE id = ? AND collection_id = ?').get(itemId, collectionId) as Record<string, unknown> | undefined
  if (!current) return res.status(404).json({ error: 'Saved image not found.' })
  const parsed = itemPatchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid image update.' })
  const p = parsed.data
  const item = db.transaction(() => {
    db.prepare(`
      UPDATE items SET title = ?, note = ?, tags = ?, canvas_x = ?, canvas_y = ?, rotation = ?
      WHERE id = ? AND collection_id = ?
    `).run(
      p.title ?? current.title,
      p.note ?? current.note,
      p.tags ?? current.tags,
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
    return db.prepare('SELECT * FROM items WHERE id = ?').get(itemId)
  })()
  res.json({ item })
})

collectionsRouter.post('/:id/items/restore', requireMembership, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const itemId = Number(req.body.itemId)
  if (!Number.isSafeInteger(itemId)) return res.status(400).json({ error: 'Invalid saved pin.' })
  const result = db.transaction(() => {
    const restored = restoreSnapshot(collectionId, itemId)
    if (restored && restored !== 'duplicate') logActivity(collectionId, `${actor(req)} restored “${restored.title}”`, req.user!.id)
    return restored
  })()
  if (!result) return res.status(410).json({ error: 'Undo has expired or this pin was already restored.' })
  if (result === 'duplicate') return res.status(409).json({ error: 'That pin is already in this collection.' })
  return res.status(201).json({ item: result })
})

// Layout changes are validated together and committed in one SQLite transaction.
collectionsRouter.patch('/:id/layout', requireMembership, (req: AuthedRequest, res) => {
  const parsed = z.object({ positions: z.array(z.object({
    itemId: z.number().int().positive(),
    x: z.number().finite().min(0).max(5000),
    y: z.number().finite().min(0).max(5000),
    rotation: z.number().finite().min(-12).max(12),
  })).min(1).max(1000) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid canvas layout.' })
  const collectionId = Number(req.params.id)
  const positions = parsed.data.positions
  if (positions.some((p) => !db.prepare('SELECT 1 FROM items WHERE id = ? AND collection_id = ?').get(p.itemId, collectionId))) return res.status(404).json({ error: 'A pin is no longer in this collection. Reload and try again.' })
  db.transaction(() => {
    const update = db.prepare('UPDATE items SET canvas_x = ?, canvas_y = ?, rotation = ? WHERE id = ? AND collection_id = ?')
    for (const p of positions) update.run(p.x, p.y, p.rotation, p.itemId, collectionId)
    db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(collectionId)
    logActivity(collectionId, `${actor(req)} arranged ${positions.length} canvas ${positions.length === 1 ? 'pin' : 'pins'}`, req.user!.id)
  })()
  return res.status(204).end()
})

const bulkSchema = z.object({
  action: z.enum(['delete', 'move', 'copy', 'section']),
  itemIds: z.array(z.number().int().positive()).min(1).max(100),
  targetCollectionId: z.number().int().positive().optional(),
  sectionId: z.number().int().positive().nullable().optional(),
})

collectionsRouter.post('/:id/items/bulk', requireMembership, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const parsed = bulkSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose one or more saved pins.' })
  const ids = [...new Set(parsed.data.itemIds)]
  const placeholders = ids.map(() => '?').join(',')
  const items = db.prepare(`SELECT * FROM items WHERE collection_id = ? AND id IN (${placeholders})`).all(collectionId, ...ids) as Array<Record<string, unknown>>
  if (items.length !== ids.length) return res.status(404).json({ error: 'One or more pins are no longer in this collection.' })

  if (parsed.data.action === 'delete') {
    const removeMany = db.transaction(() => {
      for (const item of items) snapshotItem(Number(item.id), collectionId)
      db.prepare(`DELETE FROM items WHERE collection_id = ? AND id IN (${placeholders})`).run(collectionId, ...ids)
      db.prepare(`UPDATE collections SET cover_item_id = CASE WHEN cover_item_id IN (${placeholders}) THEN NULL ELSE cover_item_id END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...ids, collectionId)
      logActivity(collectionId, `${actor(req)} removed ${ids.length} saved ${ids.length === 1 ? 'pin' : 'pins'}`, req.user!.id)
    })
    removeMany()
    return res.json({ items })
  }

  if (parsed.data.action === 'section') {
    const sectionId = parsed.data.sectionId ?? null
    if (sectionId !== null && !db.prepare('SELECT id FROM collection_sections WHERE id = ? AND collection_id = ?').get(sectionId, collectionId)) {
      return res.status(404).json({ error: 'Section not found.' })
    }
    db.transaction(() => {
      db.prepare(`UPDATE items SET section_id = ? WHERE collection_id = ? AND id IN (${placeholders})`).run(sectionId, collectionId, ...ids)
      db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(collectionId)
      logActivity(collectionId, `${actor(req)} organized ${ids.length} ${ids.length === 1 ? 'pin' : 'pins'} into ${sectionId === null ? 'Unsorted' : 'a section'}`, req.user!.id)
    })()
    return res.json({ items: db.prepare(`SELECT * FROM items WHERE collection_id = ? AND id IN (${placeholders})`).all(collectionId, ...ids) })
  }

  const targetId = parsed.data.targetCollectionId
  if (!targetId || targetId === collectionId) return res.status(400).json({ error: 'Choose a different collection.' })
  const targetMember = db.prepare('SELECT role FROM collection_members WHERE collection_id = ? AND user_id = ?').get(targetId, req.user!.id)
  if (!targetMember) return res.status(403).json({ error: 'You can’t add pins to that collection.' })
  const duplicate = items.find((item) => db.prepare('SELECT id FROM items WHERE collection_id = ? AND source_id = ?').get(targetId, item.source_id))
  if (duplicate) return res.status(409).json({ error: 'One of those pins is already in the destination collection.' })

  if (parsed.data.action === 'copy') {
    const copied = db.transaction(() => {
      const startOffset = (db.prepare('SELECT COUNT(*) AS count FROM items WHERE collection_id = ?').get(targetId) as { count: number }).count
      const insert = db.prepare(`
        INSERT INTO items (collection_id, source_id, image_url, source_page, source_creator, title, note, tags, section_id, canvas_x, canvas_y, rotation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
      `)
      const created = items.map((item, index) => {
        const offset = startOffset + index
        const result = insert.run(
          targetId, item.source_id, item.image_url, item.source_page, item.source_creator, item.title, item.note, item.tags,
          36 + (offset % 3) * 220, Math.min(5000, 40 + Math.floor(offset / 3) * 250), (offset % 3 - 1) * 2,
        )
        return db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid)
      })
      db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(targetId)
      logActivity(collectionId, `${actor(req)} copied ${ids.length} ${ids.length === 1 ? 'pin' : 'pins'} to another collection`, req.user!.id)
      logActivity(targetId, `${actor(req)} copied ${ids.length} ${ids.length === 1 ? 'pin' : 'pins'} into this collection`, req.user!.id)
      return created
    })()
    return res.json({ items: copied })
  }

  const moveMany = db.transaction(() => {
    db.prepare(`UPDATE items SET collection_id = ? WHERE collection_id = ? AND id IN (${placeholders})`).run(targetId, collectionId, ...ids)
    db.prepare(`UPDATE collections SET cover_item_id = CASE WHEN cover_item_id IN (${placeholders}) THEN NULL ELSE cover_item_id END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...ids, collectionId)
    db.prepare('UPDATE collections SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(targetId)
    logActivity(collectionId, `${actor(req)} moved ${ids.length} ${ids.length === 1 ? 'pin' : 'pins'} to another collection`, req.user!.id)
    logActivity(targetId, `${actor(req)} moved ${ids.length} ${ids.length === 1 ? 'pin' : 'pins'} into this collection`, req.user!.id)
  })
  moveMany()
  return res.json({ items })
})

collectionsRouter.delete('/:id/items/:itemId', requireMembership, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const item = db.prepare('SELECT title FROM items WHERE id = ? AND collection_id = ?').get(Number(req.params.itemId), collectionId) as { title: string } | undefined
  if (!item) return res.status(404).json({ error: 'Saved image not found.' })
  db.transaction(() => {
    snapshotItem(Number(req.params.itemId), collectionId)
    db.prepare('DELETE FROM items WHERE id = ? AND collection_id = ?').run(Number(req.params.itemId), collectionId)
    db.prepare('UPDATE collections SET cover_item_id = CASE WHEN cover_item_id = ? THEN NULL ELSE cover_item_id END, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(req.params.itemId), collectionId)
    logActivity(collectionId, `${actor(req)} removed “${item.title}”`, req.user!.id)
  })()
  res.status(204).end()
})

collectionsRouter.post('/:id/share', requireMembership, requireOwner, (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const existing = db.prepare('SELECT share_token FROM collections WHERE id = ?').get(id) as { share_token: string | null }
  const token = existing.share_token ?? crypto.randomBytes(16).toString('base64url')
  db.transaction(() => {
    db.prepare("UPDATE collections SET share_token = ?, visibility = 'public', audience = 'public', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(token, id)
    logActivity(id, `${actor(req)} enabled public sharing`, req.user!.id)
  })()
  res.json({ token })
})

collectionsRouter.delete('/:id/share', requireMembership, requireOwner, (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  db.transaction(() => {
    db.prepare("UPDATE collections SET share_token = NULL, visibility = 'private', audience = 'private', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id)
    logActivity(id, `${actor(req)} disabled public sharing`, req.user!.id)
  })()
  res.status(204).end()
})

collectionsRouter.post('/:id/collaborators', requireMembership, requireOwner, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const parsed = inviteSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid account email.' })
  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(parsed.data.email) as { id: number; name: string; email: string } | undefined
  if (!user) return res.status(404).json({ error: 'No Mosaic account uses that email yet.' })
  if (user.id === req.user!.id) return res.status(400).json({ error: 'You already own this collection.' })
  const result = db.transaction(() => {
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO collection_members (collection_id, user_id, role) VALUES (?, ?, 'editor')
    `).run(collectionId, user.id)
    if (inserted.changes) logActivity(collectionId, `${actor(req)} added ${user.name} as an editor`, req.user!.id)
    return inserted
  })()
  if (result.changes === 0) return res.status(409).json({ error: 'That person already collaborates on this collection.' })
  res.status(201).json({ collection: getCollection(collectionId, req.user!.id) })
})

collectionsRouter.delete('/:id/collaborators/:userId', requireMembership, requireOwner, (req: AuthedRequest, res) => {
  const collectionId = Number(req.params.id)
  const userId = Number(req.params.userId)
  const user = db.prepare(`
    SELECT u.name FROM collection_members m JOIN users u ON u.id = m.user_id
    WHERE m.collection_id = ? AND m.user_id = ? AND m.role = 'editor'
  `).get(collectionId, userId) as { name: string } | undefined
  if (!user) return res.status(404).json({ error: 'Collaborator not found.' })
  db.transaction(() => {
    db.prepare("DELETE FROM collection_members WHERE collection_id = ? AND user_id = ? AND role = 'editor'").run(collectionId, userId)
    logActivity(collectionId, `${actor(req)} removed ${user.name} from collaborators`, req.user!.id)
  })()
  res.status(204).end()
})
