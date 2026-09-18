import { createHash } from 'node:crypto'
import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { databasePath, db } from '../db.js'

export const mediaDir = join(dirname(databasePath), 'media')
const MAX_BYTES = 10 * 1024 * 1024
const PIXABAY_HOSTS = new Set(['pixabay.com', 'cdn.pixabay.com'])
const MAX_REDIRECTS = 3
const LOCAL_MEDIA_NAME = /^[a-f0-9]{64}\.(jpg|png|webp|gif)$/
const pendingMediaNames = new Set<string>()

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
export type PersistedProviderImage = {
  imageUrl: string
  discard: () => void
  commit: () => void
}

function localMediaName(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/media/')) return null
  const name = value.slice('/media/'.length)
  return LOCAL_MEDIA_NAME.test(name) ? name : null
}

export function pruneUnusedMedia() {
  const now = Date.now()
  db.prepare('DELETE FROM deleted_items WHERE expires_at <= ?').run(now)
  const referenced = new Set<string>()
  for (const row of db.prepare("SELECT image_url FROM items WHERE image_url LIKE '/media/%'").all() as Array<{ image_url: string }>) {
    const name = localMediaName(row.image_url)
    if (name) referenced.add(name)
  }
  for (const row of db.prepare('SELECT snapshot FROM deleted_items WHERE expires_at > ?').all(now) as Array<{ snapshot: string }>) {
    try {
      const snapshot = JSON.parse(row.snapshot) as { item?: { image_url?: unknown } }
      const name = localMediaName(snapshot.item?.image_url)
      if (name) referenced.add(name)
    } catch {
      // Corrupt undo data cannot be restored; it should not pin media forever.
    }
  }
  if (!existsSync(mediaDir)) return 0
  let removed = 0
  for (const entry of readdirSync(mediaDir, { withFileTypes: true })) {
    if (!entry.isFile() || !LOCAL_MEDIA_NAME.test(entry.name) || referenced.has(entry.name) || pendingMediaNames.has(entry.name)) continue
    try {
      unlinkSync(join(mediaDir, entry.name))
      removed++
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Could not remove unused provider image.')
    }
  }
  return removed
}

export async function persistProviderImage(imageUrl: string): Promise<PersistedProviderImage> {
  const url = pixabayUrl(imageUrl)
  if (!url) return { imageUrl, discard: () => undefined, commit: () => undefined }
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
  pendingMediaNames.add(name)
  const path = join(mediaDir, name)
  let created = false
  try {
    await mkdir(mediaDir, { recursive: true })
    // Avoid overwriting an existing content-addressed copy so rollback never
    // deletes media that another pin already depends on.
    await writeFile(path, bytes, { flag: 'wx' })
    created = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      pendingMediaNames.delete(name)
      throw error
    }
  }
  return {
    imageUrl: `/media/${name}`,
    commit: () => { pendingMediaNames.delete(name) },
    discard: () => {
      pendingMediaNames.delete(name)
      if (!created) return
      created = false
      try { unlinkSync(path) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Could not discard unused provider image.')
      }
    },
  }
}
