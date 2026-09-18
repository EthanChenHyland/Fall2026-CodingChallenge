import { db } from '../db.js'

type Item = { id: number; collection_id: number; source_id: string; title: string; section_id: number | null } & Record<string, string | number | null>
type Snapshot = { item: Item; likes: Array<{ user_id: number; created_at: string }>; comments: Array<{ id: number; user_id: number; body: string; parent_id: number | null; created_at: string }>; lineage: Array<{ ancestor_item_id: number; depth: number }>; cover: boolean }

export function snapshotItem(itemId: number, collectionId: number) {
  db.prepare('DELETE FROM deleted_items WHERE expires_at < ?').run(Date.now())
  const item = db.prepare('SELECT * FROM items WHERE id = ? AND collection_id = ?').get(itemId, collectionId)
  const likes = db.prepare('SELECT * FROM item_likes WHERE item_id = ?').all(itemId)
  const comments = db.prepare('SELECT * FROM comments WHERE item_id = ?').all(itemId)
  const lineage = db.prepare('SELECT ancestor_item_id, depth FROM item_lineage WHERE item_id = ? ORDER BY depth ASC').all(itemId)
  const cover = Boolean(db.prepare('SELECT 1 FROM collections WHERE id = ? AND cover_item_id = ?').get(collectionId, itemId))
  db.prepare('INSERT OR REPLACE INTO deleted_items VALUES (?, ?, ?, ?)').run(itemId, collectionId, JSON.stringify({ item, likes, comments, lineage, cover }), Date.now() + 10 * 60_000)
}

export function restoreSnapshot(collectionId: number, itemId: number): Item | 'duplicate' | null {
  return db.transaction(() => {
    const row = db.prepare('SELECT snapshot FROM deleted_items WHERE item_id = ? AND collection_id = ? AND expires_at > ?').get(itemId, collectionId, Date.now()) as { snapshot: string } | undefined
    if (!row) return null
    const { item, likes, comments, lineage = [], cover } = JSON.parse(row.snapshot) as Snapshot
    if (db.prepare('SELECT 1 FROM items WHERE collection_id = ? AND source_id = ?').get(collectionId, item.source_id)) return 'duplicate' as const
    db.prepare(`INSERT INTO items (id, collection_id, source_id, image_url, source_page, source_creator, title, note, tags, section_id, canvas_x, canvas_y, rotation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(item.id, collectionId, item.source_id, item.image_url, item.source_page, item.source_creator, item.title, item.note, item.tags, item.section_id, item.canvas_x, item.canvas_y, item.rotation, item.created_at)
    for (const ancestor of lineage) db.prepare('INSERT INTO item_lineage (item_id, ancestor_item_id, depth) VALUES (?, ?, ?)').run(itemId, ancestor.ancestor_item_id, ancestor.depth)
    for (const like of likes) db.prepare('INSERT INTO item_likes (item_id, user_id, created_at) SELECT ?, id, ? FROM users WHERE id = ?').run(itemId, like.created_at, like.user_id)
    for (const comment of comments) db.prepare('INSERT INTO comments (id, item_id, user_id, body, parent_id, created_at) SELECT ?, ?, id, ?, ?, ? FROM users WHERE id = ?').run(comment.id, itemId, comment.body, comment.parent_id, comment.created_at, comment.user_id)
    db.prepare('UPDATE collections SET cover_item_id = CASE WHEN ? AND cover_item_id IS NULL THEN ? ELSE cover_item_id END, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(cover), itemId, collectionId)
    db.prepare('DELETE FROM deleted_items WHERE item_id = ?').run(itemId)
    return item
  })()
}
