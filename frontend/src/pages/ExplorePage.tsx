import { useInfiniteQuery } from '@tanstack/react-query'
import { Compass, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { PublicPinCard } from '../components/PublicPinCard'

export function ExplorePage() {
  const [mode, setMode] = useState<'all' | 'following' | 'trending'>('all')
  const sentinel = useRef<HTMLDivElement>(null)
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['explore', mode],
    queryFn: ({ pageParam }) => api.explore(pageParam, mode),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
  })
  const pins = data?.pages.flatMap((page) => page.pins) ?? []

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
        <span className="eyebrow"><Sparkles size={13} /> FROM AROUND MOSAIC</span>
        <h1>See what people<br /><em>couldn’t leave behind.</em></h1>
        <p>Public collections, mixed into one wall of references, places, objects, and ideas.</p>
      </section>
      <section className="section-head explore-section-head"><div><span className="eyebrow">EXPLORE</span><h2>{mode === 'following' ? 'Fresh saves from people you follow' : mode === 'trending' ? 'Pins people are talking about' : 'Fresh saves from public collections'}</h2></div><div className="feed-switch" aria-label="Explore feed"><button className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>For you</button><button className={mode === 'following' ? 'active' : ''} onClick={() => setMode('following')}>Following</button><button className={mode === 'trending' ? 'active' : ''} onClick={() => setMode('trending')}>Trending</button></div></section>
      {isLoading ? <div className="masonry-grid">{Array.from({ length: 10 }).map((_, index) => <div className="image-skeleton" key={index} />)}</div> : pins.length ? <div className="masonry-grid">{pins.map((pin) => <PublicPinCard pin={pin} key={pin.id} />)}</div> : <div className="empty-state large"><Compass size={30} /><h3>{mode === 'following' ? 'Your following feed is quiet.' : 'Nothing public yet.'}</h3><p>{mode === 'following' ? 'Follow curators from Explore or their profiles and their public saves will appear here.' : 'Make a collection public and it will show up here.'}</p>{mode === 'following' && <button className="secondary-button" onClick={() => setMode('all')}>Browse everyone</button>}</div>}
      <div ref={sentinel} className="feed-sentinel">{isFetchingNextPage ? 'Finding more…' : hasNextPage ? '' : pins.length ? 'You reached the end.' : ''}</div>
    </>
  )
}
