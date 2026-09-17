import compression from 'compression'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './db.js'
import { loadUser } from './middleware/auth.js'
import { authRouter } from './routes/auth.js'
import { collectionsRouter } from './routes/collections.js'
import { exploreRouter } from './routes/explore.js'
import { notificationsRouter } from './routes/notifications.js'
import { pinsRouter } from './routes/pins.js'
import { profilesRouter } from './routes/profiles.js'
import { searchRouter } from './routes/search.js'
import { sharedRouter } from './routes/shared.js'

export const app = express()

app.disable('x-powered-by')
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://api.cloudinary.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
}))
app.use(compression())
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false }))
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }))
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
app.use('/api/pins', pinsRouter)
app.use('/api/profiles', profilesRouter)
app.use('/api/shared', sharedRouter)

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }))

if (process.env.NODE_ENV === 'production') {
  const frontendDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../frontend/dist')
  app.use(express.static(frontendDist, { maxAge: '1h', immutable: false, setHeaders: (res, path) => { if (path.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable') } }))
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    return res.sendFile(resolve(frontendDist, 'index.html'))
  })
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong.' })
})
