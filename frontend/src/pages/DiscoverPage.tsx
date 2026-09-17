import { useInfiniteQuery } from '@tanstack/react-query'
import { ArrowRight, LoaderCircle, Search, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { ImageCard } from '../components/ImageCard'
import { SocialSearchResults } from '../components/SocialSearchResults'

const topics = ['All', 'Travel', 'Interior', 'Fashion', 'Nature', 'Architecture']

export function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') ?? ''
  const initialTopic = topics.includes(searchParams.get('topic') ?? '') ? searchParams.get('topic')! : 'All'
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery)
  const [activeTopic, setActiveTopic] = useState(initialTopic)
  const inputRef = useRef<HTMLInputElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const effectiveQuery = debouncedQuery || (activeTopic === 'All' ? '' : activeTopic)
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['search', effectiveQuery],
    queryFn: ({ pageParam }) => api.search(effectiveQuery, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  })

  const results = useMemo(() => {
    const seen = new Set<string>()
    return (data?.pages.flatMap((page) => page.results) ?? []).filter((image) => {
      if (seen.has(image.id)) return false
      seen.add(image.id)
      return true
    })
  }, [data])
  const firstPage = data?.pages[0]

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextQuery = query.trim()
      setDebouncedQuery(nextQuery)
      const next = new URLSearchParams()
      if (nextQuery) next.set('q', nextQuery)
      else if (activeTopic !== 'All') next.set('topic', activeTopic)
      setSearchParams(next, { replace: true })
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [query, activeTopic, setSearchParams])

  useEffect(() => {
    if ((location.state as { focusSearch?: boolean } | null)?.focusSearch) inputRef.current?.focus()
  }, [location.state])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasNextPage) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
    }, { rootMargin: '500px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const sourceLabel = firstPage?.source === 'pixabay'
    ? 'Pixabay'
    : firstPage?.source === 'wikimedia'
      ? 'Wikimedia Commons'
      : firstPage?.fallback
        ? 'Offline fallback'
        : 'Mosaic picks'

  return (
    <>
      <section className="hero-copy">
        <div><span className="eyebrow"><Sparkles size={13} /> DISCOVER SOMETHING WORTH KEEPING</span><h1>Your internet,<br /><em>worth remembering.</em></h1></div>
        <p>Collect images, ideas, and references into spaces you can actually find again.</p>
      </section>

      <div className="discover-search">
        <Search size={20} />
        <input aria-label="Search images" ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveTopic('All') }} placeholder="Try “Tokyo”, “ceramics”, or “architecture”" />
        <button aria-label="Search" onClick={() => setDebouncedQuery(query.trim())}><ArrowRight size={19} /></button>
      </div>

      <div className="topic-row">
        {topics.map((topic) => <button key={topic} className={activeTopic === topic ? 'active' : ''} onClick={() => { setActiveTopic(topic); setQuery(''); setDebouncedQuery('') }}>{topic}</button>)}
      </div>

      <SocialSearchResults query={debouncedQuery} />

      <section className="section-head"><div><span className="eyebrow">CURATED FOR YOU</span><h2>{effectiveQuery ? `Ideas for “${effectiveQuery}”` : 'Things you might want later'}</h2></div><span className="result-count">{sourceLabel} · {results.length}{hasNextPage ? '+' : ''} finds</span></section>
      {isLoading ? (
        <div className="masonry-grid">{Array.from({ length: 8 }).map((_, index) => <div className="image-skeleton" key={index} />)}</div>
      ) : isError ? (
        <div className="empty-state"><Search size={28} /><h3>Search is taking a break.</h3><p>Your saved collections are still available. Try again in a moment.</p></div>
      ) : results.length ? (
        <>
          <div className="masonry-grid">{results.map((image) => <ImageCard key={image.id} image={image} />)}</div>
          <div className="discovery-loader" ref={loadMoreRef} aria-live="polite">
            {isFetchingNextPage ? <><LoaderCircle size={17} className="spin" /> Finding more ideas…</> : hasNextPage ? 'Keep scrolling for more' : effectiveQuery ? 'You reached the end of these results.' : null}
          </div>
        </>
      ) : (
        <div className="empty-state"><Search size={28} /><h3>Nothing here yet.</h3><p>Try a broader search or one of the topics above.</p></div>
      )}
    </>
  )
}
