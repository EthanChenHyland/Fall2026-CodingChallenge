import type { CatalogImage, Collection, DirectMessage, MessageConversation, NotificationItem, PinComment, PinDetail, PinLikePerson, ProfileConnection, PublicPin, PublicProfile, SavedItem, SmartSavedItem, SocialSearchCollection, SocialSearchPerson, User } from './types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!navigator.onLine) throw new ApiError('You are offline. Reconnect and try again.', 0)
  const response = await fetch(path, {
    signal: AbortSignal.timeout(20_000),
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(body.error ?? (response.status === 429 ? 'Too many requests. Please wait and try again.' : 'Request failed. Please try again.'), response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  me: () => request<{ user: User }>('/api/auth/me'),
  login: (body: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: { name: string; email: string; password: string; ageConfirmed: true }) =>
    request<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  startRegistration: (body: { name: string; email: string; password: string; ageConfirmed: boolean }) =>
    request<{ verificationRequired: false; user: User } | { verificationRequired: true; email: string }>('/api/auth/register/start', { method: 'POST', body: JSON.stringify(body) }),
  verifyRegistration: (body: { email: string; code: string }) =>
    request<{ user: User }>('/api/auth/register/verify', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  deleteAccount: (password: string, confirmation: 'DELETE') => request<void>('/api/auth/account', { method: 'DELETE', body: JSON.stringify({ password, confirmation }) }),
  explore: (page = 1, mode: 'all' | 'following' | 'trending' = 'all') => request<{ pins: PublicPin[]; nextPage: number | null }>(`/api/explore?page=${page}&mode=${mode}`),
  recommendations: () => request<{ pins: PublicPin[]; basedOn: string[] }>('/api/explore/recommended'),
  recommendationFeedback: (id: number, signal: 'more' | 'not_interested') => request<void>(`/api/pins/${id}/recommendation-feedback`, { method: 'POST', body: JSON.stringify({ signal }) }),
  pin: (id: number) => request<{ pin: PinDetail }>(`/api/pins/${id}`),
  relatedPins: (id: number) => request<{ pins: PublicPin[] }>(`/api/pins/${id}/related`),
  likePin: (id: number) => request<void>(`/api/pins/${id}/like`, { method: 'POST' }),
  unlikePin: (id: number) => request<void>(`/api/pins/${id}/like`, { method: 'DELETE' }),
  pinLikes: (id: number) => request<{ likes: PinLikePerson[] }>(`/api/pins/${id}/likes`),
  pinSavedIn: (id: number) => request<{ collections: Array<{ id: number; name: string }> }>(`/api/pins/${id}/saved-in`),
  savePin: (id: number, collectionId: number, note = '') => request<{ item: SavedItem }>(`/api/pins/${id}/save`, { method: 'POST', body: JSON.stringify({ collectionId, note }) }),
  savePinsBatch: (pinIds: number[], collectionId: number) => request<{ items: SavedItem[]; savedCount: number; skippedCount: number; skippedDuplicateIds: number[]; unavailableIds: number[] }>('/api/pins/save-batch', { method: 'POST', body: JSON.stringify({ pinIds, collectionId }) }),
  pinComments: (id: number) => request<{ comments: PinComment[] }>(`/api/pins/${id}/comments`),
  addPinComment: (id: number, body: string, parentId?: number) => request<{ comment: PinComment }>(`/api/pins/${id}/comments`, { method: 'POST', body: JSON.stringify({ body, parentId }) }),
  deletePinComment: (id: number, commentId: number) => request<void>(`/api/pins/${id}/comments/${commentId}`, { method: 'DELETE' }),
  socialSearch: (query: string) => request<{ people: SocialSearchPerson[]; collections: SocialSearchCollection[] }>(`/api/search/social?q=${encodeURIComponent(query)}`),
  search: (query = '', page = 1, source = '', seed?: number) =>
    request<{ results: CatalogImage[]; source: 'local' | 'pixabay' | 'wikimedia'; fallback?: boolean; cached?: boolean; nextPage?: number }>(`/api/search?q=${encodeURIComponent(query)}&page=${page}&source=${encodeURIComponent(source)}${seed == null ? '' : `&seed=${seed}`}`),
  searchRecommendations: (query = '') => request<{ suggestions: string[]; pins: PublicPin[]; basedOn: string[] }>(`/api/search/recommendations?q=${encodeURIComponent(query)}`),
  profile: (identifier: string | number) => request<{ profile: PublicProfile; collections: Collection[] }>(`/api/profiles/${encodeURIComponent(String(identifier))}`),
  profileConnections: (id: number, kind: 'followers' | 'following') => request<{ kind: string; people: ProfileConnection[] }>(`/api/profiles/${id}/connections?kind=${kind}`),
  updateProfile: (body: { name?: string; bio?: string; avatarUrl?: string }) => request<{ user: User }>('/api/profiles/me', { method: 'PATCH', body: JSON.stringify(body) }),
  followProfile: (id: number) => request<void>(`/api/profiles/${id}/follow`, { method: 'POST' }),
  unfollowProfile: (id: number) => request<void>(`/api/profiles/${id}/follow`, { method: 'DELETE' }),
  followCollection: (id: number) => request<void>(`/api/collections/${id}/follow`, { method: 'POST' }),
  unfollowCollection: (id: number) => request<void>(`/api/collections/${id}/follow`, { method: 'DELETE' }),
  collections: () => request<{ collections: Collection[] }>('/api/collections'),
  smartCollection: (view: 'recent' | 'popular' | 'unsorted') => request<{ view: string; items: SmartSavedItem[] }>(`/api/collections/smart/${view}`),
  collection: (id: number) => request<{ collection: Collection }>(`/api/collections/${id}`),
  exportCollection: (id: number) => request<Record<string, unknown>>(`/api/collections/${id}/export`),
  importCollection: (payload: unknown) => request<{ collection: Collection }>('/api/collections/import', { method: 'POST', body: JSON.stringify(payload) }),
  createCollection: (body: { name: string; description?: string }) =>
    request<{ collection: Collection }>('/api/collections', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCollection: (
    id: number,
    body: Partial<Pick<Collection, 'name' | 'description' | 'visibility' | 'audience'>> & {
      coverItemId?: number | null
      coverFocusX?: number
      coverFocusY?: number
      theme?: 'paper' | 'sage' | 'clay' | 'slate'
      gridLayout?: 'gallery' | 'compact' | 'masonry'
    },
  ) =>
    request<{ collection: Collection }>(`/api/collections/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  saveImage: (collectionId: number, image: CatalogImage, note = '') =>
    request<{ item: SavedItem }>(`/api/collections/${collectionId}/items`, {
      method: 'POST',
      body: JSON.stringify({
        sourceId: image.id,
        imageUrl: image.imageUrl,
        sourcePage: image.pageUrl,
        sourceCreator: image.creator,
        title: image.title,
        tags: image.tags,
        note,
      }),
    }),
  updateItem: (collectionId: number, itemId: number, body: Record<string, unknown>) =>
    request<{ item: SavedItem }>(`/api/collections/${collectionId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteItem: (collectionId: number, itemId: number) =>
    request<void>(`/api/collections/${collectionId}/items/${itemId}`, { method: 'DELETE' }),
  restoreItem: (collectionId: number, item: SavedItem) =>
    request<{ item: SavedItem }>(`/api/collections/${collectionId}/items/restore`, {
      method: 'POST',
      body: JSON.stringify({ itemId: item.id }),
    }),
  updateLayout: (collectionId: number, positions: Array<{ itemId: number; x: number; y: number; rotation: number }>) =>
    request<void>(`/api/collections/${collectionId}/layout`, { method: 'PATCH', body: JSON.stringify({ positions }) }),
  createSection: (collectionId: number, name: string) => request<{ section: { id: number; name: string } }>(`/api/collections/${collectionId}/sections`, { method: 'POST', body: JSON.stringify({ name }) }),
  updateSection: (collectionId: number, sectionId: number, name: string) => request<{ section: { id: number; name: string } }>(`/api/collections/${collectionId}/sections/${sectionId}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteSection: (collectionId: number, sectionId: number) => request<void>(`/api/collections/${collectionId}/sections/${sectionId}`, { method: 'DELETE' }),
  bulkItems: (collectionId: number, body: { action: 'delete' | 'move' | 'copy' | 'section'; itemIds: number[]; targetCollectionId?: number; sectionId?: number | null }) =>
    request<{ items: SavedItem[] }>(`/api/collections/${collectionId}/items/bulk`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  shareCollection: (id: number) =>
    request<{ token: string }>(`/api/collections/${id}/share`, { method: 'POST' }),
  disableShare: (id: number) =>
    request<void>(`/api/collections/${id}/share`, { method: 'DELETE' }),
  editorInvite: (id: number) => request<{ invite: { token: string; created_at: string } | null }>(`/api/collections/${id}/editor-invite`),
  createEditorInvite: (id: number) => request<{ invite: { token: string } }>(`/api/collections/${id}/editor-invite`, { method: 'POST' }),
  revokeEditorInvite: (id: number) => request<void>(`/api/collections/${id}/editor-invite`, { method: 'DELETE' }),
  editorInvitePreview: (token: string) => request<{ invite: { collectionId: number; collectionName: string; ownerName: string; alreadyMember: boolean } }>(`/api/collections/editor-invites/${encodeURIComponent(token)}`),
  acceptEditorInvite: (token: string) => request<{ collection: Collection; alreadyMember: boolean }>(`/api/collections/editor-invites/${encodeURIComponent(token)}/accept`, { method: 'POST' }),
  addCollaborator: (id: number, email: string) =>
    request<{ collection: Collection }>(`/api/collections/${id}/collaborators`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  removeCollaborator: (id: number, userId: number) =>
    request<void>(`/api/collections/${id}/collaborators/${userId}`, { method: 'DELETE' }),
  leaveCollection: (id: number) => request<void>(`/api/collections/${id}/collaborators/me`, { method: 'DELETE' }),
  notifications: () => request<{ notifications: NotificationItem[] }>('/api/notifications'),
  markNotificationsRead: () => request<void>('/api/notifications/read', { method: 'POST' }),
  messageConversations: () => request<{ conversations: MessageConversation[] }>('/api/messages'),
  startConversation: (userId: number) => request<{ conversationId: number }>(`/api/messages/with/${userId}`, { method: 'POST' }),
  conversation: (id: number) => request<{ conversation: MessageConversation; messages: DirectMessage[] }>(`/api/messages/${id}`),
  sendMessage: (id: number, body: string, pinId?: number) => request<{ message: DirectMessage }>(`/api/messages/${id}`, { method: 'POST', body: JSON.stringify({ body, pinId }) }),
  markConversationRead: (id: number) => request<void>(`/api/messages/${id}/read`, { method: 'POST' }),
  sharedCollection: (token: string) =>
    request<{ collection: Collection }>(`/api/shared/${encodeURIComponent(token)}`),
}
