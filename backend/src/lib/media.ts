import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { databasePath } from '../db.js'

export const mediaDir = join(dirname(databasePath), 'media')
const MAX_BYTES = 10 * 1024 * 1024

// Pixabay permits temporary search previews, but saved pins must use our own copy.
// No arbitrary-host fetches or redirects: this endpoint must not become an SSRF proxy.
export async function persistProviderImage(imageUrl: string) {
  const url = new URL(imageUrl, 'https://mosaic.invalid')
  if (!['pixabay.com', 'cdn.pixabay.com'].includes(url.hostname)) return imageUrl
  if (url.protocol !== 'https:' || url.port || url.username || url.password) throw new Error('Invalid provider image URL.')
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) })
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Provider image could not be saved.')
  const formats: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
  const extension = formats[(response.headers.get('content-type') ?? '').split(';')[0]]
  if (!extension || !response.body) throw new Error('Unsupported provider image format.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Provider image is too large.') }
    chunks.push(value)
  }
  const bytes = Buffer.concat(chunks)
  const name = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`
  await mkdir(mediaDir, { recursive: true })
  // Content-addressed names make concurrent saves harmless.
  await writeFile(join(mediaDir, name), bytes)
  return `/media/${name}`
}
