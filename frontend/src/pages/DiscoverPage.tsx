import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Bookmark, LoaderCircle, Search, Shuffle, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { FilterMenu } from '../components/FilterMenu'
import { ImageCard } from '../components/ImageCard'
import { ImageFilterControls } from '../components/ImageFilterControls'
import { PublicPinCard } from '../components/PublicPinCard'
import { SocialSearchResults } from '../components/SocialSearchResults'
import { applyImageFilters, type ImageOrder, type ImageOrientation } from '../lib/imageFilters'

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
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  const searchOwnerId = me.data?.user.id
  const recentSearchKey = searchOwnerId ? `mosaic:recent-searches:${searchOwnerId}` : ''
  const savedSearchKey = searchOwnerId ? `mosaic:saved-searches:${searchOwnerId}` : ''
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') ?? ''
  const initialTopic = topics.includes(searchParams.get('topic') ?? '') ? searchParams.get('topic')! : 'All'
  const [query, setQuery] = useState(initialQuery)
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery)
  const [activeTopic, setActiveTopic] = useState(initialTopic)
  const [searchKind, setSearchKind] = useState<SearchKind>('All')
  const [imageOrientation, setImageOrientation] = useState<ImageOrientation>('all')
  const [imageOrder, setImageOrder] = useState<ImageOrder>('default')
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [autocompleteOpen, setAutocompleteOpen] = useState(false)
  const [searchMemoryVersion, setSearchMemoryVersion] = useState(0)
  const [browseSeed, setBrowseSeed] = useState(randomBrowseSeed)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery.trim())
  const inputRef = useRef<HTMLInputElement>(null)
  const searchWrapRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const effectiveQuery = submittedQuery || (activeTopic === 'All' ? '' : activeTopic)
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = useInfiniteQuery({
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
    queryKey: ['search-autocomplete', debouncedQuery],
    queryFn: () => api.searchRecommendations(debouncedQuery),
    enabled: debouncedQuery.length >= 1 && debouncedQuery !== submittedQuery,
    staleTime: 30_000,
  })
  const autocompleteSuggestions = debouncedQuery === query.trim() ? autocomplete.data?.suggestions.slice(0, 6) ?? [] : []
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
  const filteredResults = useMemo(() => applyImageFilters(results, imageOrientation, imageOrder), [imageOrder, imageOrientation, results])
  const firstPage = data?.pages[0]
  const showImages = searchKind === 'All' || searchKind === 'Images'
  const showPeople = searchKind === 'All' || searchKind === 'People'
  const showCollections = searchKind === 'All' || searchKind === 'Collections'
  const showPins = searchKind === 'All' || searchKind === 'Pins'
  const activeFilterCount = Number(searchKind !== 'All') + Number(imageOrientation !== 'all') + Number(imageOrder !== 'default')
  const showAutocomplete = autocompleteOpen && query.trim() !== submittedQuery && debouncedQuery.length >= 1
  void searchMemoryVersion
  const recentSearches = recentSearchKey ? readStoredSearches(recentSearchKey) : []
  const savedSearches = savedSearchKey ? readStoredSearches(savedSearchKey) : []

  const rememberSearch = (value: string) => {
    const normalized = value.trim()
    if (!normalized) return
    const next = [normalized, ...recentSearches.filter((entry) => entry.toLowerCase() !== normalized.toLowerCase())].slice(0, 8)
    if (recentSearchKey) {
      window.localStorage.setItem(recentSearchKey, JSON.stringify(next))
      setSearchMemoryVersion((current) => current + 1)
    }
  }

  const toggleSavedSearch = (value: string) => {
    const normalized = value.trim()
    if (!normalized) return
    const exists = savedSearches.some((entry) => entry.toLowerCase() === normalized.toLowerCase())
    const next = exists ? savedSearches.filter((entry) => entry.toLowerCase() !== normalized.toLowerCase()) : [normalized, ...savedSearches].slice(0, 8)
    if (savedSearchKey) {
      window.localStorage.setItem(savedSearchKey, JSON.stringify(next))
      setSearchMemoryVersion((current) => current + 1)
    }
  }

  useEffect(() => {
    if ((location.state as { focusSearch?: boolean } | null)?.focusSearch) inputRef.current?.focus()
  }, [location.state])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 280)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasNextPage || isFetchNextPageError) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
    }, { rootMargin: '500px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError])

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
    setActiveSuggestion(-1)
    setAutocompleteOpen(false)
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
    setAutocompleteOpen(false)
    setActiveTopic('All')
    setSubmittedQuery(nextQuery)
    setBrowseSeed(randomBrowseSeed())
    setSearchParams(nextQuery ? { q: nextQuery } : {}, { replace: true })
    rememberSearch(nextQuery)
  }

  const chooseTopic = (topic: string) => {
    setAutocompleteOpen(false)
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

      <div
        className="discover-search-wrap"
        ref={searchWrapRef}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setAutocompleteOpen(false)
            setActiveSuggestion(-1)
          }
        }}
      >
        <form className="discover-search" onSubmit={submitSearch}>
          <Search size={20} />
          <input
            aria-label="Search images"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showAutocomplete && autocompleteSuggestions.length > 0}
            aria-controls="search-suggestions-listbox"
            aria-activedescendant={activeSuggestion >= 0 ? `search-suggestion-${activeSuggestion}` : undefined}
            ref={inputRef}
            value={query}
            onFocus={() => setAutocompleteOpen(true)}
            onChange={(event) => { setQuery(event.target.value); setActiveTopic('All'); setActiveSuggestion(-1); setAutocompleteOpen(true) }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { setAutocompleteOpen(false); setActiveSuggestion(-1); return }
              if (!autocompleteSuggestions.length || query.trim() === submittedQuery) return
              if (event.key === 'ArrowDown') { event.preventDefault(); setAutocompleteOpen(true); setActiveSuggestion((current) => Math.min(current + 1, autocompleteSuggestions.length - 1)) }
              else if (event.key === 'ArrowUp') { event.preventDefault(); setAutocompleteOpen(true); setActiveSuggestion((current) => Math.max(current - 1, 0)) }
              else if (event.key === 'Enter' && activeSuggestion >= 0) { event.preventDefault(); chooseSuggestion(autocompleteSuggestions[activeSuggestion]) }
            }}
            placeholder="Try “Tokyo”, “ceramics”, or “architecture”"
          />
          <button type="submit" aria-label="Search"><ArrowRight size={19} /></button>
        </form>
        {showAutocomplete ? <div className="search-autocomplete-popover">
          {autocomplete.isFetching && debouncedQuery === query.trim() ? <div className="search-autocomplete-status" role="status" aria-live="polite"><LoaderCircle size={13} className="spin" /> Finding suggestions…</div> : null}
          {autocomplete.isError && debouncedQuery === query.trim() ? <div className="search-autocomplete-status error" role="status" aria-live="polite"><span>Suggestions are unavailable right now.</span><button onClick={() => void autocomplete.refetch()}>Retry</button></div> : null}
          {autocompleteSuggestions.length ? <div id="search-suggestions-listbox" className="search-autocomplete" role="listbox" aria-label="Search suggestions">{autocompleteSuggestions.map((suggestion, suggestionIndex) => <button id={`search-suggestion-${suggestionIndex}`} role="option" aria-selected={activeSuggestion === suggestionIndex} key={suggestion} onMouseEnter={() => setActiveSuggestion(suggestionIndex)} onClick={() => chooseSuggestion(suggestion)}><Search size={13} /><span>{suggestion}</span><ArrowRight size={12} /></button>)}</div> : null}
        </div> : null}
      </div>

      {(recentSearches.length || savedSearches.length) ? <div className="search-memory" aria-label="Saved and recent searches">
        {savedSearches.length ? <div><span className="eyebrow">SAVED</span><div>{savedSearches.map((entry) => <button key={`saved-${entry}`} onClick={() => chooseSuggestion(entry)}>{entry}<Bookmark size={11} fill="currentColor" /></button>)}</div></div> : null}
        {recentSearches.length ? <div><span className="eyebrow">RECENT</span><div>{recentSearches.map((entry) => <button key={`recent-${entry}`} onClick={() => chooseSuggestion(entry)}>{entry}</button>)}<button className="search-memory-clear" aria-label="Clear recent searches" onClick={() => { if (recentSearchKey) { window.localStorage.removeItem(recentSearchKey); setSearchMemoryVersion((current) => current + 1) } }}><X size={11} /> Clear</button></div></div> : null}
      </div> : null}

      <div className="topic-filter-row">
        <div className="topic-row">
          {topics.map((topic) => <button key={topic} className={activeTopic === topic ? 'active' : ''} onClick={() => chooseTopic(topic)}>{topic}</button>)}
        </div>
        <div className="discovery-filter-actions" aria-label="Discovery controls">
          <FilterMenu activeCount={activeFilterCount} label="Discovery filters">
            <label><span>Results</span><select aria-label="Result type" value={searchKind} onChange={(event) => setSearchKind(event.target.value as SearchKind)}>{searchKinds.map((kind) => <option value={kind} key={kind}>{kind}</option>)}</select></label>
            <ImageFilterControls orientation={imageOrientation} order={imageOrder} onOrientationChange={setImageOrientation} onOrderChange={setImageOrder} showHeading={false} />
            {activeFilterCount > 0 ? <button type="button" className="filter-reset" onClick={() => { setSearchKind('All'); setImageOrientation('all'); setImageOrder('default') }}><X size={13} /> Reset filters</button> : null}
          </FilterMenu>
          {submittedQuery ? <button type="button" className={`save-search-filter${savedSearches.some((entry) => entry.toLowerCase() === submittedQuery.toLowerCase()) ? ' saved' : ''}`} onClick={() => toggleSavedSearch(submittedQuery)}><Bookmark size={12} fill={savedSearches.some((entry) => entry.toLowerCase() === submittedQuery.toLowerCase()) ? 'currentColor' : 'none'} /> {savedSearches.some((entry) => entry.toLowerCase() === submittedQuery.toLowerCase()) ? 'Saved' : 'Save search'}</button> : null}
        </div>
      </div>

      {recommendations.data?.suggestions.length ? <section className="search-suggestions" aria-label="Recommended searches"><div className="search-suggestions-title"><Sparkles size={14} /><span>{submittedQuery ? 'Related searches' : 'Suggested for you'}</span>{recommendations.data.aiEnhanced ? <span className="ai-assist-badge">AI assisted</span> : null}{!submittedQuery && recommendations.data.basedOn.length ? <small>Based on {recommendations.data.basedOn.slice(0, 3).join(' · ')}</small> : null}</div><div className="search-suggestion-chips">{recommendations.data.suggestions.map((suggestion) => <button key={suggestion} onClick={() => chooseSuggestion(suggestion)}>{suggestion}</button>)}</div></section> : null}

      {(showPeople || showCollections) && <SocialSearchResults query={submittedQuery} showPeople={showPeople} showCollections={showCollections} />}

      {showPins && recommendations.data?.pins.length ? <section className="search-recommendation-section"><div className="section-head"><div><span className="eyebrow">RECOMMENDED FOR YOU</span><h2>{submittedQuery ? `More around “${submittedQuery}”` : 'Start with something that fits your taste'}</h2></div>{recommendations.data.basedOn.length ? <span className="result-count">Because you saved {recommendations.data.basedOn.slice(0, 3).join(' · ')}</span> : null}</div><div className="masonry-grid recommendation-grid">{recommendations.data.pins.map((pin) => <PublicPinCard pin={pin} key={`search-recommended-${pin.id}`} onRecommendationFeedback={(pinId, signal) => feedback.mutate({ pinId, signal })} feedbackPending={feedback.isPending} />)}</div></section> : null}

      {showImages && <section className="section-head browse-section-head"><div><span className="eyebrow">BROWSE</span><h2>{browseTitle}</h2></div><div className="browse-head-actions"><span className="result-count">{sourceLabel} · {filteredResults.length}{hasNextPage ? '+' : ''} finds</span>{!effectiveQuery && firstPage?.source === 'pixabay' ? <button className="secondary-button" onClick={() => setBrowseSeed(randomBrowseSeed())}><Shuffle size={14} /> Shuffle</button> : null}</div></section>}
      {showImages && firstPage?.providerUnavailable ? <div className="provider-notice" role="status"><span>Pixabay is temporarily busy, so Mosaic is showing local picks for now.</span><button className="secondary-button" onClick={() => void refetch()}>Retry Pixabay</button></div> : null}
      {showImages && (isLoading ? (
        <div className="masonry-grid">{Array.from({ length: 8 }).map((_, index) => <div className="image-skeleton" key={index} />)}</div>
      ) : isError && !results.length ? (
        <div className="empty-state"><Search size={28} /><h3>Search is taking a break.</h3><p>Your collections are safe. Retry the search or browse a saved topic.</p><div className="empty-actions"><button className="primary-button" onClick={() => void refetch()}>Try again</button><button className="secondary-button" onClick={() => chooseTopic('Architecture')}>Browse architecture</button></div></div>
      ) : results.length ? (
        <>
          {filteredResults.length ? <div className="masonry-grid">{filteredResults.map((image) => <ImageCard key={image.id} image={image} />)}</div> : <div className="empty-state compact"><SlidersHorizontal size={24} /><h3>No loaded images match these filters.</h3><p>More results can still load below, or clear the image filters.</p><button className="secondary-button" onClick={() => { setImageOrientation('all'); setImageOrder('default') }}>Clear image filters</button></div>}
          <div className="discovery-loader" ref={loadMoreRef} aria-live="polite">
            {isFetchingNextPage ? <><LoaderCircle size={17} className="spin" /> Finding more ideas…</> : isFetchNextPageError ? <><span>Pixabay paused while loading more.</span><button className="secondary-button" onClick={() => void fetchNextPage()}>Retry loading more</button></> : hasNextPage ? null : effectiveQuery ? 'You reached the end of these results.' : null}
          </div>
        </>
      ) : (
        <div className="empty-state"><Search size={28} /><h3>No matches for that one.</h3><p>Try a broader phrase, or jump back into a visual trail.</p><div className="empty-topic-actions">{['Travel', 'Interior', 'Nature'].map((topic) => <button key={topic} onClick={() => chooseTopic(topic)}>{topic}</button>)}</div></div>
      ))}
    </>
  )
}
