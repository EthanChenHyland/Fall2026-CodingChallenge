import { db } from '../db.js'
import { membership, type AuthedRequest } from '../middleware/auth.js'

export const collectionSelect = `
  SELECT c.*,
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
`

export function normalizeCollectionRow(row: Record<string, unknown>) {
  const raw = typeof row.cover_urls_json === 'string' ? row.cover_urls_json : '[]'
  let coverUrls: string[] = []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) coverUrls = parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    coverUrls = row.cover_url && typeof row.cover_url === 'string' ? [row.cover_url] : []
  }
  const { cover_urls_json: _coverUrlsJson, ...clean } = row
  return { ...clean, cover_urls: coverUrls }
}

export function getCollection(id: number, userId?: number) {
  const row = db.prepare(`${collectionSelect} WHERE c.id = ? GROUP BY c.id`).get(id) as Record<string, unknown> | undefined
  const collection = row ? normalizeCollectionRow(row) : undefined
  if (!collection) return null
  const items = db.prepare(`
    SELECT i.*,
      (SELECT COUNT(*) FROM item_likes likes WHERE likes.item_id = i.id) AS like_count,
      (SELECT COUNT(*) FROM comments comments WHERE comments.item_id = i.id) AS comment_count
    FROM items i
    WHERE i.collection_id = ?
    ORDER BY i.id DESC
  `).all(id)
  const activity = db.prepare('SELECT * FROM activity WHERE collection_id = ? ORDER BY id DESC LIMIT 20').all(id)
  const sections = db.prepare('SELECT * FROM collection_sections WHERE collection_id = ? ORDER BY position ASC, id ASC').all(id)
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
    sections,
    activity,
    collaborators,
  }
}

export function logActivity(collectionId: number, message: string, actorUserId?: number) {
  db.prepare('INSERT INTO activity (collection_id, message) VALUES (?, ?)').run(collectionId, message)
  if (!actorUserId) return
  db.prepare(`
    INSERT INTO notifications (user_id, collection_id, message)
    SELECT user_id, ?, ?
    FROM collection_members
    WHERE collection_id = ? AND user_id != ?
  `).run(collectionId, message, collectionId, actorUserId)
}

export function actor(req: AuthedRequest) {
  return req.user?.name ?? 'Someone'
}
