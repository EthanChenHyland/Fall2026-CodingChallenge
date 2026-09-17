import * as Tabs from '@radix-ui/react-tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Clock3, Grid2X2, ImagePlus, LayoutDashboard, Pencil, RotateCcw, Share2, Shuffle, Trash2, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api'
import { AddPinDialog, EditCollectionDialog, EditItemDialog, ShareCollectionDialog } from '../components/Dialogs'
import type { Collection, SavedItem } from '../types'

function CanvasItem({ collectionId, item }: { collectionId: number; item: SavedItem }) {
  const queryClient = useQueryClient()
  const [position, setPosition] = useState({ x: item.canvas_x, y: item.canvas_y })
  const [dragging, setDragging] = useState(false)
  const start = useRef({ x: 0, y: 0, originX: 0, originY: 0 })
  const update = useMutation({
    mutationFn: (next: { x: number; y: number }) =>
      api.updateItem(collectionId, item.id, { canvasX: next.x, canvasY: next.y }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collection', collectionId] }),
  })

  return (
    <div
      className={`canvas-item ${dragging ? 'dragging' : ''}`}
      role="group"
      tabIndex={0}
      aria-label={`Move ${item.title}. Use arrow keys or drag.`}
      style={{ transform: `translate(${position.x}px, ${position.y}px) rotate(${item.rotation}deg)` }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
        start.current = { x: event.clientX, y: event.clientY, originX: position.x, originY: position.y }
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        setPosition({
          x: Math.max(0, start.current.originX + event.clientX - start.current.x),
          y: Math.max(0, start.current.originY + event.clientY - start.current.y),
        })
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId)
        setDragging(false)
        update.mutate(position)
      }}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(event) => {
        const moves: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }
        const move = moves[event.key]
        if (!move) return
        event.preventDefault()
        const next = { x: Math.max(0, position.x + move[0]), y: Math.max(0, position.y + move[1]) }
        setPosition(next)
        update.mutate(next)
      }}
    >
      <img src={item.image_url} alt={item.title} draggable={false} loading="lazy" decoding="async" />
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
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: ['collection', id] })
      const previous = queryClient.getQueryData<{ collection: Collection }>(['collection', id])
      queryClient.setQueryData<{ collection: Collection }>(['collection', id], (current) => current ? ({
        collection: {
          ...current.collection,
          item_count: Math.max(0, current.collection.item_count - 1),
          items: current.collection.items?.filter((item) => item.id !== itemId),
        },
      }) : current)
      return { previous }
    },
    onSuccess: () => {
      toast.success('Removed from collection')
    },
    onError: (error, _itemId, context) => {
      if (context?.previous) queryClient.setQueryData(['collection', id], context.previous)
      toast.error(error.message)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['collection', id] })
      queryClient.invalidateQueries({ queryKey: ['collections'] })
    },
  })
  if (isLoading) return <div className="loading-page">Opening collection…</div>
  if (isError || !data) return <div className="empty-state"><h3>We couldn’t find this collection.</h3><Link to="/collections">Back to collections</Link></div>

  const collection = data.collection
  const items = collection.items ?? []
  const resetLayout = async () => {
    await Promise.all(items.map((item, index) => api.updateItem(id, item.id, {
      canvasX: 36 + (index % 3) * 220,
      canvasY: 40 + Math.floor(index / 3) * 250,
      rotation: (index % 3 - 1) * 2,
    })))
    await queryClient.invalidateQueries({ queryKey: ['collection', id] })
    toast.success('Canvas layout reset')
  }

  const remixLayout = async () => {
    const anchors = [
      [38, 52, -4], [274, 26, 3], [516, 82, -2], [744, 42, 4],
      [108, 318, 2], [354, 286, -3], [602, 334, 3], [814, 292, -2],
    ] as const
    await Promise.all(items.map((item, index) => {
      const [anchorX, anchorY, rotation] = anchors[index % anchors.length]
      const row = Math.floor(index / anchors.length)
      return api.updateItem(id, item.id, {
        canvasX: anchorX + (row % 2) * 34,
        canvasY: anchorY + row * 520,
        rotation: rotation + (row % 3 - 1),
      })
    }))
    await queryClient.invalidateQueries({ queryKey: ['collection', id] })
    toast.success('Board remixed')
  }

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
          <AddPinDialog collectionId={id} trigger={<button className="primary-button"><ImagePlus size={16} /> Add pin</button>} />
          {collection.role === 'owner' && <EditCollectionDialog collection={collection} trigger={<button className="secondary-button"><Pencil size={16} /> Edit</button>} />}
          <ShareCollectionDialog collection={collection} trigger={<button className="secondary-button"><Share2 size={16} /> Share</button>} />
          <span className="collaborator-count"><Users size={15} /> {collection.collaborators?.length ?? 1}</span>
        </div>
      </section>

      {collection.share_token && (
        <div className="share-strip">
          <span><span className="status-dot" /> Anyone with the link can view this collection.</span>
          <ShareCollectionDialog collection={collection} trigger={<button><Share2 size={15} /> Manage sharing</button>} />
        </div>
      )}

      {items.length ? (
        <Tabs.Root defaultValue="grid" className="collection-tabs">
          <Tabs.List className="tab-list">
            <Tabs.Trigger value="grid"><Grid2X2 size={16} /> Grid</Tabs.Trigger>
            <Tabs.Trigger value="canvas"><LayoutDashboard size={16} /> Canvas <span className="new-pill">NEW</span></Tabs.Trigger>
            <Tabs.Trigger value="activity"><Clock3 size={16} /> Activity</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="grid">
            <div className="saved-grid">
              {items.map((item) => (
                <article className="saved-card" key={item.id}>
                  <img src={item.image_url} alt={item.title} loading="lazy" decoding="async" />
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
            <div className="canvas-intro">
              <div><strong>Make it yours.</strong><span>Drag, nudge, and remix your saves into a visual story.</span></div>
              <div className="canvas-tools">
                <button className="canvas-reset" onClick={remixLayout}><Shuffle size={14} /> Remix board</button>
                <button className="canvas-reset" onClick={resetLayout}><RotateCcw size={14} /> Tidy up</button>
              </div>
            </div>
            <div className="canvas-board">
              <div className="canvas-board-label"><span>MOSAIC BOARD</span><strong>{collection.name}</strong></div>
              {items.map((item) => <CanvasItem key={`${item.id}:${item.canvas_x}:${item.canvas_y}:${item.rotation}`} collectionId={id} item={item} />)}
            </div>
          </Tabs.Content>
          <Tabs.Content value="activity">
            <div className="activity-panel">
              <div><span className="eyebrow">COLLECTION HISTORY</span><h3>What changed here</h3></div>
              <div className="activity-list">
                {collection.activity?.map((activity) => (
                  <div key={activity.id}><span className="activity-mark" /><span><strong>{activity.message}</strong><small>{new Date(`${activity.created_at}Z`).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small></span></div>
                ))}
              </div>
            </div>
          </Tabs.Content>
        </Tabs.Root>
      ) : (
        <div className="empty-state large"><Grid2X2 size={32} /><h3>This collection is waiting for something good.</h3><p>Find something on the web, or capture your own reference.</p><div className="empty-actions"><Link className="primary-button" to="/">Discover ideas</Link><Link className="secondary-button" to="/capture"><ImagePlus size={15} /> Quick capture</Link></div></div>
      )}
    </>
  )
}
