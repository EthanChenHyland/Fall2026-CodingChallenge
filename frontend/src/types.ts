export type CatalogImage = {
  id: string
  title: string
  creator: string
  imageUrl: string
  pageUrl: string
  tags: string[]
  width: number
  height: number
}

export type SavedItem = {
  id: number
  collection_id: number
  source_id: string
  image_url: string
  source_page: string
  source_creator: string
  title: string
  note: string
  canvas_x: number
  canvas_y: number
  rotation: number
  created_at: string
}

export type ActivityItem = {
  id: number
  collection_id: number
  message: string
  created_at: string
}

export type Collection = {
  id: number
  name: string
  description: string
  visibility: 'private' | 'public'
  share_token: string | null
  created_at: string
  updated_at: string
  item_count: number
  cover_url: string | null
  items?: SavedItem[]
  activity?: ActivityItem[]
}
