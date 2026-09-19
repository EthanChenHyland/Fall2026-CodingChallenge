import crypto from 'node:crypto'
import type { Request, Response } from 'express'

const COOKIE = 'mosaic_share_visitor'
const ONE_YEAR = 365 * 24 * 60 * 60 * 1000

function readCookie(req: Request) {
  const raw = req.headers.cookie ?? ''
  for (const pair of raw.split(';')) {
    const [name, value] = pair.trim().split('=')
    if (name === COOKIE && value && /^[A-Za-z0-9_-]{16,64}$/.test(value)) return value
  }
  return null
}

export function shareVisitorHash(req: Request, res?: Response) {
  let token = readCookie(req)
  if (!token) {
    token = crypto.randomBytes(18).toString('base64url')
    if (res) res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ONE_YEAR,
      path: '/',
    })
  }
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function userShareHash(userId: number) {
  return crypto.createHash('sha256').update(`user:${userId}`).digest('hex')
}
