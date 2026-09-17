import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Bookmark, ExternalLink, FolderHeart, Heart, MessageCircle, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { EditItemDialog, SaveImageDialog } from '../components/Dialogs'
import type { CatalogImage } from '../types'

export function PinPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [comment, setComment] = useState('')
  const [removeArmed, setRemoveArmed] = useState(false)
  const { id: rawId } = useParams()
  const id = Number(rawId)
  const { data, isLoading, isError } = useQuery({ queryKey: ['pin', id], queryFn: () => api.pin(id), enabled: Number.isInteger(id) })
  const like = useMutation({ mutationFn: () => data?.pin.liked_by_me ? api.unlikePin(id) : api.likePin(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pin', id] }) })
  const comments = useQuery({ queryKey: ['pin-comments', id], queryFn: () => api.pinComments(id), enabled: Number.isInteger(id) })
  const addComment = useMutation({ mutationFn: () => api.addPinComment(id, comment), onSuccess: () => { setComment(''); queryClient.invalidateQueries({ queryKey: ['pin-comments', id] }) } })
  const removeComment = useMutation({ mutationFn: (commentId: number) => api.deletePinComment(id, commentId), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pin-comments', id] }) })
  const removePin = useMutation({ mutationFn: () => api.deleteItem(data!.pin.collection_id, id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['collections'] }); queryClient.invalidateQueries({ queryKey: ['explore'] }); navigate(`/collections/${data!.pin.collection_id}`) } })
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
          <section className="pin-comments"><div className="pin-comments-title"><MessageCircle size={16} /><strong>Conversation</strong><span>{comments.data?.comments.length ?? 0}</span></div><div className="pin-comment-list">{comments.data?.comments.map((entry) => <div className="pin-comment" key={entry.id}><span className="pin-comment-avatar">{entry.user_avatar ? <img src={entry.user_avatar} alt="" /> : entry.user_name.slice(0, 1)}</span><div><Link to={`/people/${entry.user_id}`}>{entry.user_name}</Link><p>{entry.body}</p></div>{entry.can_delete && <button className="comment-delete" aria-label="Remove comment" disabled={removeComment.isPending} onClick={() => removeComment.mutate(entry.id)}><Trash2 size={13} /></button>}</div>)}</div><div className="pin-comment-form"><textarea rows={2} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a thought…" /><button className="primary-button" disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate()}>Post</button></div></section>
          <div className="pin-detail-actions">
            <SaveImageDialog image={image} trigger={<button className="primary-button"><Bookmark size={16} /> Save</button>} />
            {pin.source_page && <a className="secondary-button" href={pin.source_page} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Source</a>}
            {pin.can_edit && <EditItemDialog collectionId={pin.collection_id} item={pin} trigger={<button className="secondary-button"><Pencil size={15} /> Edit</button>} />}
            {pin.can_edit && <button className={removeArmed ? 'danger-button' : 'secondary-button'} disabled={removePin.isPending} onClick={() => removeArmed ? removePin.mutate() : setRemoveArmed(true)} onBlur={() => setRemoveArmed(false)}><Trash2 size={15} /> {removeArmed ? 'Click again to remove' : 'Remove'}</button>}
          </div>
        </div>
      </article>
    </>
  )
}
