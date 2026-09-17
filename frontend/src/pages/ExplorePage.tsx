import { useInfiniteQuery } from '@tanstack/react-query'
import { Compass } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { PublicPinCard } from '../components/PublicPinCard'

export function ExplorePage() {
  const [mode, setMode] = useState<'all' | 'following' | 'trending'>('all')
  const sentinel = useRef<HTMLDivElement>(null)
  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['explore', mode],
    queryFn: ({ pageParam }) => api.explore(pageParam, mode),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
  })
  const pins = [...new Map((data?.pages.flatMap((page) => page.pins) ?? []).map((pin) => [pin.id, pin])).values()]

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
      <section className="section-head explore-section-head"><div><span className="eyebrow">EXPLORE</span><h2>{mode === 'following' ? 'Fresh saves from people you follow' : mode === 'trending' ? 'Pins people are talking about' : 'Fresh saves from public collections'}</h2></div><div className="feed-switch" aria-label="Explore feed"><button className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>For you</button><button className={mode === 'following' ? 'active' : ''} onClick={() => setMode('following')}>Following</button><button className={mode === 'trending' ? 'active' : ''} onClick={() => setMode('trending')}>Trending</button></div></section>
      {isError ? <div className="empty-state"><h3>Could not load this view.</h3><p>Reconnect and try again.</p><button className="secondary-button" onClick={() => void refetch()}>Try again</button></div> : isLoading ? <div className="masonry-grid">{Array.from({ length: 10 }).map((_, index) => <div className="image-skeleton" key={index} />)}</div> : pins.length ? <div className="masonry-grid">{pins.map((pin) => <PublicPinCard pin={pin} key={pin.id} />)}</div> : <div className="empty-state large"><Compass size={30} /><h3>{mode === 'following' ? 'Your following feed is quiet.' : 'Nothing public yet.'}</h3><p>{mode === 'following' ? 'Follow curators from Explore or their profiles and their public saves will appear here.' : 'Make a collection public and it will show up here.'}</p>{mode === 'following' && <button className="secondary-button" onClick={() => setMode('all')}>Browse everyone</button>}</div>}
      <div ref={sentinel} className="feed-sentinel">{isFetchingNextPage ? 'Finding more…' : hasNextPage ? <button className="secondary-button" onClick={() => void fetchNextPage()}>Load more</button> : pins.length ? 'You reached the end.' : ''}</div>
    </>
  )
}
