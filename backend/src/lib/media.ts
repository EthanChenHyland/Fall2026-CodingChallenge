import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { databasePath, db } from '../db.js'

export const mediaDir = join(dirname(databasePath), 'media')
const MAX_BYTES = 10 * 1024 * 1024
const PIXABAY_HOSTS = new Set(['pixabay.com', 'cdn.pixabay.com'])
const MAX_REDIRECTS = 3
const LOCAL_MEDIA_NAME = /^[a-f0-9]{64}\.(jpg|png|webp|gif)$/
const PORTABLE_MEDIA_MAX_BYTES = 11 * 1024 * 1024
const pendingMediaNames = new Map<string, number>()
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }

export type PortableMediaAsset = { path: string; contentType: string; data: string }

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

function retainPendingMedia(name: string) {
  pendingMediaNames.set(name, (pendingMediaNames.get(name) ?? 0) + 1)
}

function releasePendingMedia(name: string) {
  const next = (pendingMediaNames.get(name) ?? 1) - 1
  if (next <= 0) pendingMediaNames.delete(name)
  else pendingMediaNames.set(name, next)
}

function mediaNameIsReferenced(name: string) {
  const imageUrl = `/media/${name}`
  if (db.prepare('SELECT 1 FROM items WHERE image_url = ? LIMIT 1').get(imageUrl)) return true
  const now = Date.now()
  for (const row of db.prepare('SELECT snapshot FROM deleted_items WHERE expires_at > ?').all(now) as Array<{ snapshot: string }>) {
    try {
      const snapshot = JSON.parse(row.snapshot) as { item?: { image_url?: unknown } }
      if (localMediaName(snapshot.item?.image_url) === name) return true
    } catch {
      // Corrupt undo data cannot safely keep a media file alive.
    }
  }
  return false
}

function discardCreatedMedia(name: string, path: string) {
  releasePendingMedia(name)
  if ((pendingMediaNames.get(name) ?? 0) > 0 || mediaNameIsReferenced(name)) return
  try { unlinkSync(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Could not discard unused provider image.')
  }
}

function verifiedPortableAsset(asset: PortableMediaAsset) {
  const name = localMediaName(asset.path)
  if (!name) throw new Error('Invalid embedded media path.')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data) || asset.data.length % 4 !== 0) throw new Error('Invalid embedded media data.')
  const bytes = Buffer.from(asset.data, 'base64')
  const extension = name.slice(name.lastIndexOf('.') + 1)
  if (CONTENT_TYPE_BY_EXTENSION[extension] !== asset.contentType) throw new Error('Embedded media type does not match its path.')
  const expectedName = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`
  if (expectedName !== name) throw new Error('Embedded media checksum does not match its path.')
  return { name, bytes }
}

export function exportPortableMedia(imageUrls: unknown[]) {
  const assets: PortableMediaAsset[] = []
  const seen = new Set<string>()
  let totalBytes = 0
  for (const imageUrl of imageUrls) {
    const name = localMediaName(imageUrl)
    if (!name || seen.has(name)) continue
    const path = join(mediaDir, name)
    if (!existsSync(path)) throw new Error('A locally stored image is missing. Re-save that pin before exporting.')
    const bytes = readFileSync(path)
    const extension = name.slice(name.lastIndexOf('.') + 1)
    const expectedName = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`
    if (expectedName !== name) throw new Error('A locally stored image failed its integrity check.')
    totalBytes += bytes.length
    if (totalBytes > PORTABLE_MEDIA_MAX_BYTES) throw new Error('This collection contains too much local media for one portable export.')
    assets.push({ path: `/media/${name}`, contentType: CONTENT_TYPE_BY_EXTENSION[extension], data: bytes.toString('base64') })
    seen.add(name)
  }
  return assets
}

export function localMediaReferenceExists(imageUrl: unknown) {
  const name = localMediaName(imageUrl)
  return !name || existsSync(join(mediaDir, name))
}

export function stagePortableMedia(assets: PortableMediaAsset[]) {
  const staged: Array<{ name: string; path: string; created: boolean }> = []
  const seen = new Set<string>()
  let totalBytes = 0
  try {
    mkdirSync(mediaDir, { recursive: true })
    for (const asset of assets) {
      const { name, bytes } = verifiedPortableAsset(asset)
      if (seen.has(name)) throw new Error('Duplicate embedded media asset.')
      seen.add(name)
      totalBytes += bytes.length
      if (bytes.length > MAX_BYTES || totalBytes > PORTABLE_MEDIA_MAX_BYTES) throw new Error('Embedded media is too large.')
      retainPendingMedia(name)
      const path = join(mediaDir, name)
      let created = false
      try {
        writeFileSync(path, bytes, { flag: 'wx' })
        created = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        const existing = readFileSync(path)
        if (!existing.equals(bytes)) throw new Error('Existing local media failed its integrity check.')
      }
      staged.push({ name, path, created })
    }
  } catch (error) {
    for (const file of staged) {
      if (file.created) discardCreatedMedia(file.name, file.path)
      else releasePendingMedia(file.name)
    }
    throw error
  }
  let settled = false
  return {
    commit: () => {
      if (settled) return
      settled = true
      for (const file of staged) releasePendingMedia(file.name)
    },
    discard: () => {
      if (settled) return
      settled = true
      for (const file of staged) {
        if (file.created) discardCreatedMedia(file.name, file.path)
        else releasePendingMedia(file.name)
      }
    },
  }
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
    if (!entry.isFile() || !LOCAL_MEDIA_NAME.test(entry.name) || referenced.has(entry.name) || (pendingMediaNames.get(entry.name) ?? 0) > 0) continue
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
  retainPendingMedia(name)
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
      releasePendingMedia(name)
      throw error
    }
  }
  let settled = false
  return {
    imageUrl: `/media/${name}`,
    commit: () => {
      if (settled) return
      settled = true
      releasePendingMedia(name)
    },
    discard: () => {
      if (settled) return
      settled = true
      if (!created) {
        releasePendingMedia(name)
        return
      }
      created = false
      discardCreatedMedia(name, path)
    },
  }
}
