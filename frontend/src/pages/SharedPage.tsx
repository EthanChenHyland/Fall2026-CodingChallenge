import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowUpRight, CopyPlus, Play, UserRound } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { toast } from 'sonner'
import { BrandMark } from '../components/BrandMark'

export function SharedPage() {
  const token = useParams().token ?? ''
  const navigate = useNavigate()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['shared', token],
    queryFn: () => api.sharedCollection(token),
    enabled: Boolean(token),
  })
  const collectionId = data?.collection.id ?? 0
  const clone = useMutation({
    mutationFn: () => api.cloneCollection(collectionId),
    onSuccess: ({ collection: copied }) => {
      toast.success('Copied to your collections')
      navigate(`/collections/${copied.id}`)
    },
    onError: (error: Error) => toast.error(error.message === 'Please sign in to continue.' ? 'Sign in to save a copy of this collection.' : error.message),
  })

  if (isLoading) return <div className="shared-shell"><div className="loading-page">Opening shared collection…</div></div>
  if (isError || !data) return <div className="shared-shell"><div className="empty-state"><h3>This share link is no longer available.</h3></div></div>

  const collection = data.collection
  return (
    <div className={`shared-shell theme-${collection.theme ?? 'paper'}`}>
      <a className="skip-link" href="#shared-content">Skip to collection</a>
      <header className="shared-header"><Link to="/"><BrandMark compact /><strong>Mosaic</strong></Link><Link className="shared-join-link" to="/">Make your own <ArrowUpRight size={14} /></Link></header>
      <main className="shared-main" id="shared-content" tabIndex={-1}>
        <Link className="back-link" to="/"><ArrowLeft size={16} /> Explore Mosaic</Link>
        <section className="shared-title"><span className="eyebrow">{collection.audience === 'followers' ? 'FOLLOWERS COLLECTION' : 'SHARED COLLECTION'}</span><h1>{collection.name}</h1><p>{collection.description}</p><div className="shared-byline"><span className="shared-owner-avatar">{collection.owner_avatar ? <img src={collection.owner_avatar} alt="" /> : <UserRound size={15} />}</span><span><strong>{collection.owner_name ?? 'Mosaic curator'}</strong><small>{collection.item_count} {collection.item_count === 1 ? 'save' : 'saves'} · {collection.audience === 'followers' ? 'followers only · ' : ''}view only</small></span></div><div className="shared-title-actions">{collection.items?.length ? <Link className="secondary-button shared-present-link" to={`/shared/${token}/present`}><Play size={15} /> Present collection</Link> : null}{collection.audience === 'public' && <button className="secondary-button" disabled={clone.isPending} onClick={() => clone.mutate()}><CopyPlus size={15} /> {clone.isPending ? 'Copying…' : 'Save a copy'}</button>}</div></section>
        <div className="shared-grid">
          {collection.items?.map((item) => <figure key={item.id}><img src={item.image_url} alt={item.title} loading="lazy" decoding="async" /><figcaption><strong>{item.title}</strong>{item.note && <span>{item.note}</span>}{item.tags && <small>{item.tags}</small>}</figcaption></figure>)}
        </div>
        <section className="shared-cta"><BrandMark /><div><strong>Keep your own visual memory.</strong><span>Discover, organize, remix, and share with Mosaic.</span></div><Link className="primary-button" to="/">Open Mosaic <ArrowUpRight size={14} /></Link></section>
      </main>
    </div>
  )
}
