import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, FolderHeart, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api'

export function SocialSearchResults({ query, showPeople = true, showCollections = true }: { query: string; showPeople?: boolean; showCollections?: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['social-search', query],
    queryFn: () => api.socialSearch(query),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
  })
  if (query.trim().length < 2) return null
  const visiblePeople = showPeople ? data?.people ?? [] : []
  const visibleCollections = showCollections ? data?.collections ?? [] : []
  if (!isLoading && !visiblePeople.length && !visibleCollections.length) return null

  return (
    <section className="social-search-block" aria-label="Mosaic search results">
      <div className="social-search-head"><span className="eyebrow">ON MOSAIC</span><span>{isLoading ? 'Looking around…' : `${visiblePeople.length + visibleCollections.length} matches`}</span></div>
      {visiblePeople.length ? <div className="people-search-row">{visiblePeople.map((person) => (
        <Link className="people-search-card" to={`/people/${person.username}`} key={person.id}>
          <span className="people-search-avatar">{person.avatar_url ? <img src={person.avatar_url} alt="" /> : <UserRound size={19} />}</span>
          <span><strong>{person.name}</strong><small>@{person.username} · {person.follower_count} {person.follower_count === 1 ? 'follower' : 'followers'}</small></span>
        </Link>
      ))}</div> : null}
      {visibleCollections.length ? <div className="board-search-row">{visibleCollections.map((collection) => (
        <Link className="board-search-card" to={`/shared/${collection.share_token}`} key={collection.id}>
          <span className="board-search-cover">{collection.cover_url ? <img src={collection.cover_url} alt="" /> : <FolderHeart size={20} />}</span>
          <span><strong>{collection.name}</strong><small>{collection.item_count} saves · by {collection.owner_name}</small></span>
          <ArrowUpRight size={15} />
        </Link>
      ))}</div> : null}
    </section>
  )
}
