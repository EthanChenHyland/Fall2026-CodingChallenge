import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Bookmark, ExternalLink, FolderHeart, Heart } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { SaveImageDialog } from '../components/Dialogs'
import type { CatalogImage } from '../types'

export function PinPage() {
  const queryClient = useQueryClient()
  const { id: rawId } = useParams()
  const id = Number(rawId)
  const { data, isLoading, isError } = useQuery({ queryKey: ['pin', id], queryFn: () => api.pin(id), enabled: Number.isInteger(id) })
  const like = useMutation({ mutationFn: () => data?.pin.liked_by_me ? api.unlikePin(id) : api.likePin(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pin', id] }) })
  if (isLoading) return <div className="loading-page">Opening pin…</div>
  if (isError || !data) return <div className="empty-state large"><h3>That pin is not available.</h3><Link className="primary-button" to="/explore">Explore public pins</Link></div>

  const pin = data.pin
  const image: CatalogImage = { id: `pin-${pin.id}`, title: pin.title, creator: pin.source_creator || pin.owner_name, imageUrl: pin.image_url, pageUrl: pin.source_page || pin.image_url, tags: [], width: 1, height: 1 }
  return (
    <>
      <Link className="back-link" to="/explore"><ArrowLeft size={16} /> Explore</Link>
      <article className="pin-page-card">
        <div className="pin-page-media"><img src={pin.image_url} alt={pin.title} /></div>
        <div className="pin-page-copy">
          <span className="eyebrow">SAVED TO MOSAIC</span>
          <h1>{pin.title}</h1>
          {pin.note && <p className="pin-page-note">{pin.note}</p>}
          <Link className="pin-owner" to={`/people/${pin.owner_id}`}><span className="pin-owner-avatar">{pin.owner_avatar ? <img src={pin.owner_avatar} alt="" /> : pin.owner_name.slice(0, 1)}</span><span><strong>{pin.owner_name}</strong><small>Curator</small></span></Link>
          <Link className="pin-board-link" to={`/shared/${pin.share_token}`}><FolderHeart size={16} /><span><strong>{pin.collection_name}</strong><small>{pin.collection_description || 'Public collection'}</small></span></Link>
          <div className="pin-social-row"><button className={`pin-like-button ${pin.liked_by_me ? 'active' : ''}`} disabled={like.isPending} onClick={() => like.mutate()}><Heart size={17} fill={pin.liked_by_me ? 'currentColor' : 'none'} /> {pin.like_count} {pin.like_count === 1 ? 'like' : 'likes'}</button></div>
          <div className="pin-detail-actions">
            <SaveImageDialog image={image} trigger={<button className="primary-button"><Bookmark size={16} /> Save</button>} />
            {pin.source_page && <a className="secondary-button" href={pin.source_page} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Source</a>}
          </div>
        </div>
      </article>
    </>
  )
}
