import { useInfiniteQuery } from '@tanstack/react-query'
import { Compass, Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { api } from '../api'
import { PublicPinCard } from '../components/PublicPinCard'

export function ExplorePage() {
  const sentinel = useRef<HTMLDivElement>(null)
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['explore'],
    queryFn: ({ pageParam }) => api.explore(pageParam),
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
      <section className="section-head"><div><span className="eyebrow">EXPLORE</span><h2>Fresh saves from public collections</h2></div><span className="result-count">{pins.length} loaded</span></section>
      {isLoading ? <div className="masonry-grid">{Array.from({ length: 10 }).map((_, index) => <div className="image-skeleton" key={index} />)}</div> : pins.length ? <div className="masonry-grid">{pins.map((pin) => <PublicPinCard pin={pin} key={pin.id} />)}</div> : <div className="empty-state large"><Compass size={30} /><h3>Nothing public yet.</h3><p>Make a collection public and it will show up here.</p></div>}
      <div ref={sentinel} className="feed-sentinel">{isFetchingNextPage ? 'Finding more…' : hasNextPage ? '' : pins.length ? 'You reached the end.' : ''}</div>
    </>
  )
}
