import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, LoaderCircle, Search, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { ImageCard } from '../components/ImageCard'
import { PublicPinCard } from '../components/PublicPinCard'
import { SocialSearchResults } from '../components/SocialSearchResults'

const topics = ['All', 'Travel', 'Interior', 'Fashion', 'Nature', 'Architecture']

export function DiscoverPage() {
  const queryClient = useQueryClient()
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
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['search', effectiveQuery],
    queryFn: ({ pageParam }) => api.search(effectiveQuery, pageParam.page, pageParam.source),
    initialPageParam: { page: 1, source: '' },
    getNextPageParam: (lastPage) => lastPage.nextPage ? { page: lastPage.nextPage, source: lastPage.source } : undefined,
  })
  const recommendations = useQuery({
    queryKey: ['search-recommendations', debouncedQuery],
    queryFn: () => api.searchRecommendations(debouncedQuery),
  })
  const feedback = useMutation({
    mutationFn: ({ pinId, signal }: { pinId: number; signal: 'more' | 'not_interested' }) => api.recommendationFeedback(pinId, signal),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['search-recommendations'] }); void queryClient.invalidateQueries({ queryKey: ['recommendations'] }) },
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
    const target = loadMoreRef.current
    if (!target || !hasNextPage) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
    }, { rootMargin: '500px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const sourceLabel = firstPage?.source === 'pixabay'
    ? 'Images from Pixabay'
    : firstPage?.source === 'wikimedia'
      ? 'Images from Wikimedia Commons'
      : firstPage?.fallback
        ? 'Catalog fallback'
      : 'Mosaic picks'

  const chooseSuggestion = (suggestion: string) => {
    setActiveTopic('All')
    setQuery(suggestion)
    setDebouncedQuery(suggestion)
    inputRef.current?.focus()
  }

  return (
    <>
      <section className="hero-copy">
        <div className="hero-copy-main">
          <span className="eyebrow">DISCOVER</span>
          <h1>Save the good stuff.</h1>
          <p>Search the web, keep what matters, and sort it into collections you can actually find again.</p>
        </div>
      </section>

      <div className="discover-search">
        <Search size={20} />
        <input aria-label="Search images" ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveTopic('All') }} placeholder="Try “Tokyo”, “ceramics”, or “architecture”" />
        <button aria-label="Search" onClick={() => setDebouncedQuery(query.trim())}><ArrowRight size={19} /></button>
      </div>

      <div className="topic-row">
        {topics.map((topic) => <button key={topic} className={activeTopic === topic ? 'active' : ''} onClick={() => { setActiveTopic(topic); setQuery(''); setDebouncedQuery('') }}>{topic}</button>)}
      </div>

      {recommendations.data?.suggestions.length ? <section className="search-suggestions" aria-label="Recommended searches"><div className="search-suggestions-title"><Sparkles size={14} /><span>{debouncedQuery ? 'Related searches' : 'Suggested for you'}</span>{!debouncedQuery && recommendations.data.basedOn.length ? <small>Based on {recommendations.data.basedOn.slice(0, 3).join(' · ')}</small> : null}</div><div className="search-suggestion-chips">{recommendations.data.suggestions.map((suggestion) => <button key={suggestion} onClick={() => chooseSuggestion(suggestion)}>{suggestion}</button>)}</div></section> : null}

      <SocialSearchResults query={debouncedQuery} />

      {recommendations.data?.pins.length ? <section className="search-recommendation-section"><div className="section-head"><div><span className="eyebrow">RECOMMENDED FOR YOU</span><h2>{debouncedQuery ? `More around “${debouncedQuery}”` : 'Start with something that fits your taste'}</h2></div>{recommendations.data.basedOn.length ? <span className="result-count">Because you saved {recommendations.data.basedOn.slice(0, 3).join(' · ')}</span> : null}</div><div className="masonry-grid recommendation-grid">{recommendations.data.pins.map((pin) => <PublicPinCard pin={pin} key={`search-recommended-${pin.id}`} onRecommendationFeedback={(pinId, signal) => feedback.mutate({ pinId, signal })} feedbackPending={feedback.isPending} />)}</div></section> : null}

      <section className="section-head"><div><span className="eyebrow">BROWSE</span><h2>{effectiveQuery ? `Results for “${effectiveQuery}”` : 'Recent finds'}</h2></div><span className="result-count">{sourceLabel} · {results.length}{hasNextPage ? '+' : ''} finds</span></section>
      {isLoading ? (
        <div className="masonry-grid">{Array.from({ length: 8 }).map((_, index) => <div className="image-skeleton" key={index} />)}</div>
      ) : isError ? (
        <div className="empty-state"><Search size={28} /><h3>Search is taking a break.</h3><p>Your collections are safe. Retry the search or browse a saved topic.</p><div className="empty-actions"><button className="primary-button" onClick={() => void refetch()}>Try again</button><button className="secondary-button" onClick={() => { setActiveTopic('Architecture'); setQuery(''); setDebouncedQuery('') }}>Browse architecture</button></div></div>
      ) : results.length ? (
        <>
          <div className="masonry-grid">{results.map((image) => <ImageCard key={image.id} image={image} />)}</div>
          <div className="discovery-loader" ref={loadMoreRef} aria-live="polite">
            {isFetchingNextPage ? <><LoaderCircle size={17} className="spin" /> Finding more ideas…</> : hasNextPage ? <button className="secondary-button" onClick={() => void fetchNextPage()}>Load more</button> : effectiveQuery ? 'You reached the end of these results.' : null}
          </div>
        </>
      ) : (
        <div className="empty-state"><Search size={28} /><h3>No matches for that one.</h3><p>Try a broader phrase, or jump back into a visual trail.</p><div className="empty-topic-actions">{['Travel', 'Interior', 'Nature'].map((topic) => <button key={topic} onClick={() => { setActiveTopic(topic); setQuery(''); setDebouncedQuery('') }}>{topic}</button>)}</div></div>
      )}
    </>
  )
}
