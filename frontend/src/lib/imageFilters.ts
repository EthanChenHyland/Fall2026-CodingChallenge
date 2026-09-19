import type { CatalogImage } from '../types'

export type ImageOrientation = 'all' | 'landscape' | 'portrait' | 'square'
export type ImageOrder = 'default' | 'largest' | 'tall' | 'wide'

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
