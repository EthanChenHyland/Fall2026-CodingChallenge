import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Search, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { ImageCard } from '../components/ImageCard'

const topics = ['All', 'Travel', 'Interior', 'Fashion', 'Nature', 'Architecture']

export function DiscoverPage() {
  const [query, setQuery] = useState('')
  const [activeTopic, setActiveTopic] = useState('All')
  const inputRef = useRef<HTMLInputElement>(null)
  const effectiveQuery = query || (activeTopic === 'All' ? '' : activeTopic)
  const { data, isLoading } = useQuery({ queryKey: ['search', effectiveQuery], queryFn: () => api.search(effectiveQuery) })

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

  return (
    <>
      <section className="hero-copy">
        <div><span className="eyebrow"><Sparkles size={13} /> DISCOVER SOMETHING WORTH KEEPING</span><h1>Your internet,<br /><em>worth remembering.</em></h1></div>
        <p>Collect images, ideas, and references into spaces you can actually find again.</p>
      </section>

      <div className="discover-search">
        <Search size={20} />
        <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveTopic('All') }} placeholder="Try “Tokyo”, “ceramics”, or “architecture”" />
        <button aria-label="Search"><ArrowRight size={19} /></button>
      </div>

      <div className="topic-row">
        {topics.map((topic) => <button key={topic} className={activeTopic === topic ? 'active' : ''} onClick={() => { setActiveTopic(topic); setQuery('') }}>{topic}</button>)}
      </div>

      <section className="section-head"><div><span className="eyebrow">CURATED FOR YOU</span><h2>{effectiveQuery ? `Ideas for “${effectiveQuery}”` : 'Things you might want later'}</h2></div><span className="result-count">{data?.results.length ?? 0} finds</span></section>
      {isLoading ? <div className="masonry-grid">{Array.from({ length: 8 }).map((_, index) => <div className="image-skeleton" key={index} />)}</div> : data?.results.length ? <div className="masonry-grid">{data.results.map((image) => <ImageCard key={image.id} image={image} />)}</div> : <div className="empty-state"><Search size={28} /><h3>Nothing here yet.</h3><p>Try a broader search or one of the topics above.</p></div>}
    </>
  )
}
