import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import {
  clearSession,
  passwordHash,
  requireAuth,
  safePasswordEqual,
  setSession,
  type AuthedRequest,
  type User,
} from '../middleware/auth.js'

export const authRouter = Router()

const authSchema = z.object({
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(6).max(128),
})

const registerSchema = authSchema.extend({
  name: z.string().trim().min(2).max(80),
})

authRouter.post('/register', (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid name, email, and password.' })
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email)) {
    return res.status(409).json({ error: 'An account already exists with that email.' })
  }
  const user = db.transaction(() => {
    const salt = crypto.randomBytes(16).toString('hex')
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)
    `).run(parsed.data.name, parsed.data.email, passwordHash(parsed.data.password, salt), salt)
    const userId = Number(result.lastInsertRowid)
    setSession(res, userId)
    return db.prepare('SELECT id, name, email, bio, avatar_url, created_at FROM users WHERE id = ?').get(userId)
  })()
  return res.status(201).json({ user })
})

authRouter.post('/login', (req, res) => {
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
  return res.json({ user: { id: account.id, name: account.name, email: account.email, bio: account.bio, avatar_url: account.avatar_url, created_at: account.created_at } })
})

authRouter.post('/demo', (_req, res) => {
  const user = db.prepare("SELECT id, name, email, bio, avatar_url, created_at FROM users WHERE email = 'demo@mosaic.local'").get() as User
  setSession(res, user.id)
  return res.json({ user })
})

authRouter.post('/logout', (req, res) => {
  clearSession(req, res)
  return res.status(204).end()
})

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => res.json({ user: req.user }))
