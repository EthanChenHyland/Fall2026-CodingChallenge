import type { Collection } from '../types'

const RECENT_COLLECTION_KEY = 'mosaic:recent-collection'

export function rememberCollection(collectionId: number) {
  window.localStorage.setItem(RECENT_COLLECTION_KEY, String(collectionId))
}

export function recentCollection(collections: Collection[]) {
  const rememberedId = Number(window.localStorage.getItem(RECENT_COLLECTION_KEY))
  return collections.find((collection) => collection.id === rememberedId) ?? collections[0] ?? null
}
