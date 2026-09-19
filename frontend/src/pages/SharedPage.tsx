import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowUpRight, Play, UserRound } from 'lucide-react'
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
    <div className={`shared-shell theme-${collection.theme ?? 'paper'}`}>
      <header className="shared-header"><Link to="/"><BrandMark compact /><strong>Mosaic</strong></Link><Link className="shared-join-link" to="/">Make your own <ArrowUpRight size={14} /></Link></header>
      <main className="shared-main">
        <Link className="back-link" to="/"><ArrowLeft size={16} /> Explore Mosaic</Link>
        <section className="shared-title"><span className="eyebrow">{collection.audience === 'followers' ? 'FOLLOWERS COLLECTION' : 'SHARED COLLECTION'}</span><h1>{collection.name}</h1><p>{collection.description}</p><div className="shared-byline"><span className="shared-owner-avatar">{collection.owner_avatar ? <img src={collection.owner_avatar} alt="" /> : <UserRound size={15} />}</span><span><strong>{collection.owner_name ?? 'Mosaic curator'}</strong><small>{collection.item_count} {collection.item_count === 1 ? 'save' : 'saves'} · {collection.audience === 'followers' ? 'followers only · ' : ''}view only</small></span></div>{collection.items?.length ? <Link className="secondary-button shared-present-link" to={`/shared/${token}/present`}><Play size={15} /> Present collection</Link> : null}</section>
        <div className="shared-grid">
          {collection.items?.map((item) => <figure key={item.id}><img src={item.image_url} alt={item.title} loading="lazy" decoding="async" /><figcaption><strong>{item.title}</strong>{item.note && <span>{item.note}</span>}{item.tags && <small>{item.tags}</small>}</figcaption></figure>)}
        </div>
        <section className="shared-cta"><BrandMark /><div><strong>Keep your own visual memory.</strong><span>Discover, organize, remix, and share with Mosaic.</span></div><Link className="primary-button" to="/">Open Mosaic <ArrowUpRight size={14} /></Link></section>
      </main>
    </div>
  )
}
