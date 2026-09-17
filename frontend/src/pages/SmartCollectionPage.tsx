import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Clock3, FolderOpen, Heart, Sparkles } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { api } from '../api'

const meta = {
  recent: { title: 'Recently saved', copy: 'Your newest references across every collection.', Icon: Clock3 },
  popular: { title: 'Most liked', copy: 'The saves getting the most attention.', Icon: Heart },
  unsorted: { title: 'Unsorted', copy: 'Pins that still need a note or tags.', Icon: FolderOpen },
} as const

export function SmartCollectionPage() {
  const raw = useParams().mode
  const valid = raw === 'recent' || raw === 'popular' || raw === 'unsorted'
  const mode = valid ? raw : 'recent'
  const { data, isLoading } = useQuery({ queryKey: ['smart-collection', mode], queryFn: () => api.smartCollection(mode), enabled: valid })
  if (!valid) return <Navigate to="/collections" replace />
  const detail = meta[mode]
  const Icon = detail.Icon

  return (
    <>
      <Link className="back-link" to="/collections"><ArrowLeft size={16} /> All collections</Link>
      <section className="smart-hero">
        <span className="smart-hero-icon"><Icon size={20} /></span>
        <div><span className="eyebrow">SMART VIEW</span><h1>{detail.title}</h1><p>{detail.copy}</p></div>
      </section>
      {isLoading ? <div className="saved-grid"><div className="collection-skeleton" /><div className="collection-skeleton" /></div> : data?.items.length ? (
        <div className="saved-grid smart-saved-grid">
          {data.items.map((item) => (
            <Link className="saved-card smart-saved-card" to={`/collections/${item.collection_id}`} key={item.id}>
              <img src={item.image_url} alt={item.title} loading="lazy" decoding="async" />
              <div className="saved-card-copy"><div><strong>{item.title}</strong><p>{item.collection_name}</p>{item.tags && <span className="tag-line">{item.tags}</span>}</div>{mode === 'popular' && <span className="smart-like-count"><Heart size={12} /> {item.like_count ?? 0}</span>}</div>
            </Link>
          ))}
        </div>
      ) : <div className="empty-state large"><Sparkles size={28} /><h3>{mode === 'unsorted' ? 'Everything is organized.' : 'Nothing here yet.'}</h3><p>{mode === 'unsorted' ? 'Every save has a note or tags.' : 'Keep collecting and this view will fill itself.'}</p></div>}
    </>
  )
}
