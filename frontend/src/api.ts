import type { CatalogImage, Collection, NotificationItem, PublicPin, PublicProfile, SavedItem, User } from './types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Request failed')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  me: () => request<{ user: User }>('/api/auth/me'),
  login: (body: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: { name: string; email: string; password: string }) =>
    request<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  demoLogin: () => request<{ user: User }>('/api/auth/demo', { method: 'POST' }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  explore: (page = 1) => request<{ pins: PublicPin[]; nextPage: number | null }>(`/api/explore?page=${page}`),
  search: (query = '', page = 1) =>
    request<{ results: CatalogImage[]; source: 'local' | 'pixabay' | 'wikimedia'; fallback?: boolean; cached?: boolean; nextPage?: number }>(`/api/search?q=${encodeURIComponent(query)}&page=${page}`),
  profile: (id: number) => request<{ profile: PublicProfile; collections: Collection[] }>(`/api/profiles/${id}`),
  updateProfile: (body: { name?: string; bio?: string; avatarUrl?: string }) => request<{ user: User }>('/api/profiles/me', { method: 'PATCH', body: JSON.stringify(body) }),
  followProfile: (id: number) => request<void>(`/api/profiles/${id}/follow`, { method: 'POST' }),
  unfollowProfile: (id: number) => request<void>(`/api/profiles/${id}/follow`, { method: 'DELETE' }),
  collections: () => request<{ collections: Collection[] }>('/api/collections'),
  collection: (id: number) => request<{ collection: Collection }>(`/api/collections/${id}`),
  createCollection: (body: { name: string; description?: string }) =>
    request<{ collection: Collection }>('/api/collections', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCollection: (
    id: number,
    body: Partial<Pick<Collection, 'name' | 'description' | 'visibility'>>,
  ) =>
    request<{ collection: Collection }>(`/api/collections/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  saveImage: (collectionId: number, image: CatalogImage) =>
    request<{ item: SavedItem }>(`/api/collections/${collectionId}/items`, {
      method: 'POST',
      body: JSON.stringify({
        sourceId: image.id,
        imageUrl: image.imageUrl,
        sourcePage: image.pageUrl,
        sourceCreator: image.creator,
        title: image.title,
      }),
    }),
  updateItem: (collectionId: number, itemId: number, body: Record<string, unknown>) =>
    request<{ item: SavedItem }>(`/api/collections/${collectionId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteItem: (collectionId: number, itemId: number) =>
    request<void>(`/api/collections/${collectionId}/items/${itemId}`, { method: 'DELETE' }),
  shareCollection: (id: number) =>
    request<{ token: string }>(`/api/collections/${id}/share`, { method: 'POST' }),
  disableShare: (id: number) =>
    request<void>(`/api/collections/${id}/share`, { method: 'DELETE' }),
  addCollaborator: (id: number, email: string) =>
    request<{ collection: Collection }>(`/api/collections/${id}/collaborators`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  removeCollaborator: (id: number, userId: number) =>
    request<void>(`/api/collections/${id}/collaborators/${userId}`, { method: 'DELETE' }),
  notifications: () => request<{ notifications: NotificationItem[] }>('/api/notifications'),
  markNotificationsRead: () => request<void>('/api/notifications/read', { method: 'POST' }),
  sharedCollection: (token: string) =>
    request<{ collection: Collection }>(`/api/shared/${encodeURIComponent(token)}`),
}
