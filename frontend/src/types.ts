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
  tags: string
  section_id: number | null
  canvas_x: number
  canvas_y: number
  rotation: number
  created_at: string
  like_count?: number
  comment_count?: number
}

export type CollectionSection = {
  id: number
  collection_id: number
  name: string
  position: number
  created_at: string
}

export type SmartSavedItem = SavedItem & {
  collection_name: string
}


export type PublicPin = SavedItem & {
  collection_name: string
  share_token: string
  owner_id: number
  owner_username: string
  owner_name: string
  owner_avatar: string
  like_count?: number
  comment_count?: number
}


export type PinDetail = PublicPin & {
  collection_description: string
  visibility: 'private' | 'public'
  like_count: number
  liked_by_me: boolean
  can_edit: boolean
  collection_follower_count: number
  collection_followed_by_me: boolean | number
  provenance: {
    ancestors: Array<{
      depth: number
      pin_id: number
      collection_id: number
      collection_name: string
      share_token: string | null
      owner_id: number
      owner_username: string
      owner_name: string
      owner_avatar: string
    }>
    hidden_count: number
    total_depth: number
  }
}


export type PinComment = {
  id: number
  item_id: number
  body: string
  parent_id: number | null
  created_at: string
  user_id: number
  user_username: string
  user_name: string
  user_avatar: string
  can_delete: boolean
}

export type PinLikePerson = {
  id: number
  username: string
  name: string
  avatar_url: string
  created_at: string
}



export type SocialSearchPerson = {
  id: number
  username: string
  name: string
  bio: string
  avatar_url: string
  follower_count: number
  followed_by_me: number | boolean
}

export type SocialSearchCollection = {
  id: number
  name: string
  description: string
  share_token: string
  updated_at: string
  item_count: number
  cover_url: string | null
  owner_id: number
  owner_name: string
  owner_avatar: string
}

export type ActivityItem = {
  id: number
  collection_id: number
  message: string
  created_at: string
}

export type User = {
  id: number
  username: string
  name: string
  email: string
  bio: string
  avatar_url: string
  created_at: string
}


export type PublicProfile = {
  id: number
  username: string
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
  username: string
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

export type MessageConversation = {
  id: number
  created_at: string
  updated_at: string
  other_user_id: number
  other_user_username: string
  other_user_name: string
  other_user_avatar: string
  last_message: string | null
  last_message_at: string | null
  unread_count: number
}

export type DirectMessage = {
  id: number
  conversation_id: number
  sender_id: number
  sender_name: string
  sender_avatar: string
  body: string
  pin_id: number | null
  pin_title: string | null
  pin_image_url: string | null
  read_at: string | null
  created_at: string
}

export type Collection = {
  id: number
  name: string
  description: string
  visibility: 'private' | 'public'
  audience: 'private' | 'followers' | 'public'
  share_token: string | null
  created_at: string
  updated_at: string
  item_count: number
  cover_url: string | null
  cover_urls?: string[]
  cover_item_id?: number | null
  cover_focus_x?: number
  cover_focus_y?: number
  theme?: 'paper' | 'sage' | 'clay' | 'slate'
  grid_layout?: 'gallery' | 'compact' | 'masonry'
  owner_id?: number
  owner_name?: string
  owner_avatar?: string
  role?: 'owner' | 'editor' | null
  follower_count?: number
  followed_by_me?: boolean | number
  items?: SavedItem[]
  sections?: CollectionSection[]
  activity?: ActivityItem[]
  collaborators?: Collaborator[]
}
