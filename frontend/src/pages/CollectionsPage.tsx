import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Clock3, FolderHeart, Heart, Inbox, Plus, Search, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api'
import { CreateCollectionDialog } from '../components/Dialogs'
import type { Collection } from '../types'

function CollectionCover({ collection }: { collection: Collection }) {
  const images = collection.cover_urls?.length ? collection.cover_urls : collection.cover_url ? [collection.cover_url] : []
  if (!images.length) return <div className="blank-cover"><FolderHeart size={28} /><span>Ready for a first save</span></div>
  return (
    <div className={`collection-cover-mosaic count-${Math.min(images.length, 4)}`}>
      {images.slice(0, 4).map((url, index) => (
        <img
          key={`${url}-${index}`}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          style={index === 0 ? { objectPosition: `${collection.cover_focus_x ?? 50}% ${collection.cover_focus_y ?? 50}%` } : undefined}
        />
      ))}
    </div>
  )
}

export function CollectionsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const importInput = useRef<HTMLInputElement>(null)
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['collections'], queryFn: api.collections })
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'name' | 'size'>('recent')
  const importCollection = useMutation({
    mutationFn: api.importCollection,
    onSuccess: ({ collection }) => { void queryClient.invalidateQueries({ queryKey: ['collections'] }); toast.success('Collection imported privately'); navigate(`/collections/${collection.id}`) },
    onError: (error: Error) => toast.error(error.message),
  })
  const chooseImport = async (file?: File) => {
    if (!file) return
    try { importCollection.mutate(JSON.parse(await file.text()) as unknown) }
    catch { toast.error('Choose a valid Mosaic JSON export.') }
  }
  const collections = useMemo(() => {
    const filtered = (data?.collections ?? []).filter((collection) => `${collection.name} ${collection.description}`.toLowerCase().includes(query.trim().toLowerCase()))
    return [...filtered].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? b.item_count - a.item_count : b.updated_at.localeCompare(a.updated_at))
  }, [data?.collections, query, sort])

  return (
    <>
      <section className="page-title-row">
        <div><span className="eyebrow">YOUR LIBRARY</span><h1>Collections</h1><p>Loose thoughts become useful when they have somewhere to live.</p></div>
        <div className="page-title-actions"><input ref={importInput} hidden type="file" accept="application/json,.json" onChange={(event) => { void chooseImport(event.target.files?.[0]); event.currentTarget.value = '' }} /><button className="secondary-button" disabled={importCollection.isPending} onClick={() => importInput.current?.click()}><Upload size={17} /> Import</button><CreateCollectionDialog trigger={<button className="primary-button"><Plus size={17} /> New collection</button>} /></div>
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
          {collections.map((collection) => (
            <Link className="collection-card" to={`/collections/${collection.id}`} key={collection.id}>
              <div className="collection-cover"><CollectionCover collection={collection} /><span className="open-badge"><ArrowUpRight size={16} /></span></div>
              <div className="collection-card-copy"><div><h3>{collection.name}</h3><p>{collection.description || 'No description yet.'}</p></div><span>{collection.item_count} saved</span></div>
            </Link>
          ))}
          {!query && <CreateCollectionDialog trigger={<button className="new-collection-tile"><Plus size={24} /><span>Create another collection</span></button>} />}
        </div>
      ) : data?.collections.length ? <div className="empty-state"><Search size={28} /><h3>No collections match “{query}”.</h3></div> : <div className="empty-state"><FolderHeart size={30} /><h3>Your first collection starts here.</h3><CreateCollectionDialog trigger={<button className="primary-button"><Plus size={17} /> Create collection</button>} /></div>}
    </>
  )
}
