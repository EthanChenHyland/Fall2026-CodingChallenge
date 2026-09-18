import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, FolderHeart, Heart, MessageCircle, Pencil, Share2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api'
import { EditItemDialog } from '../components/Dialogs'
import { ImageCard } from '../components/ImageCard'
import { PublicPinCard } from '../components/PublicPinCard'
import { QuickSaveControls } from '../components/QuickSaveControls'
import { SendPinDialog } from '../components/SendPinDialog'
import type { CatalogImage } from '../types'

export function PinPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [comment, setComment] = useState('')
  const [removeArmed, setRemoveArmed] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const { id: rawId } = useParams()
  const id = Number(rawId)
  const { data, isLoading, isError } = useQuery({ queryKey: ['pin', id], queryFn: () => api.pin(id), enabled: Number.isInteger(id) })
  const like = useMutation({ mutationFn: () => data?.pin.liked_by_me ? api.unlikePin(id) : api.likePin(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pin', id] }) })
  const comments = useQuery({ queryKey: ['pin-comments', id], queryFn: () => api.pinComments(id), enabled: data?.pin.visibility === 'public' })
  const related = useQuery({ queryKey: ['related-pins', id], queryFn: () => api.relatedPins(id), enabled: data?.pin.visibility === 'public' })
  const relatedQuery = (() => {
    if (!data?.pin) return ''
    const words = `${data.pin.title} ${data.pin.collection_name}`
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !['the', 'and', 'for', 'from', 'with', 'this', 'that'].includes(word))
    return [...new Set(words)].slice(0, 4).join(' ')
  })()
  const {
    data: webRelatedData,
    hasNextPage: hasMoreWebRelated,
    isFetchingNextPage: isFetchingMoreWebRelated,
    fetchNextPage: fetchMoreWebRelated,
  } = useInfiniteQuery({
    queryKey: ['web-related', id, relatedQuery],
    queryFn: ({ pageParam }) => api.search(relatedQuery, pageParam.page, pageParam.source),
    initialPageParam: { page: 1, source: '' },
    getNextPageParam: (lastPage) => lastPage.nextPage ? { page: lastPage.nextPage, source: lastPage.source } : undefined,
    enabled: Boolean(relatedQuery),
  })
  const webResults = useMemo(() => {
    const seen = new Set<string>()
    return (webRelatedData?.pages.flatMap((page) => page.results) ?? []).filter((result) => {
      if (result.imageUrl === data?.pin.image_url || seen.has(result.id)) return false
      seen.add(result.id)
      return true
    })
  }, [data?.pin.image_url, webRelatedData?.pages])
  const addComment = useMutation({ mutationFn: () => api.addPinComment(id, comment), onSuccess: () => { setComment(''); queryClient.invalidateQueries({ queryKey: ['pin-comments', id] }) } })
  const removeComment = useMutation({ mutationFn: (commentId: number) => api.deletePinComment(id, commentId), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pin-comments', id] }) })
  const removePin = useMutation({ mutationFn: () => api.deleteItem(data!.pin.collection_id, id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['collections'] }); queryClient.invalidateQueries({ queryKey: ['explore'] }); navigate(`/collections/${data!.pin.collection_id}`) } })

  useEffect(() => {
    const target = moreRef.current
    if (!target || !hasMoreWebRelated) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !isFetchingMoreWebRelated) void fetchMoreWebRelated()
    }, { rootMargin: '500px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [fetchMoreWebRelated, hasMoreWebRelated, isFetchingMoreWebRelated])

  if (isLoading) return <div className="loading-page">Opening pin…</div>
  if (isError || !data) return <div className="empty-state large"><h3>That pin is not available.</h3><Link className="primary-button" to="/explore">Explore public pins</Link></div>

  const pin = data.pin
  const image: CatalogImage = { id: pin.source_id, title: pin.title, creator: pin.source_creator || pin.owner_name, imageUrl: pin.image_url, pageUrl: pin.source_page || pin.image_url, tags: pin.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 8), width: 1, height: 1 }
  const sharePin = async () => {
    const url = window.location.href
    if (navigator.share) {
      try { await navigator.share({ title: pin.title, text: pin.note || `Saved by ${pin.owner_name} on Mosaic`, url }) } catch { /* cancelled */ }
      return
    }
    try { await navigator.clipboard.writeText(url); toast.success('Pin link copied') }
    catch { toast.error('Could not copy. Copy the page address from your browser.') }
  }
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
          <Link className="pin-board-link" to={pin.share_token ? `/shared/${pin.share_token}` : `/collections/${pin.collection_id}`}><FolderHeart size={16} /><span><strong>{pin.collection_name}</strong><small>{pin.collection_description || 'Public collection'}</small></span></Link>
          {pin.visibility === 'public' && <div className="pin-social-row"><button className={`pin-like-button ${pin.liked_by_me ? 'active' : ''}`} disabled={like.isPending} onClick={() => like.mutate()}><Heart size={17} fill={pin.liked_by_me ? 'currentColor' : 'none'} /> {pin.like_count} {pin.like_count === 1 ? 'like' : 'likes'}</button></div>}
          {pin.visibility === 'public' && <section className="pin-comments"><div className="pin-comments-title"><MessageCircle size={16} /><strong>Conversation</strong><span>{comments.data?.comments.length ?? 0}</span></div><div className="pin-comment-list">{comments.isError && <p role="alert">Could not load comments. <button className="secondary-button" onClick={() => void comments.refetch()}>Try again</button></p>}{comments.data?.comments.map((entry) => <div className="pin-comment" key={entry.id}><span className="pin-comment-avatar">{entry.user_avatar ? <img src={entry.user_avatar} alt="" /> : entry.user_name.slice(0, 1)}</span><div><Link to={`/people/${entry.user_id}`}>{entry.user_name}</Link><p>{entry.body}</p></div>{entry.can_delete && <button className="comment-delete" aria-label="Remove comment" disabled={removeComment.isPending} onClick={() => removeComment.mutate(entry.id)}><Trash2 size={13} /></button>}</div>)}</div><div className="pin-comment-form"><textarea aria-label="Comment" maxLength={500} rows={2} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a thought…" /><button className="primary-button" disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate()}>Post</button></div></section>}
          <div className="pin-detail-actions">
            <QuickSaveControls image={image} />
            {pin.source_page && <a className="secondary-button" href={pin.source_page} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Source</a>}
            <button className="secondary-button" onClick={() => void sharePin()}><Share2 size={15} /> Share</button>
            {pin.visibility === 'public' && <SendPinDialog pinId={pin.id} pinTitle={pin.title} trigger={<button className="secondary-button"><MessageCircle size={15} /> Send</button>} />}
            {pin.can_edit && <EditItemDialog collectionId={pin.collection_id} item={pin} trigger={<button className="secondary-button"><Pencil size={15} /> Edit</button>} />}
            {pin.can_edit && <button className={removeArmed ? 'danger-button' : 'secondary-button'} disabled={removePin.isPending} onClick={() => removeArmed ? removePin.mutate() : setRemoveArmed(true)} onBlur={() => setRemoveArmed(false)}><Trash2 size={15} /> {removeArmed ? 'Click again to remove' : 'Remove'}</button>}
          </div>
        </div>
      </article>
      {related.data?.pins.length ? <section className="related-pin-section"><div className="section-head"><div><span className="eyebrow">KEEP GOING</span><h2>More from this corner of Mosaic</h2></div><Link className="result-count" to="/explore">See Explore</Link></div><div className="masonry-grid related-pin-grid">{related.data.pins.map((item) => <PublicPinCard pin={item} key={item.id} />)}</div></section> : null}
      {webResults.length ? (
        <section className="related-pin-section web-related-section">
          <div className="section-head"><div><span className="eyebrow">MORE LIKE THIS</span><h2>Keep following the idea</h2></div><span className="result-count">{webRelatedData?.pages[0]?.source === 'pixabay' ? 'Images from Pixabay' : webRelatedData?.pages[0]?.source === 'wikimedia' ? 'Images from Wikimedia Commons' : 'Mosaic picks'}</span></div>
          <div className="masonry-grid related-pin-grid">{webResults.map((item) => <ImageCard image={item} key={item.id} />)}</div>
          <div ref={moreRef} className="feed-sentinel">{isFetchingMoreWebRelated ? 'Finding more like this…' : hasMoreWebRelated ? '' : 'That’s the end of this trail.'}</div>
        </section>
      ) : null}
    </>
  )
}
