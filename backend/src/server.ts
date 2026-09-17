import { db } from './db.js'
import { app } from './app.js'

const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')

const server = app.listen(port, host, () => {
  console.log(`Mosaic listening on http://${host}:${port}`)
})

function shutdown(signal: string) {
  console.log(`${signal} received; closing Mosaic cleanly.`)
  server.close(() => {
    db.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
