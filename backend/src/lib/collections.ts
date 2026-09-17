import { db } from '../db.js'
import { membership, type AuthedRequest } from '../middleware/auth.js'

export const collectionSelect = `
  SELECT c.*,
    COUNT(DISTINCT i.id) AS item_count,
    (SELECT image_url FROM items WHERE collection_id = c.id ORDER BY id DESC LIMIT 1) AS cover_url
  FROM collections c
  LEFT JOIN items i ON i.collection_id = c.id
`

export function getCollection(id: number, userId?: number) {
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
