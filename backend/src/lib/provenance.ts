import { db } from '../db.js'

const MAX_LINEAGE_DEPTH = 50

export function recordRepinLineage(itemId: number, sourceItemId: number) {
  const ancestors = db.prepare(`
    SELECT ancestor_item_id
    FROM item_lineage
    WHERE item_id = ?
    ORDER BY depth ASC
    LIMIT ?
  `).all(sourceItemId, MAX_LINEAGE_DEPTH - 1) as Array<{ ancestor_item_id: number }>
  const chain = [sourceItemId, ...ancestors.map((entry) => entry.ancestor_item_id)]
  const seen = new Set<number>()
  const insert = db.prepare('INSERT INTO item_lineage (item_id, ancestor_item_id, depth) VALUES (?, ?, ?)')
  let depth = 1
  for (const ancestorId of chain) {
    if (ancestorId === itemId || seen.has(ancestorId)) continue
    seen.add(ancestorId)
    insert.run(itemId, ancestorId, depth)
    depth += 1
    if (depth > MAX_LINEAGE_DEPTH) break
  }
}

export function copyItemLineage(sourceItemId: number, itemId: number) {
  db.prepare(`
    INSERT INTO item_lineage (item_id, ancestor_item_id, depth)
    SELECT ?, ancestor_item_id, depth
    FROM item_lineage
    WHERE item_id = ?
    ORDER BY depth ASC
  `).run(itemId, sourceItemId)
}

export function provenanceForViewer(itemId: number, viewerId?: number) {
  const totalDepth = (db.prepare('SELECT COUNT(*) AS count FROM item_lineage WHERE item_id = ?').get(itemId) as { count: number }).count
  if (!totalDepth) return { ancestors: [], hidden_count: 0, total_depth: 0 }
  const userId = viewerId ?? -1
  const ancestors = db.prepare(`
    SELECT l.depth, i.id AS pin_id, c.id AS collection_id, c.name AS collection_name, c.share_token,
      u.id AS owner_id, u.username AS owner_username, u.name AS owner_name, u.avatar_url AS owner_avatar
    FROM item_lineage l
    JOIN items i ON i.id = l.ancestor_item_id
    JOIN collections c ON c.id = i.collection_id
    JOIN collection_members owner ON owner.collection_id = c.id AND owner.role = 'owner'
    JOIN users u ON u.id = owner.user_id
    WHERE l.item_id = ? AND (
      (c.audience = 'public' AND c.share_token IS NOT NULL)
      OR EXISTS (
        SELECT 1 FROM collection_members mine
        WHERE mine.collection_id = c.id AND mine.user_id = ?
      )
      OR (
        c.audience = 'followers' AND c.share_token IS NOT NULL AND EXISTS (
          SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = owner.user_id
        )
      )
    )
    ORDER BY l.depth ASC
  `).all(itemId, userId, userId)
  return { ancestors, hidden_count: Math.max(0, totalDepth - ancestors.length), total_depth: totalDepth }
}
