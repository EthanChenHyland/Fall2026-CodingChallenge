import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Clock3, FolderHeart, Globe2, Heart, Inbox, LockKeyhole, Plus, Search, Upload, UserRound, UsersRound } from 'lucide-react'
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { CollectionCover } from '../components/CollectionCover'
import { CreateCollectionDialog } from '../components/Dialogs'
import { ImportDialog } from '../components/ImportDialog'
import type { Collection } from '../types'

function AudienceLabel({ collection }: { collection: Collection }) {
  if (collection.audience === 'public') return <span className="collection-audience public"><Globe2 size={12} /> Public</span>
  if (collection.audience === 'followers') return <span className="collection-audience followers"><UsersRound size={12} /> Followers</span>
  return <span className="collection-audience private"><LockKeyhole size={12} /> Private</span>
}

function tiltCollectionCard(event: ReactPointerEvent<HTMLAnchorElement>) {
  if (event.pointerType === 'touch' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const box = event.currentTarget.getBoundingClientRect()
  const x = (event.clientX - box.left) / Math.max(box.width, 1)
  const y = (event.clientY - box.top) / Math.max(box.height, 1)
  event.currentTarget.style.setProperty('--card-rx', ((0.5 - y) * 3.2).toFixed(2) + 'deg')
  event.currentTarget.style.setProperty('--card-ry', ((x - 0.5) * 4.2).toFixed(2) + 'deg')
  event.currentTarget.style.setProperty('--card-px', (x * 100).toFixed(1) + '%')
  event.currentTarget.style.setProperty('--card-py', (y * 100).toFixed(1) + '%')
}

function resetCollectionCard(event: ReactPointerEvent<HTMLAnchorElement>) {
  event.currentTarget.style.setProperty('--card-rx', '0deg')
  event.currentTarget.style.setProperty('--card-ry', '0deg')
  event.currentTarget.style.setProperty('--card-px', '50%')
  event.currentTarget.style.setProperty('--card-py', '50%')
}

export function CollectionsPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['collections'], queryFn: api.collections })
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'name' | 'size'>('recent')
  const collections = useMemo(() => {
    const filtered = (data?.collections ?? []).filter((collection) => `${collection.name} ${collection.description}`.toLowerCase().includes(query.trim().toLowerCase()))
    return [...filtered].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? b.item_count - a.item_count : b.updated_at.localeCompare(a.updated_at))
  }, [data?.collections, query, sort])

  return (
    <>
      <section className="page-title-row">
        <div><span className="eyebrow">YOUR LIBRARY</span><h1>Collections</h1><p>Loose thoughts become useful when they have somewhere to live.</p></div>
        <div className="page-title-actions"><ImportDialog trigger={<button className="secondary-button"><Upload size={17} /> Import</button>} /><CreateCollectionDialog trigger={<button className="primary-button"><Plus size={17} /> New collection</button>} /></div>
      </section>
      <CreateCollectionDialog
        open={searchParams.get('new') === '1'}
        onOpenChange={(open) => { if (!open && searchParams.has('new')) { const next = new URLSearchParams(searchParams); next.delete('new'); setSearchParams(next, { replace: true }) } }}
      />
      <section className="smart-view-row" aria-label="Smart collections">
        <Link to="/collections/smart/recent"><Clock3 size={17} /><span><strong>Recently saved</strong><small>Newest across every board</small></span><ArrowUpRight size={15} /></Link>
        <Link to="/collections/smart/popular"><Heart size={17} /><span><strong>Most liked</strong><small>Your crowd favorites</small></span><ArrowUpRight size={15} /></Link>
        <Link to="/collections/smart/unsorted"><Inbox size={17} /><span><strong>Unsorted</strong><small>Needs a note or tags</small></span><ArrowUpRight size={15} /></Link>
      </section>
      {!!data?.collections.length && <div className="library-tools"><label><Search size={15} /><input aria-label="Find a collection" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a collection" /></label><select aria-label="Sort collections" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="recent">Recently changed</option><option value="name">Name</option><option value="size">Most saved</option></select></div>}
      {isError ? <div className="empty-state"><h3>Could not load this view.</h3><p>Reconnect and try again.</p><button className="secondary-button" onClick={() => void refetch()}>Try again</button></div> : isLoading ? <div className="collection-grid"><div className="collection-skeleton" /><div className="collection-skeleton" /></div> : collections.length ? (
        <div className="collection-grid">
          {collections.map((collection, index) => (
            <Link
              className="collection-card"
              to={`/collections/${collection.id}`}
              viewTransition
              key={collection.id}
              style={{ animationDelay: String(Math.min(index, 6) * 55) + 'ms' }}
              onPointerEnter={() => { void queryClient.prefetchQuery({ queryKey: ['collection', collection.id], queryFn: () => api.collection(collection.id) }) }}
              onFocus={() => { void queryClient.prefetchQuery({ queryKey: ['collection', collection.id], queryFn: () => api.collection(collection.id) }) }}
              onPointerMove={tiltCollectionCard}
              onPointerLeave={resetCollectionCard}
            >
              <div className="collection-cover" style={{ viewTransitionName: 'collection-' + collection.id }}><CollectionCover collection={collection} /><span className="open-badge"><ArrowUpRight size={16} /></span></div>
              <div className="collection-card-copy">
                <div className="collection-card-heading"><h3>{collection.name}</h3><span>{collection.item_count} saved</span></div>
                <p>{collection.description || 'No description yet.'}</p>
                <div className="collection-card-meta">
                  <AudienceLabel collection={collection} />
                  <span><UsersRound size={12} /> {collection.collaborator_count ?? 1} {(collection.collaborator_count ?? 1) === 1 ? 'curator' : 'curators'}</span>
                  {!!collection.follower_count && <span><Heart size={12} /> {collection.follower_count} {collection.follower_count === 1 ? 'follower' : 'followers'}</span>}
                </div>
                <div className="collection-card-byline">
                  <span className="collection-owner-avatar">{collection.owner_avatar ? <img src={collection.owner_avatar} alt="" /> : <UserRound size={13} />}</span>
                  <span>{collection.role === 'owner' ? 'Owned by you' : `Editing for ${collection.owner_name ?? 'collection owner'}`}</span>
                </div>
              </div>
            </Link>
          ))}
          {!query && <CreateCollectionDialog trigger={<button type="button" className="new-collection-tile"><span className="new-collection-preview" aria-hidden="true"><i /><i /><i /><i /></span><span className="new-collection-copy"><strong>Start a collection</strong><span>Gather a new visual thread.</span></span><span className="new-collection-plus"><Plus size={18} /></span></button>} />}
        </div>
      ) : data?.collections.length ? <div className="empty-state"><Search size={28} /><h3>No collections match “{query}”.</h3></div> : <div className="empty-state"><FolderHeart size={30} /><h3>Your first collection starts here.</h3><CreateCollectionDialog trigger={<button className="primary-button"><Plus size={17} /> Create collection</button>} /></div>}
    </>
  )
}
