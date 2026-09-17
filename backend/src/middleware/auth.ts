import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { db } from '../db.js'

export type User = { id: number; name: string; email: string; created_at: string }
export type AuthedRequest = Request & { user?: User }
export type Membership = { role: 'owner' | 'editor' }

const SESSION_COOKIE = 'mosaic_session'
const SESSION_DAYS = 7

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

export function passwordHash(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

export function safePasswordEqual(password: string, salt: string, storedHash: string) {
  const actual = Buffer.from(passwordHash(password, salt), 'hex')
  const expected = Buffer.from(storedHash, 'hex')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

export function setSession(res: Response, userId: number) {
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

export function clearSession(req: Request, res: Response) {
  const token = parseCookies(req)[SESSION_COOKIE]
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token))
  res.clearCookie(SESSION_COOKIE, { path: '/' })
}

export function loadUser(req: AuthedRequest, _res: Response, next: NextFunction) {
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

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' })
  next()
}

export function membership(collectionId: number, userId: number) {
  return db.prepare('SELECT role FROM collection_members WHERE collection_id = ? AND user_id = ?').get(
    collectionId,
    userId,
  ) as Membership | undefined
}

export function requireMembership(req: AuthedRequest, res: Response, next: NextFunction) {
  const collectionId = Number(req.params.id)
  if (!Number.isInteger(collectionId)) return res.status(400).json({ error: 'Invalid collection.' })
  const found = req.user ? membership(collectionId, req.user.id) : undefined
  if (!found) return res.status(404).json({ error: 'Collection not found.' })
  res.locals.membership = found
  next()
}

export function requireOwner(_req: AuthedRequest, res: Response, next: NextFunction) {
  if (res.locals.membership?.role !== 'owner') {
    return res.status(403).json({ error: 'Only the collection owner can do that.' })
  }
  next()
}
