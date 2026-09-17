import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { BrandMark } from '../components/BrandMark'

export function SharedPage() {
  const token = useParams().token ?? ''
  const { data, isLoading, isError } = useQuery({
    queryKey: ['shared', token],
    queryFn: () => api.sharedCollection(token),
    enabled: Boolean(token),
  })

  if (isLoading) return <div className="shared-shell"><div className="loading-page">Opening shared collection…</div></div>
  if (isError || !data) return <div className="shared-shell"><div className="empty-state"><h3>This share link is no longer available.</h3></div></div>

  const collection = data.collection
  return (
    <div className="shared-shell">
      <header className="shared-header"><Link to="/"><BrandMark compact /><strong>Mosaic</strong></Link><span>Shared collection</span></header>
      <main className="shared-main">
        <Link className="back-link" to="/"><ArrowLeft size={16} /> Explore Mosaic</Link>
        <section className="shared-title"><span className="eyebrow">SHARED WITH YOU</span><h1>{collection.name}</h1><p>{collection.description}</p></section>
        <div className="shared-grid">
          {collection.items?.map((item) => <figure key={item.id}><img src={item.image_url} alt={item.title} loading="lazy" decoding="async" /><figcaption><strong>{item.title}</strong>{item.note && <span>{item.note}</span>}</figcaption></figure>)}
        </div>
      </main>
    </div>
  )
}
