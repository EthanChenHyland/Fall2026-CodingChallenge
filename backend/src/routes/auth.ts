import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { createUniqueUsername, db } from '../db.js'
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

const verificationSchema = z.object({
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  code: z.string().regex(/^\d{6}$/),
})

const deleteAccountSchema = z.object({
  password: z.string().min(6).max(128),
  confirmation: z.literal('DELETE'),
})

function emailVerificationConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim())
}

function createAccount(res: Parameters<typeof setSession>[0], name: string, email: string, passwordHashValue: string, passwordSalt: string) {
  return db.transaction(() => {
    const username = createUniqueUsername(name)
    const result = db.prepare(`
      INSERT INTO users (name, username, email, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)
    `).run(name, username, email, passwordHashValue, passwordSalt)
    const userId = Number(result.lastInsertRowid)
    setSession(res, userId)
    return db.prepare('SELECT id, username, name, email, bio, avatar_url, created_at FROM users WHERE id = ?').get(userId)
  })()
}

async function sendVerificationCode(email: string, code: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject: 'Your Mosaic verification code',
      text: `Your Mosaic verification code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`)
}

authRouter.post('/register', (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid name, email, and password.' })
  if (emailVerificationConfigured()) return res.status(400).json({ error: 'Email verification is required for new accounts.' })
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email)) {
    return res.status(409).json({ error: 'An account already exists with that email.' })
  }
  const salt = crypto.randomBytes(16).toString('hex')
  const user = createAccount(res, parsed.data.name, parsed.data.email, passwordHash(parsed.data.password, salt), salt)
  return res.status(201).json({ user })
})

authRouter.post('/register/start', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid name, email, and password.' })
  db.prepare('DELETE FROM registration_verifications WHERE expires_at <= ?').run(new Date().toISOString())
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email)) {
    return res.status(409).json({ error: 'An account already exists with that email.' })
  }

  const passwordSalt = crypto.randomBytes(16).toString('hex')
  const passwordHashValue = passwordHash(parsed.data.password, passwordSalt)
  if (!emailVerificationConfigured()) {
    const user = createAccount(res, parsed.data.name, parsed.data.email, passwordHashValue, passwordSalt)
    return res.status(201).json({ verificationRequired: false, user })
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
  const codeSalt = crypto.randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
  db.prepare(`
    INSERT INTO registration_verifications (email, name, password_hash, password_salt, code_hash, code_salt, attempts, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      password_hash = excluded.password_hash,
      password_salt = excluded.password_salt,
      code_hash = excluded.code_hash,
      code_salt = excluded.code_salt,
      attempts = 0,
      expires_at = excluded.expires_at,
      created_at = CURRENT_TIMESTAMP
  `).run(parsed.data.email, parsed.data.name, passwordHashValue, passwordSalt, passwordHash(code, codeSalt), codeSalt, expiresAt)

  try {
    await sendVerificationCode(parsed.data.email, code)
  } catch (error) {
    db.prepare('DELETE FROM registration_verifications WHERE email = ?').run(parsed.data.email)
    console.error('Could not send registration verification email.', error)
    return res.status(503).json({ error: 'Could not send the verification email. Try again shortly.' })
  }
  return res.status(202).json({ verificationRequired: true, email: parsed.data.email })
})

authRouter.post('/register/verify', (req, res) => {
  const parsed = verificationSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter the 6-digit verification code.' })
  const pending = db.prepare('SELECT * FROM registration_verifications WHERE email = ?').get(parsed.data.email) as
    | { email: string; name: string; password_hash: string; password_salt: string; code_hash: string; code_salt: string; attempts: number; expires_at: string }
    | undefined
  if (!pending) return res.status(400).json({ error: 'Request a new verification code.' })
  if (pending.expires_at <= new Date().toISOString()) {
    db.prepare('DELETE FROM registration_verifications WHERE email = ?').run(parsed.data.email)
    return res.status(400).json({ error: 'That code expired. Request a new one.' })
  }
  if (pending.attempts >= 5) {
    db.prepare('DELETE FROM registration_verifications WHERE email = ?').run(parsed.data.email)
    return res.status(429).json({ error: 'Too many incorrect codes. Request a new one.' })
  }
  if (!safePasswordEqual(parsed.data.code, pending.code_salt, pending.code_hash)) {
    db.prepare('UPDATE registration_verifications SET attempts = attempts + 1 WHERE email = ?').run(parsed.data.email)
    return res.status(400).json({ error: 'That verification code is incorrect.' })
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email)) {
    db.prepare('DELETE FROM registration_verifications WHERE email = ?').run(parsed.data.email)
    return res.status(409).json({ error: 'An account already exists with that email.' })
  }
  const user = db.transaction(() => {
    const created = createAccount(res, pending.name, pending.email, pending.password_hash, pending.password_salt)
    db.prepare('DELETE FROM registration_verifications WHERE email = ?').run(pending.email)
    return created
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
  return res.json({ user: { id: account.id, username: account.username, name: account.name, email: account.email, bio: account.bio, avatar_url: account.avatar_url, created_at: account.created_at } })
})

authRouter.post('/demo', (_req, res) => {
  const user = db.prepare("SELECT id, username, name, email, bio, avatar_url, created_at FROM users WHERE email = 'demo@mosaic.local'").get() as User
  setSession(res, user.id)
  return res.json({ user })
})

authRouter.post('/logout', (req, res) => {
  clearSession(req, res)
  return res.status(204).end()
})

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => res.json({ user: req.user }))

authRouter.delete('/account', requireAuth, (req: AuthedRequest, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter your password and type DELETE to confirm.' })
  if (req.user!.email === 'demo@mosaic.local') return res.status(403).json({ error: 'The shared demo account cannot be deleted.' })

  const account = db.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').get(req.user!.id) as
    | { password_hash: string; password_salt: string }
    | undefined
  if (!account || !safePasswordEqual(parsed.data.password, account.password_salt, account.password_hash)) {
    return res.status(403).json({ error: 'Password is incorrect.' })
  }

  db.transaction(() => {
    const owned = db.prepare("SELECT collection_id FROM collection_members WHERE user_id = ? AND role = 'owner'").all(req.user!.id) as Array<{ collection_id: number }>
    const deleteCollection = db.prepare('DELETE FROM collections WHERE id = ?')
    for (const collection of owned) deleteCollection.run(collection.collection_id)
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user!.id)
  })()

  clearSession(req, res)
  return res.status(204).end()
})
