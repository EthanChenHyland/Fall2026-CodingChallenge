import compression from 'compression'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { readFileSync } from 'node:fs'
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
import { reportsRouter } from './routes/reports.js'
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
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' },
}))
app.use('/api/auth/register/start', rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many account or verification-code requests. Try again later.' },
}))
app.use('/api/auth/register/verify', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Request a new code.' },
}))
app.use('/api/auth/demo', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }))
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
app.use('/api/reports', reportsRouter)
app.use('/api/shared', sharedRouter)

app.use('/media', express.static(mediaDir, { maxAge: '1y', immutable: true, dotfiles: 'deny' }), (_req, res) => res.status(404).end())

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }))

if (process.env.NODE_ENV === 'production') {
  const frontendDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../frontend/dist')
  const indexPath = resolve(frontendDist, 'index.html')
  const indexTemplate = readFileSync(indexPath, 'utf8')
  const escapeMeta = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const renderMetaPage = (req: Request, res: Response, meta: { title: string; description: string; image?: string }) => {
    const base = `${req.protocol}://${req.get('host')}`
    const image = meta.image ? (meta.image.startsWith('http') ? meta.image : `${base}${meta.image}`) : ''
    const tags = [
      `<meta property="og:site_name" content="Mosaic" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:title" content="${escapeMeta(meta.title)}" />`,
      `<meta property="og:description" content="${escapeMeta(meta.description)}" />`,
      `<meta property="og:url" content="${escapeMeta(base + req.originalUrl)}" />`,
      image ? `<meta property="og:image" content="${escapeMeta(image)}" />` : '',
      `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
      `<meta name="twitter:title" content="${escapeMeta(meta.title)}" />`,
      `<meta name="twitter:description" content="${escapeMeta(meta.description)}" />`,
      image ? `<meta name="twitter:image" content="${escapeMeta(image)}" />` : '',
    ].filter(Boolean).join('\n    ')
    const html = indexTemplate
      .replace(/<title>.*?<\/title>/, `<title>${escapeMeta(meta.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeMeta(meta.description)}" />`)
      .replace('</head>', `    ${tags}\n  </head>`)
    res.setHeader('Cache-Control', 'public, max-age=60')
    return res.type('html').send(html)
  }

  app.get(['/shared/:token', '/shared/:token/present'], (req, res, next) => {
    const collection = db.prepare(`
      SELECT c.name, c.description,
        COALESCE((SELECT image_url FROM items WHERE id = c.cover_item_id AND collection_id = c.id), (SELECT image_url FROM items WHERE collection_id = c.id ORDER BY id DESC LIMIT 1)) AS cover_url,
        u.name AS owner_name
      FROM collections c
      JOIN collection_members m ON m.collection_id = c.id AND m.role = 'owner'
      JOIN users u ON u.id = m.user_id
      WHERE c.share_token = ? AND c.visibility = 'public'
    `).get(req.params.token) as { name: string; description: string; cover_url: string | null; owner_name: string } | undefined
    if (!collection) return next()
    return renderMetaPage(req, res, { title: `${collection.name} · Mosaic`, description: collection.description || `A visual collection by ${collection.owner_name} on Mosaic.`, image: collection.cover_url ?? undefined })
  })

  app.get('/pin/:id', (req, res, next) => {
    const pin = db.prepare(`
      SELECT i.title, i.note, i.image_url, c.name AS collection_name, u.name AS owner_name
      FROM items i
      JOIN collections c ON c.id = i.collection_id
      JOIN collection_members m ON m.collection_id = c.id AND m.role = 'owner'
      JOIN users u ON u.id = m.user_id
      WHERE i.id = ? AND c.visibility = 'public' AND c.share_token IS NOT NULL
    `).get(Number(req.params.id)) as { title: string; note: string; image_url: string; collection_name: string; owner_name: string } | undefined
    if (!pin) return next()
    return renderMetaPage(req, res, { title: `${pin.title} · Mosaic`, description: pin.note || `Saved to ${pin.collection_name} by ${pin.owner_name} on Mosaic.`, image: pin.image_url })
  })

  app.use(express.static(frontendDist, { maxAge: '1h', immutable: false, setHeaders: (res, path) => { res.setHeader('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache') } }))
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    return res.sendFile(indexPath)
  })
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = typeof err === 'object' && err !== null && 'status' in err ? Number(err.status) : 500
  if (status === 400 || status === 413) return res.status(status).json({ error: status === 413 ? 'Request is too large.' : 'Invalid JSON request.' })
  console.error(err)
  res.status(500).json({ error: 'Something went wrong.' })
})
