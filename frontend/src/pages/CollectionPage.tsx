import * as Tabs from '@radix-ui/react-tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Copy, Grid2X2, LayoutDashboard, MoreHorizontal, Pencil, Share2, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api'
import { EditItemDialog } from '../components/Dialogs'
import type { SavedItem } from '../types'

function CanvasItem({ collectionId, item }: { collectionId: number; item: SavedItem }) {
  const queryClient = useQueryClient()
  const [position, setPosition] = useState({ x: item.canvas_x, y: item.canvas_y })
  const start = useRef({ x: 0, y: 0, originX: 0, originY: 0 })
  const update = useMutation({
    mutationFn: (next: { x: number; y: number }) =>
      api.updateItem(collectionId, item.id, { canvasX: next.x, canvasY: next.y }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collection', collectionId] }),
  })

  return (
    <div
      className="canvas-item"
      style={{ transform: `translate(${position.x}px, ${position.y}px) rotate(${item.rotation}deg)` }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        start.current = { x: event.clientX, y: event.clientY, originX: position.x, originY: position.y }
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        setPosition({
          x: start.current.originX + event.clientX - start.current.x,
          y: start.current.originY + event.clientY - start.current.y,
        })
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId)
        update.mutate(position)
      }}
    >
      <img src={item.image_url} alt={item.title} draggable={false} />
      <strong>{item.title}</strong>
      {item.note && <span>{item.note}</span>}
    </div>
  )
}

export function CollectionPage() {
  const id = Number(useParams().id)
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['collection', id],
    queryFn: () => api.collection(id),
    enabled: Number.isFinite(id),
  })
  const remove = useMutation({
    mutationFn: (itemId: number) => api.deleteItem(id, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection', id] })
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast.success('Removed from collection')
    },
  })
  const share = useMutation({
    mutationFn: () => api.shareCollection(id),
    onSuccess: async ({ token }) => {
      const url = `${window.location.origin}/shared/${token}`
      await navigator.clipboard.writeText(url).catch(() => undefined)
      queryClient.invalidateQueries({ queryKey: ['collection', id] })
      toast.success('Share link copied')
    },
  })

  if (isLoading) return <div className="loading-page">Opening collection…</div>
  if (isError || !data) return <div className="empty-state"><h3>We couldn’t find this collection.</h3><Link to="/collections">Back to collections</Link></div>

  const collection = data.collection
  const items = collection.items ?? []

  return (
    <>
      <Link className="back-link" to="/collections"><ArrowLeft size={16} /> All collections</Link>
      <section className="collection-hero">
        <div>
          <span className="eyebrow">{collection.visibility.toUpperCase()} COLLECTION</span>
          <h1>{collection.name}</h1>
          <p>{collection.description}</p>
          <span className="collection-stat">{items.length} {items.length === 1 ? 'thing' : 'things'} saved</span>
        </div>
        <div className="hero-actions">
          <button className="secondary-button" onClick={() => share.mutate()}><Share2 size={16} /> Share</button>
          <button className="icon-button" aria-label="More options"><MoreHorizontal size={19} /></button>
        </div>
      </section>

      {collection.share_token && (
        <div className="share-strip">
          <span><span className="status-dot" /> Anyone with the link can view this collection.</span>
          <button onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/shared/${collection.share_token}`)
            toast.success('Link copied')
          }}><Copy size={15} /> Copy link</button>
        </div>
      )}

      {items.length ? (
        <Tabs.Root defaultValue="grid" className="collection-tabs">
          <Tabs.List className="tab-list">
            <Tabs.Trigger value="grid"><Grid2X2 size={16} /> Grid</Tabs.Trigger>
            <Tabs.Trigger value="canvas"><LayoutDashboard size={16} /> Canvas <span className="new-pill">NEW</span></Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="grid">
            <div className="saved-grid">
              {items.map((item) => (
                <article className="saved-card" key={item.id}>
                  <img src={item.image_url} alt={item.title} />
                  <div className="saved-card-copy">
                    <div><strong>{item.title}</strong>{item.note && <p>{item.note}</p>}</div>
                    <div className="item-actions">
                      <EditItemDialog collectionId={id} item={item} trigger={<button aria-label="Edit"><Pencil size={16} /></button>} />
                      <button aria-label="Remove" onClick={() => remove.mutate(item.id)}><Trash2 size={16} /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </Tabs.Content>
          <Tabs.Content value="canvas">
            <div className="canvas-intro"><div><strong>Make it yours.</strong><span>Drag saved images around to turn this collection into a visual board.</span></div><span>Positions save automatically</span></div>
            <div className="canvas-board">{items.map((item) => <CanvasItem key={item.id} collectionId={id} item={item} />)}</div>
          </Tabs.Content>
        </Tabs.Root>
      ) : (
        <div className="empty-state large"><Grid2X2 size={32} /><h3>This collection is waiting for something good.</h3><p>Head to Discover and save your first image.</p><Link className="primary-button" to="/">Discover ideas</Link></div>
      )}
    </>
  )
}
