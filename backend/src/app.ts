import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
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

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(loadUser)

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'mosaic-api' }))
app.use('/api/auth', authRouter)
app.use('/api/search', searchRouter)
app.use('/api/collections', collectionsRouter)
app.use('/api/explore', exploreRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/pins', pinsRouter)
app.use('/api/profiles', profilesRouter)
app.use('/api/shared', sharedRouter)

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }))

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong.' })
})
