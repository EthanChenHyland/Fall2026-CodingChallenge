import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Bookmark, LoaderCircle, Search, Sparkles, X } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { ImageCard } from '../components/ImageCard'
import { PublicPinCard } from '../components/PublicPinCard'
import { SocialSearchResults } from '../components/SocialSearchResults'

const topics = ['All', 'Travel', 'Interior', 'Fashion', 'Nature', 'Architecture']
const searchKinds = ['All', 'Images', 'People', 'Collections', 'Pins'] as const
type SearchKind = typeof searchKinds[number]
const randomBrowseSeed = () => Math.floor(Math.random() * 0x1_0000_0000)
const readStoredSearches = (key: string) => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string').slice(0, 8) : []
  } catch { return [] }
}

export function DiscoverPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') ?? ''
  const initialTopic = topics.includes(searchParams.get('topic') ?? '') ? searchParams.get('topic')! : 'All'
  const [query, setQuery] = useState(initialQuery)
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery)
  const [activeTopic, setActiveTopic] = useState(initialTopic)
  const [searchKind, setSearchKind] = useState<SearchKind>('All')
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readStoredSearches('mosaic:recent-searches'))
  const [savedSearches, setSavedSearches] = useState<string[]>(() => readStoredSearches('mosaic:saved-searches'))
  const [browseSeed, setBrowseSeed] = useState(randomBrowseSeed)
  const inputRef = useRef<HTMLInputElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const effectiveQuery = submittedQuery || (activeTopic === 'All' ? '' : activeTopic)
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['search', effectiveQuery, browseSeed],
    queryFn: ({ pageParam }) => api.search(effectiveQuery, pageParam.page, pageParam.source, browseSeed),
    initialPageParam: { page: 1, source: '' },
    getNextPageParam: (lastPage) => lastPage.nextPage ? { page: lastPage.nextPage, source: lastPage.source } : undefined,
  })
  const recommendations = useQuery({
    queryKey: ['search-recommendations', submittedQuery],
    queryFn: () => api.searchRecommendations(submittedQuery),
  })
  const autocomplete = useQuery({
    queryKey: ['search-autocomplete', query.trim()],
    queryFn: () => api.searchRecommendations(query.trim()),
    enabled: query.trim().length >= 2 && query.trim() !== submittedQuery,
    staleTime: 30_000,
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
  const showImages = searchKind === 'All' || searchKind === 'Images'
  const showPeople = searchKind === 'All' || searchKind === 'People'
  const showCollections = searchKind === 'All' || searchKind === 'Collections'
  const showPins = searchKind === 'All' || searchKind === 'Pins'

  const rememberSearch = (value: string) => {
    const normalized = value.trim()
    if (!normalized) return
    const next = [normalized, ...recentSearches.filter((entry) => entry.toLowerCase() !== normalized.toLowerCase())].slice(0, 8)
    setRecentSearches(next)
    window.localStorage.setItem('mosaic:recent-searches', JSON.stringify(next))
  }

  const toggleSavedSearch = (value: string) => {
    const normalized = value.trim()
    if (!normalized) return
    const exists = savedSearches.some((entry) => entry.toLowerCase() === normalized.toLowerCase())
    const next = exists ? savedSearches.filter((entry) => entry.toLowerCase() !== normalized.toLowerCase()) : [normalized, ...savedSearches].slice(0, 8)
    setSavedSearches(next)
    window.localStorage.setItem('mosaic:saved-searches', JSON.stringify(next))
  }

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
  const browseTitle = effectiveQuery
    ? `Results for “${effectiveQuery}”`
    : firstPage?.source === 'pixabay'
      ? 'Pixabay finds'
      : firstPage?.source === 'wikimedia'
        ? 'Wikimedia finds'
        : 'Recent finds'

  const chooseSuggestion = (suggestion: string) => {
    setActiveTopic('All')
    setQuery(suggestion)
    setSubmittedQuery(suggestion)
    setSearchParams({ q: suggestion }, { replace: true })
    rememberSearch(suggestion)
    inputRef.current?.focus()
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextQuery = query.trim()
    setActiveTopic('All')
    setSubmittedQuery(nextQuery)
    setBrowseSeed(randomBrowseSeed())
    setSearchParams(nextQuery ? { q: nextQuery } : {}, { replace: true })
    rememberSearch(nextQuery)
  }

  const chooseTopic = (topic: string) => {
    setActiveTopic(topic)
    setQuery('')
    setSubmittedQuery('')
    setBrowseSeed(randomBrowseSeed())
    setSearchParams(topic === 'All' ? {} : { topic }, { replace: true })
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

      <form className="discover-search" onSubmit={submitSearch}>
        <Search size={20} />
        <input aria-label="Search images" ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveTopic('All') }} placeholder="Try “Tokyo”, “ceramics”, or “architecture”" />
        <button type="submit" aria-label="Search"><ArrowRight size={19} /></button>
      </form>
      {autocomplete.data?.suggestions.length && query.trim() !== submittedQuery ? <div className="search-autocomplete" role="listbox" aria-label="Search suggestions">{autocomplete.data.suggestions.slice(0, 6).map((suggestion) => <button role="option" aria-selected="false" key={suggestion} onClick={() => chooseSuggestion(suggestion)}><Search size={13} /><span>{suggestion}</span><ArrowRight size={12} /></button>)}</div> : null}

      {(recentSearches.length || savedSearches.length) ? <div className="search-memory" aria-label="Saved and recent searches">
        {savedSearches.length ? <div><span className="eyebrow">SAVED</span><div>{savedSearches.map((entry) => <button key={`saved-${entry}`} onClick={() => chooseSuggestion(entry)}>{entry}<Bookmark size={11} fill="currentColor" /></button>)}</div></div> : null}
        {recentSearches.length ? <div><span className="eyebrow">RECENT</span><div>{recentSearches.map((entry) => <button key={`recent-${entry}`} onClick={() => chooseSuggestion(entry)}>{entry}</button>)}<button className="search-memory-clear" aria-label="Clear recent searches" onClick={() => { setRecentSearches([]); window.localStorage.removeItem('mosaic:recent-searches') }}><X size={11} /> Clear</button></div></div> : null}
      </div> : null}

      {submittedQuery ? <div className="search-filter-row" aria-label="Search result type"><div>{searchKinds.map((kind) => <button key={kind} className={searchKind === kind ? 'active' : ''} onClick={() => setSearchKind(kind)}>{kind}</button>)}</div><button className={savedSearches.some((entry) => entry.toLowerCase() === submittedQuery.toLowerCase()) ? 'saved' : ''} onClick={() => toggleSavedSearch(submittedQuery)}><Bookmark size={12} fill={savedSearches.some((entry) => entry.toLowerCase() === submittedQuery.toLowerCase()) ? 'currentColor' : 'none'} /> {savedSearches.some((entry) => entry.toLowerCase() === submittedQuery.toLowerCase()) ? 'Saved search' : 'Save search'}</button></div> : null}

      <div className="topic-row">
        {topics.map((topic) => <button key={topic} className={activeTopic === topic ? 'active' : ''} onClick={() => chooseTopic(topic)}>{topic}</button>)}
      </div>

      {recommendations.data?.suggestions.length ? <section className="search-suggestions" aria-label="Recommended searches"><div className="search-suggestions-title"><Sparkles size={14} /><span>{submittedQuery ? 'Related searches' : 'Suggested for you'}</span>{!submittedQuery && recommendations.data.basedOn.length ? <small>Based on {recommendations.data.basedOn.slice(0, 3).join(' · ')}</small> : null}</div><div className="search-suggestion-chips">{recommendations.data.suggestions.map((suggestion) => <button key={suggestion} onClick={() => chooseSuggestion(suggestion)}>{suggestion}</button>)}</div></section> : null}

      {(showPeople || showCollections) && <SocialSearchResults query={submittedQuery} showPeople={showPeople} showCollections={showCollections} />}

      {showPins && recommendations.data?.pins.length ? <section className="search-recommendation-section"><div className="section-head"><div><span className="eyebrow">RECOMMENDED FOR YOU</span><h2>{submittedQuery ? `More around “${submittedQuery}”` : 'Start with something that fits your taste'}</h2></div>{recommendations.data.basedOn.length ? <span className="result-count">Because you saved {recommendations.data.basedOn.slice(0, 3).join(' · ')}</span> : null}</div><div className="masonry-grid recommendation-grid">{recommendations.data.pins.map((pin) => <PublicPinCard pin={pin} key={`search-recommended-${pin.id}`} onRecommendationFeedback={(pinId, signal) => feedback.mutate({ pinId, signal })} feedbackPending={feedback.isPending} />)}</div></section> : null}

      {showImages && <section className="section-head"><div><span className="eyebrow">BROWSE</span><h2>{browseTitle}</h2></div><span className="result-count">{sourceLabel} · {results.length}{hasNextPage ? '+' : ''} finds</span></section>}
      {showImages && (isLoading ? (
        <div className="masonry-grid">{Array.from({ length: 8 }).map((_, index) => <div className="image-skeleton" key={index} />)}</div>
      ) : isError ? (
        <div className="empty-state"><Search size={28} /><h3>Search is taking a break.</h3><p>Your collections are safe. Retry the search or browse a saved topic.</p><div className="empty-actions"><button className="primary-button" onClick={() => void refetch()}>Try again</button><button className="secondary-button" onClick={() => chooseTopic('Architecture')}>Browse architecture</button></div></div>
      ) : results.length ? (
        <>
          <div className="masonry-grid">{results.map((image) => <ImageCard key={image.id} image={image} />)}</div>
          <div className="discovery-loader" ref={loadMoreRef} aria-live="polite">
            {isFetchingNextPage ? <><LoaderCircle size={17} className="spin" /> Finding more ideas…</> : hasNextPage ? <button className="secondary-button" onClick={() => void fetchNextPage()}>Load more</button> : effectiveQuery ? 'You reached the end of these results.' : null}
          </div>
        </>
      ) : (
        <div className="empty-state"><Search size={28} /><h3>No matches for that one.</h3><p>Try a broader phrase, or jump back into a visual trail.</p><div className="empty-topic-actions">{['Travel', 'Interior', 'Nature'].map((topic) => <button key={topic} onClick={() => chooseTopic(topic)}>{topic}</button>)}</div></div>
      ))}
    </>
  )
}
