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


export type PublicPin = SavedItem & {
  collection_name: string
  share_token: string
  owner_id: number
  owner_name: string
  owner_avatar: string
}


export type PinDetail = PublicPin & {
  collection_description: string
  visibility: 'private' | 'public'
  like_count: number
  liked_by_me: boolean
}


export type PinComment = {
  id: number
  item_id: number
  body: string
  created_at: string
  user_id: number
  user_name: string
  user_avatar: string
}

export type ActivityItem = {
  id: number
  collection_id: number
  message: string
  created_at: string
}

export type User = {
  id: number
  name: string
  email: string
  bio: string
  avatar_url: string
  created_at: string
}


export type PublicProfile = {
  id: number
  name: string
  bio: string
  avatar_url: string
  created_at: string
  collection_count: number
  pin_count: number
  follower_count: number
  following_count: number
  is_self: boolean
  followed_by_me: boolean
}



export type ProfileConnection = {
  id: number
  name: string
  bio: string
  avatar_url: string
  followed_by_me: number | boolean
}

export type Collaborator = {
  id: number
  name: string
  email: string
  role: 'owner' | 'editor'
}

export type NotificationItem = {
  id: number
  user_id: number
  collection_id: number | null
  collection_name: string | null
  message: string
  read_at: string | null
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
  role?: 'owner' | 'editor' | null
  items?: SavedItem[]
  activity?: ActivityItem[]
  collaborators?: Collaborator[]
}
