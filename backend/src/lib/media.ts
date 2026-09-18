import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { databasePath } from '../db.js'

export const mediaDir = join(dirname(databasePath), 'media')
const MAX_BYTES = 10 * 1024 * 1024
const PIXABAY_HOSTS = new Set(['pixabay.com', 'cdn.pixabay.com'])
const MAX_REDIRECTS = 3

function pixabayUrl(value: string | URL) {
  const url = value instanceof URL ? value : new URL(value, 'https://mosaic.invalid')
  if (!PIXABAY_HOSTS.has(url.hostname)) return null
  if (url.protocol !== 'https:' || url.port || url.username || url.password) throw new Error('Invalid provider image URL.')
  return url
}

async function fetchPixabayImage(initialUrl: URL) {
  let url = initialUrl
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location || redirects === MAX_REDIRECTS) throw new Error('Provider image redirect was invalid.')
    const next = pixabayUrl(new URL(location, url))
    if (!next) throw new Error('Provider image redirect left Pixabay.')
    url = next
  }
  throw new Error('Too many provider image redirects.')
}

// Pixabay permits temporary search previews, but saved pins must use our own copy.
// Redirects are followed only when every hop remains on an approved Pixabay host;
// this keeps legitimate provider delivery working without turning the app into an SSRF proxy.
export async function persistProviderImage(imageUrl: string) {
  const url = pixabayUrl(imageUrl)
  if (!url) return imageUrl
  const response = await fetchPixabayImage(url)
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
