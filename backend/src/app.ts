import compression from 'compression'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './db.js'
import { mediaDir, pruneUnusedMedia } from './lib/media.js'
import { loadUser } from './middleware/auth.js'
import { authRouter } from './routes/auth.js'
import { collectionsRouter } from './routes/collections.js'
import { exploreRouter } from './routes/explore.js'
import { notificationsRouter } from './routes/notifications.js'
import { messagesRouter } from './routes/messages.js'
import { pinsRouter } from './routes/pins.js'
import { profilesRouter } from './routes/profiles.js'
import { searchRouter } from './routes/search.js'
import { sharedRouter } from './routes/shared.js'

export const app = express()

try { pruneUnusedMedia() } catch { console.warn('Could not prune unused provider media.') }
const mediaGcTimer = setInterval(() => {
  try { pruneUnusedMedia() } catch { console.warn('Could not prune unused provider media.') }
}, 10 * 60_000)
mediaGcTimer.unref()

app.disable('x-powered-by')
// Only trust the explicitly configured number of reverse-proxy hops.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0))
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://api.cloudinary.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      workerSrc: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
}))
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})
app.use(compression())
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? false : true, credentials: true }))
app.use('/api/collections/import', express.json({ limit: '20mb' }))
app.use(express.json({ limit: '1mb' }))
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
app.use('/api', rateLimit({ skip: (req) => req.path === '/health', windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false }))
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/demo'], rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }))
app.use(loadUser)

app.get('/api/health', (_req, res) => {
  try {
    db.prepare('SELECT 1').get()
    res.setHeader('Cache-Control', 'no-store')
    return res.json({
      ok: true,
      service: 'mosaic-api',
      database: 'ready',
      searchProvider: process.env.PIXABAY_API_KEY ? 'pixabay' : 'wikimedia',
      uptimeSeconds: Math.round(process.uptime()),
    })
  } catch {
    return res.status(503).json({ ok: false, service: 'mosaic-api', database: 'unavailable' })
  }
})
app.use('/api/auth', authRouter)
app.use('/api/search', searchRouter)
app.use('/api/collections', collectionsRouter)
app.use('/api/explore', exploreRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/pins', pinsRouter)
app.use('/api/profiles', profilesRouter)
app.use('/api/shared', sharedRouter)

app.use('/media', express.static(mediaDir, { maxAge: '1y', immutable: true, dotfiles: 'deny' }), (_req, res) => res.status(404).end())

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }))

if (process.env.NODE_ENV === 'production') {
  const frontendDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../frontend/dist')
  app.use(express.static(frontendDist, { maxAge: '1h', immutable: false, setHeaders: (res, path) => { res.setHeader('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache') } }))
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    return res.sendFile(resolve(frontendDist, 'index.html'))
  })
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = typeof err === 'object' && err !== null && 'status' in err ? Number(err.status) : 500
  if (status === 400 || status === 413) return res.status(status).json({ error: status === 413 ? 'Request is too large.' : 'Invalid JSON request.' })
  console.error(err)
  res.status(500).json({ error: 'Something went wrong.' })
})
