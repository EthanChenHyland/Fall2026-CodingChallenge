import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckSquare2, Compass, Shuffle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import { ImageCard } from '../components/ImageCard'
import { PublicPinCard } from '../components/PublicPinCard'
import { rememberCollection } from '../lib/recentCollection'

const randomBrowseSeed = () => Math.floor(Math.random() * 0x1_0000_0000)

export function ExplorePage() {
  const [mode, setMode] = useState<'all' | 'following' | 'trending'>('all')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [destinationId, setDestinationId] = useState('')
  const [webSeed, setWebSeed] = useState(randomBrowseSeed)
  const sentinel = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const recommendations = useQuery({ queryKey: ['recommendations'], queryFn: api.recommendations })
  const webDiscovery = useQuery({
    queryKey: ['explore-web', webSeed],
    queryFn: () => api.search('', 1, '', webSeed),
    enabled: mode === 'all',
    staleTime: 5 * 60 * 1000,
  })
  const feedback = useMutation({
    mutationFn: ({ pinId, signal }: { pinId: number; signal: 'more' | 'not_interested' }) => api.recommendationFeedback(pinId, signal),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['recommendations'] })
      void queryClient.invalidateQueries({ queryKey: ['search-recommendations'] })
      toast.success(variables.signal === 'more' ? 'We’ll show you more like this' : 'Recommendation hidden')
    },
    onError: (error: Error) => toast.error(error.message),
  })
  const collectionsQuery = useQuery({ queryKey: ['collections'], queryFn: api.collections })
  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['explore', mode],
    queryFn: ({ pageParam }) => api.explore(pageParam, mode),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
  })
  const pins = [...new Map((data?.pages.flatMap((page) => page.pins) ?? []).map((pin) => [pin.id, pin])).values()]
  const collections = collectionsQuery.data?.collections ?? []
  const resolvedDestinationId = collections.some((collection) => String(collection.id) === destinationId)
    ? destinationId
    : collections[0] ? String(collections[0].id) : ''

  const batchSave = useMutation({
    mutationFn: ({ pinIds, collectionId }: { pinIds: number[]; collectionId: number }) => api.savePinsBatch(pinIds, collectionId),
    onSuccess: (result, variables) => {
      rememberCollection(variables.collectionId)
      void queryClient.invalidateQueries({ queryKey: ['collections'] })
      void queryClient.invalidateQueries({ queryKey: ['collection', variables.collectionId] })
      void queryClient.invalidateQueries({ queryKey: ['pin-saved-in'] })
      const parts: string[] = []
      if (result.savedCount) parts.push(`${result.savedCount} saved`)
      if (result.skippedCount) parts.push(`${result.skippedCount} already there`)
      if (result.unavailableIds.length) parts.push(`${result.unavailableIds.length} unavailable`)
      if (result.savedCount) toast.success(parts.join(' · '))
      else toast.info(parts.join(' · ') || 'Nothing to save')
      setSelectedIds(new Set())
      setSelectionMode(false)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const toggleSelection = (pinId: number) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(pinId)) next.delete(pinId)
      else if (next.size < 30) next.add(pinId)
      else toast.info('You can save up to 30 pins at once')
      return next
    })
  }

  const toggleSelectionMode = () => {
    if (selectionMode) setSelectedIds(new Set())
    setSelectionMode((current) => !current)
  }

  const changeMode = (nextMode: typeof mode) => {
    setMode(nextMode)
    setSelectedIds(new Set())
  }

  useEffect(() => {
    if (!sentinel.current) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
    }, { rootMargin: '500px' })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <>
      <section className="explore-hero">
        <span className="eyebrow">EXPLORE</span>
        <h1>What people are saving.</h1>
        <p>Public pins and collections from other Mosaic users.</p>
      </section>
      {mode === 'all' && recommendations.data?.pins.length ? (
        <section className="recommendation-section">
          <div className="section-head"><div><span className="eyebrow">BECAUSE YOU SAVED</span><h2>More in your orbit</h2></div><span className="result-count">{recommendations.data.basedOn.slice(0, 3).join(' · ')}</span></div>
          <div className="masonry-grid recommendation-grid">{recommendations.data.pins.slice(0, 8).map((pin) => <PublicPinCard pin={pin} key={`recommended-${pin.id}`} selectionMode={selectionMode} selected={selectedIds.has(pin.id)} onToggleSelection={toggleSelection} onRecommendationFeedback={(pinId, signal) => feedback.mutate({ pinId, signal })} feedbackPending={feedback.isPending} />)}</div>
        </section>
      ) : null}
      {mode === 'all' && webDiscovery.data?.results.length ? (
        <section className="explore-web-section">
          <div className="section-head explore-web-head">
            <div><span className="eyebrow">AROUND THE WEB</span><h2>{webDiscovery.data.source === 'pixabay' ? 'Fresh from Pixabay' : 'Fresh visual finds'}</h2></div>
            <button className="secondary-button" onClick={() => setWebSeed(randomBrowseSeed())}><Shuffle size={14} /> Shuffle</button>
          </div>
          <div className="masonry-grid explore-web-grid">{webDiscovery.data.results.slice(0, 8).map((image) => <ImageCard image={image} key={`explore-web-${image.id}`} />)}</div>
        </section>
      ) : null}
      <section className="section-head explore-section-head"><div><span className="eyebrow">EXPLORE</span><h2>{mode === 'following' ? 'Fresh saves from people you follow' : mode === 'trending' ? 'Pins people are talking about' : 'Fresh saves from public collections'}</h2></div><div className="explore-head-actions"><button className={`secondary-button explore-select-button${selectionMode ? ' active' : ''}`} onClick={toggleSelectionMode}><CheckSquare2 size={15} /> {selectionMode ? 'Done' : 'Select'}</button><div className="feed-switch" aria-label="Explore feed"><button className={mode === 'all' ? 'active' : ''} onClick={() => changeMode('all')}>For you</button><button className={mode === 'following' ? 'active' : ''} onClick={() => changeMode('following')}>Following</button><button className={mode === 'trending' ? 'active' : ''} onClick={() => changeMode('trending')}>Trending</button></div></div></section>
      {selectionMode && (
        <div className="explore-bulk-toolbar" role="region" aria-label="Save selected pins">
          <div className="explore-bulk-count"><strong>{selectedIds.size}</strong><span>{selectedIds.size === 1 ? 'pin selected' : 'pins selected'}</span></div>
          <label className="explore-bulk-destination"><span>Save to</span><select aria-label="Save selected to collection" value={resolvedDestinationId} onChange={(event) => setDestinationId(event.target.value)} disabled={!collections.length || batchSave.isPending}><option value="">Choose collection</option>{collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select></label>
          <button className="primary-button" disabled={!selectedIds.size || !resolvedDestinationId || batchSave.isPending} onClick={() => batchSave.mutate({ pinIds: [...selectedIds], collectionId: Number(resolvedDestinationId) })}>{batchSave.isPending ? 'Saving…' : 'Save selected'}</button>
          <button className="explore-clear-selection" aria-label="Clear selected pins" disabled={!selectedIds.size || batchSave.isPending} onClick={() => setSelectedIds(new Set())}><X size={16} /> Clear</button>
        </div>
      )}
      {isError ? <div className="empty-state"><h3>Could not load this view.</h3><p>Reconnect and try again.</p><button className="secondary-button" onClick={() => void refetch()}>Try again</button></div> : isLoading ? <div className="masonry-grid">{Array.from({ length: 10 }).map((_, index) => <div className="image-skeleton" key={index} />)}</div> : pins.length ? <div className="masonry-grid">{pins.map((pin) => <PublicPinCard pin={pin} key={pin.id} selectionMode={selectionMode} selected={selectedIds.has(pin.id)} onToggleSelection={toggleSelection} />)}</div> : <div className="empty-state large"><Compass size={30} /><h3>{mode === 'following' ? 'Your following feed is quiet.' : 'Nothing public yet.'}</h3><p>{mode === 'following' ? 'Follow curators from Explore or their profiles and their public saves will appear here.' : 'Make a collection public and it will show up here.'}</p>{mode === 'following' && <button className="secondary-button" onClick={() => changeMode('all')}>Browse everyone</button>}</div>}
      <div ref={sentinel} className="feed-sentinel">{isFetchingNextPage ? 'Finding more…' : hasNextPage ? <button className="secondary-button" onClick={() => void fetchNextPage()}>Load more</button> : pins.length ? 'You reached the end.' : ''}</div>
    </>
  )
}
