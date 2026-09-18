import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'

export const messagesRouter = Router()
messagesRouter.use(requireAuth)

function conversationFor(conversationId: number, userId: number) {
  return db.prepare(`
    SELECT c.*,
      CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END AS other_user_id,
      u.username AS other_user_username,
      u.name AS other_user_name,
      u.avatar_url AS other_user_avatar
    FROM conversations c
    JOIN users u ON u.id = CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END
    WHERE c.id = ? AND (c.user_a_id = ? OR c.user_b_id = ?)
  `).get(userId, userId, conversationId, userId, userId) as Record<string, unknown> | undefined
}

messagesRouter.get('/', (req: AuthedRequest, res) => {
  const userId = req.user!.id
  const conversations = db.prepare(`
    SELECT c.id, c.created_at, c.updated_at,
      u.id AS other_user_id, u.username AS other_user_username, u.name AS other_user_name, u.avatar_url AS other_user_avatar,
      (SELECT CASE
        WHEN TRIM(latest.body) != '' THEN latest.body
        WHEN latest.pin_id IS NOT NULL THEN 'Sent a pin'
        ELSE ''
      END FROM messages latest WHERE latest.conversation_id = c.id ORDER BY latest.id DESC LIMIT 1) AS last_message,
      (SELECT created_at FROM messages latest WHERE latest.conversation_id = c.id ORDER BY latest.id DESC LIMIT 1) AS last_message_at,
      (SELECT COUNT(*) FROM messages unread WHERE unread.conversation_id = c.id AND unread.sender_id != ? AND unread.read_at IS NULL) AS unread_count
    FROM conversations c
    JOIN users u ON u.id = CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END
    WHERE c.user_a_id = ? OR c.user_b_id = ?
    ORDER BY COALESCE(last_message_at, c.updated_at) DESC, c.id DESC
    LIMIT 100
  `).all(userId, userId, userId, userId)
  return res.json({ conversations })
})

messagesRouter.post('/with/:userId', (req: AuthedRequest, res) => {
  const otherUserId = Number(req.params.userId)
  if (!Number.isSafeInteger(otherUserId) || otherUserId <= 0 || otherUserId === req.user!.id) return res.status(400).json({ error: 'Choose another Mosaic user.' })
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(otherUserId)) return res.status(404).json({ error: 'Profile not found.' })
  const userA = Math.min(req.user!.id, otherUserId)
  const userB = Math.max(req.user!.id, otherUserId)
  db.prepare('INSERT OR IGNORE INTO conversations (user_a_id, user_b_id) VALUES (?, ?)').run(userA, userB)
  const conversation = db.prepare('SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ?').get(userA, userB) as { id: number }
  return res.json({ conversationId: conversation.id })
})

messagesRouter.get('/:id', (req: AuthedRequest, res) => {
  const conversationId = Number(req.params.id)
  if (!Number.isSafeInteger(conversationId)) return res.status(400).json({ error: 'Invalid conversation.' })
  const conversation = conversationFor(conversationId, req.user!.id)
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' })
  const messages = db.prepare(`
    SELECT m.id, m.conversation_id, m.sender_id, m.body, m.pin_id, m.read_at, m.created_at,
      u.name AS sender_name, u.avatar_url AS sender_avatar,
      CASE WHEN pin_collection.visibility = 'public' AND pin_collection.share_token IS NOT NULL THEN pin.title END AS pin_title,
      CASE WHEN pin_collection.visibility = 'public' AND pin_collection.share_token IS NOT NULL THEN pin.image_url END AS pin_image_url
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN items pin ON pin.id = m.pin_id
    LEFT JOIN collections pin_collection ON pin_collection.id = pin.collection_id
    WHERE m.conversation_id = ?
    ORDER BY m.id ASC
    LIMIT 500
  `).all(conversationId)
  return res.json({ conversation, messages })
})

messagesRouter.post('/:id', (req: AuthedRequest, res) => {
  const conversationId = Number(req.params.id)
  if (!Number.isSafeInteger(conversationId)) return res.status(400).json({ error: 'Invalid conversation.' })
  if (!conversationFor(conversationId, req.user!.id)) return res.status(404).json({ error: 'Conversation not found.' })
  const parsed = z.object({ body: z.string().trim().max(1200).default(''), pinId: z.number().int().positive().optional() }).safeParse(req.body)
  if (!parsed.success || (!parsed.data.body && !parsed.data.pinId)) return res.status(400).json({ error: 'Write a message or attach a pin.' })
  if (parsed.data.pinId && !db.prepare("SELECT i.id FROM items i JOIN collections c ON c.id = i.collection_id WHERE i.id = ? AND c.visibility = 'public' AND c.share_token IS NOT NULL").get(parsed.data.pinId)) {
    return res.status(400).json({ error: 'That pin is no longer available to share.' })
  }
  const message = db.transaction(() => {
    const result = db.prepare('INSERT INTO messages (conversation_id, sender_id, body, pin_id) VALUES (?, ?, ?, ?)').run(conversationId, req.user!.id, parsed.data.body, parsed.data.pinId ?? null)
    db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(conversationId)
    return db.prepare(`
      SELECT m.id, m.conversation_id, m.sender_id, m.body, m.pin_id, m.read_at, m.created_at,
        u.name AS sender_name, u.avatar_url AS sender_avatar,
        CASE WHEN pin_collection.visibility = 'public' AND pin_collection.share_token IS NOT NULL THEN pin.title END AS pin_title,
        CASE WHEN pin_collection.visibility = 'public' AND pin_collection.share_token IS NOT NULL THEN pin.image_url END AS pin_image_url
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN items pin ON pin.id = m.pin_id
      LEFT JOIN collections pin_collection ON pin_collection.id = pin.collection_id
      WHERE m.id = ?
    `).get(result.lastInsertRowid)
  })()
  return res.status(201).json({ message })
})

messagesRouter.post('/:id/read', (req: AuthedRequest, res) => {
  const conversationId = Number(req.params.id)
  if (!Number.isSafeInteger(conversationId) || !conversationFor(conversationId, req.user!.id)) return res.status(404).json({ error: 'Conversation not found.' })
  db.prepare('UPDATE messages SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE conversation_id = ? AND sender_id != ?').run(conversationId, req.user!.id)
  return res.status(204).end()
})
