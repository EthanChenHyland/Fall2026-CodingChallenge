import type { CatalogImage } from '../types'

export type ImageOrientation = 'all' | 'landscape' | 'portrait' | 'square'
export type ImageOrder = 'default' | 'largest' | 'tall' | 'wide'

export function shuffleImages(images: CatalogImage[], seed: number) {
  const shuffled = [...images]
  let state = seed >>> 0 || 0x6d2b79f5
  const random = () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

export function applyImageFilters(images: CatalogImage[], orientation: ImageOrientation, order: ImageOrder) {
  const filtered = orientation === 'all' ? [...images] : images.filter((image) => {
    if (!image.width || !image.height) return false
    const ratio = image.width / image.height
    if (orientation === 'landscape') return ratio > 1.12
    if (orientation === 'portrait') return ratio < 0.89
    return ratio >= 0.89 && ratio <= 1.12
  })

  if (order === 'largest') filtered.sort((a, b) => (b.width * b.height) - (a.width * a.height))
  else if (order === 'tall') filtered.sort((a, b) => (a.width / a.height) - (b.width / b.height))
  else if (order === 'wide') filtered.sort((a, b) => (b.width / b.height) - (a.width / a.height))
  return filtered
}
