import * as Tabs from '@radix-ui/react-tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, CheckSquare, Clock3, Grid2X2, ImagePlus, LayoutDashboard, MoveRight, Pencil, Redo2, RotateCcw, Search, Share2, Shuffle, Trash2, Undo2, Users, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api'
import { AddPinDialog, EditCollectionDialog, EditItemDialog, ShareCollectionDialog } from '../components/Dialogs'
import type { Collection, SavedItem } from '../types'

type CanvasPosition = { x: number; y: number; rotation: number }
type LayoutChange = { itemId: number; before: CanvasPosition; after: CanvasPosition }
type CanvasGuide = { x?: number; y?: number } | null

function relativeTime(value: string) {
  const time = new Date(`${value}Z`).getTime()
  const seconds = Math.max(1, Math.floor((Date.now() - time) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d ago` : new Date(`${value}Z`).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function CanvasItem({ collectionId, item, siblings, onCommit, onGuideChange }: {
  collectionId: number
  item: SavedItem
  siblings: SavedItem[]
  onCommit: (change: LayoutChange) => void
  onGuideChange: (guide: CanvasGuide) => void
}) {
  const queryClient = useQueryClient()
  const [position, setPosition] = useState({ x: item.canvas_x, y: item.canvas_y })
  const [dragging, setDragging] = useState(false)
  const start = useRef({ x: 0, y: 0, originX: 0, originY: 0 })
  const update = useMutation({
    mutationFn: (next: { x: number; y: number }) => api.updateItem(collectionId, item.id, { canvasX: next.x, canvasY: next.y }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collection', collectionId] }),
  })

  const commit = (next: { x: number; y: number }, before = { x: start.current.originX, y: start.current.originY }) => {
    if (next.x === before.x && next.y === before.y) return
    onCommit({ itemId: item.id, before: { ...before, rotation: item.rotation }, after: { ...next, rotation: item.rotation } })
    update.mutate(next)
  }

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
        let x = Math.max(0, start.current.originX + event.clientX - start.current.x)
        let y = Math.max(0, start.current.originY + event.clientY - start.current.y)
        const alignedX = siblings.find((other) => other.id !== item.id && Math.abs(other.canvas_x - x) <= 8)
        const alignedY = siblings.find((other) => other.id !== item.id && Math.abs(other.canvas_y - y) <= 8)
        if (alignedX) x = alignedX.canvas_x
        if (alignedY) y = alignedY.canvas_y
        onGuideChange(alignedX || alignedY ? { x: alignedX?.canvas_x, y: alignedY?.canvas_y } : null)
        setPosition({ x, y })
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId)
        setDragging(false)
        onGuideChange(null)
        commit(position)
      }}
      onPointerCancel={() => { setDragging(false); onGuideChange(null) }}
      onKeyDown={(event) => {
        const moves: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }
        const move = moves[event.key]
        if (!move) return
        event.preventDefault()
        const next = { x: Math.max(0, position.x + move[0]), y: Math.max(0, position.y + move[1]) }
        const before = { ...position }
        setPosition(next)
        commit(next, before)
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
  const [filter, setFilter] = useState('')
  const [activeTag, setActiveTag] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [targetCollectionId, setTargetCollectionId] = useState('')
  const [undoStack, setUndoStack] = useState<LayoutChange[][]>([])
  const [redoStack, setRedoStack] = useState<LayoutChange[][]>([])
  const [guide, setGuide] = useState<CanvasGuide>(null)
  const { data, isLoading, isError } = useQuery({ queryKey: ['collection', id], queryFn: () => api.collection(id), enabled: Number.isFinite(id) })
  const collectionsQuery = useQuery({ queryKey: ['collections'], queryFn: api.collections })
  const collection = data?.collection
  const items = useMemo(() => collection?.items ?? [], [collection?.items])
  const tags = useMemo(() => Array.from(new Set(items.flatMap((item) => (item.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean)))).slice(0, 10), [items])
  const filteredItems = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return items.filter((item) => {
      const matchesText = !needle || `${item.title} ${item.note} ${item.tags ?? ''}`.toLowerCase().includes(needle)
      const matchesTag = !activeTag || (item.tags ?? '').split(',').some((tag) => tag.trim().toLowerCase() === activeTag.toLowerCase())
      return matchesText && matchesTag
    })
  }, [activeTag, filter, items])

  const remove = useMutation({
    mutationFn: async (item: SavedItem) => { await api.deleteItem(id, item.id); return item },
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: ['collection', id] })
      const previous = queryClient.getQueryData<{ collection: Collection }>(['collection', id])
      queryClient.setQueryData<{ collection: Collection }>(['collection', id], (current) => current ? ({ collection: { ...current.collection, item_count: Math.max(0, current.collection.item_count - 1), items: current.collection.items?.filter((saved) => saved.id !== item.id) } }) : current)
      return { previous }
    },
    onSuccess: (item) => {
      toast.success('Removed from collection', { action: { label: 'Undo', onClick: () => { void api.restoreItem(id, item).then(() => { queryClient.invalidateQueries({ queryKey: ['collection', id] }); queryClient.invalidateQueries({ queryKey: ['collections'] }) }) } } })
    },
    onError: (error, _item, context) => { if (context?.previous) queryClient.setQueryData(['collection', id], context.previous); toast.error(error.message) },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ['collection', id] }); queryClient.invalidateQueries({ queryKey: ['collections'] }) },
  })

  const recordLayout = (changes: LayoutChange[]) => {
    if (!changes.length) return
    setUndoStack((current) => [...current.slice(-19), changes])
    setRedoStack([])
  }
  const applyLayout = async (changes: LayoutChange[], side: 'before' | 'after') => {
    await Promise.all(changes.map((change) => api.updateItem(id, change.itemId, { canvasX: change[side].x, canvasY: change[side].y, rotation: change[side].rotation })))
    await queryClient.invalidateQueries({ queryKey: ['collection', id] })
  }
  const undoLayout = async () => {
    const changes = undoStack.at(-1)
    if (!changes) return
    await applyLayout(changes, 'before')
    setUndoStack((current) => current.slice(0, -1))
    setRedoStack((current) => [...current, changes])
    toast.success('Canvas change undone')
  }
  const redoLayout = async () => {
    const changes = redoStack.at(-1)
    if (!changes) return
    await applyLayout(changes, 'after')
    setRedoStack((current) => current.slice(0, -1))
    setUndoStack((current) => [...current, changes])
    toast.success('Canvas change restored')
  }
  const runPresetLayout = async (mode: 'tidy' | 'remix') => {
    const anchors = [[38, 52, -4], [274, 26, 3], [516, 82, -2], [744, 42, 4], [108, 318, 2], [354, 286, -3], [602, 334, 3], [814, 292, -2]] as const
    const changes = items.map((item, index) => {
      const after = mode === 'tidy'
        ? { x: 36 + (index % 3) * 220, y: 40 + Math.floor(index / 3) * 250, rotation: (index % 3 - 1) * 2 }
        : (() => { const [x, y, rotation] = anchors[index % anchors.length]; const row = Math.floor(index / anchors.length); return { x: x + (row % 2) * 34, y: y + row * 520, rotation: rotation + (row % 3 - 1) } })()
      return { itemId: item.id, before: { x: item.canvas_x, y: item.canvas_y, rotation: item.rotation }, after }
    }).filter((change) => change.before.x !== change.after.x || change.before.y !== change.after.y || change.before.rotation !== change.after.rotation)
    await applyLayout(changes, 'after')
    recordLayout(changes)
    toast.success(mode === 'tidy' ? 'Canvas tidied' : 'Board remixed')
  }

  const toggleSelected = (itemId: number) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(itemId)) next.delete(itemId); else next.add(itemId)
    return next
  })
  const stopSelecting = () => { setSelecting(false); setSelected(new Set()); setTargetCollectionId('') }
  const bulkDelete = async () => {
    const result = await api.bulkItems(id, { action: 'delete', itemIds: [...selected] })
    stopSelecting()
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['collection', id] }), queryClient.invalidateQueries({ queryKey: ['collections'] })])
    toast.success(`${result.items.length} ${result.items.length === 1 ? 'pin' : 'pins'} removed`, { action: { label: 'Undo', onClick: () => { void Promise.all(result.items.map((item) => api.restoreItem(id, item))).then(() => { queryClient.invalidateQueries({ queryKey: ['collection', id] }); queryClient.invalidateQueries({ queryKey: ['collections'] }) }) } } })
  }
  const bulkMove = async () => {
    const targetId = Number(targetCollectionId)
    if (!targetId) return
    const itemIds = [...selected]
    await api.bulkItems(id, { action: 'move', itemIds, targetCollectionId: targetId })
    stopSelecting()
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['collection', id] }), queryClient.invalidateQueries({ queryKey: ['collection', targetId] }), queryClient.invalidateQueries({ queryKey: ['collections'] })])
    toast.success(`${itemIds.length} ${itemIds.length === 1 ? 'pin' : 'pins'} moved`, { action: { label: 'Undo', onClick: () => { void api.bulkItems(targetId, { action: 'move', itemIds, targetCollectionId: id }).then(() => { queryClient.invalidateQueries({ queryKey: ['collection', id] }); queryClient.invalidateQueries({ queryKey: ['collection', targetId] }); queryClient.invalidateQueries({ queryKey: ['collections'] }) }) } } })
  }

  if (isLoading) return <div className="loading-page">Opening collection…</div>
  if (isError || !collection) return <div className="empty-state"><h3>We couldn’t find this collection.</h3><Link to="/collections">Back to collections</Link></div>

  return (
    <div className={`collection-page theme-${collection.theme ?? 'paper'}`}>
      <Link className="back-link" to="/collections"><ArrowLeft size={16} /> All collections</Link>
      <section className="collection-hero">
        <div><span className="eyebrow">{collection.visibility.toUpperCase()} COLLECTION</span><h1>{collection.name}</h1><p>{collection.description}</p><span className="collection-stat">{items.length} {items.length === 1 ? 'thing' : 'things'} saved</span></div>
        <div className="hero-actions">
          <AddPinDialog collectionId={id} trigger={<button className="primary-button"><ImagePlus size={16} /> Add pin</button>} />
          {collection.role === 'owner' && <EditCollectionDialog collection={collection} trigger={<button className="secondary-button"><Pencil size={16} /> Edit</button>} />}
          <ShareCollectionDialog collection={collection} trigger={<button className="secondary-button"><Share2 size={16} /> Share</button>} />
          <span className="collaborator-count"><Users size={15} /> {collection.collaborators?.length ?? 1}</span>
        </div>
      </section>

      {collection.share_token && <div className="share-strip"><span><span className="status-dot" /> Anyone with the link can view this collection.</span><ShareCollectionDialog collection={collection} trigger={<button><Share2 size={15} /> Manage sharing</button>} /></div>}

      {items.length ? (
        <Tabs.Root defaultValue="grid" className="collection-tabs">
          <Tabs.List className="tab-list"><Tabs.Trigger value="grid"><Grid2X2 size={16} /> Grid</Tabs.Trigger><Tabs.Trigger value="canvas"><LayoutDashboard size={16} /> Canvas</Tabs.Trigger><Tabs.Trigger value="activity"><Clock3 size={16} /> Activity</Tabs.Trigger></Tabs.List>
          <Tabs.Content value="grid">
            <div className="collection-grid-tools">
              <label><Search size={14} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter this collection" /></label>
              <button className={`secondary-button ${selecting ? 'active' : ''}`} onClick={() => selecting ? stopSelecting() : setSelecting(true)}>{selecting ? <X size={14} /> : <CheckSquare size={14} />}{selecting ? 'Done' : 'Select'}</button>
            </div>
            {!!tags.length && <div className="collection-tag-filter"><button className={!activeTag ? 'active' : ''} onClick={() => setActiveTag('')}>All</button>{tags.map((tag) => <button className={activeTag === tag ? 'active' : ''} key={tag} onClick={() => setActiveTag(tag)}>{tag}</button>)}</div>}
            {selecting && <div className="bulk-action-bar"><strong>{selected.size} selected</strong><select aria-label="Move selected pins to collection" value={targetCollectionId} onChange={(event) => setTargetCollectionId(event.target.value)}><option value="">Move to…</option>{collectionsQuery.data?.collections.filter((option) => option.id !== id).map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select><button disabled={!selected.size || !targetCollectionId} onClick={() => void bulkMove()}><MoveRight size={14} /> Move</button><button className="danger" disabled={!selected.size} onClick={() => void bulkDelete()}><Trash2 size={14} /> Delete</button></div>}
            {filteredItems.length ? <div className={`saved-grid layout-${collection.grid_layout ?? 'gallery'}`}>{filteredItems.map((item) => {
              const selectedItem = selected.has(item.id)
              return <article className={`saved-card ${selectedItem ? 'selected' : ''}`} key={item.id}>
                {selecting && <button className="selection-toggle" aria-label={`${selectedItem ? 'Deselect' : 'Select'} ${item.title}`} aria-pressed={selectedItem} onClick={() => toggleSelected(item.id)}>{selectedItem ? <Check size={15} /> : null}</button>}
                <img src={item.image_url} alt={item.title} loading="lazy" decoding="async" />
                <div className="saved-card-copy"><div><strong>{item.title}</strong>{item.note && <p>{item.note}</p>}<span className="saved-time">Saved {relativeTime(item.created_at)}</span>{item.tags && <div className="saved-tags">{item.tags.split(',').slice(0, 3).map((tag) => <span key={tag.trim()}>{tag.trim()}</span>)}</div>}</div>{!selecting && <div className="item-actions"><EditItemDialog collectionId={id} item={item} trigger={<button aria-label="Edit"><Pencil size={16} /></button>} /><button aria-label="Remove" onClick={() => remove.mutate(item)}><Trash2 size={16} /></button></div>}</div>
              </article>
            })}</div> : <div className="empty-state compact"><Search size={24} /><h3>No saves match that filter.</h3><button className="secondary-button" onClick={() => { setFilter(''); setActiveTag('') }}>Clear filters</button></div>}
          </Tabs.Content>
          <Tabs.Content value="canvas">
            <div className="canvas-intro"><div><strong>Make it yours.</strong><span>Drag, nudge, align, undo, and remix your saves into a visual story.</span></div><div className="canvas-tools"><button className="canvas-reset" disabled={!undoStack.length} onClick={() => void undoLayout()} title="Undo canvas change"><Undo2 size={14} /> Undo</button><button className="canvas-reset" disabled={!redoStack.length} onClick={() => void redoLayout()} title="Redo canvas change"><Redo2 size={14} /> Redo</button><button className="canvas-reset" onClick={() => void runPresetLayout('remix')}><Shuffle size={14} /> Remix board</button><button className="canvas-reset" onClick={() => void runPresetLayout('tidy')}><RotateCcw size={14} /> Tidy up</button></div></div>
            <div className="canvas-board">
              <div className="canvas-board-label"><span>MOSAIC BOARD</span><strong>{collection.name}</strong></div>
              {guide?.x !== undefined && <span className="canvas-guide vertical" style={{ left: guide.x }} />}
              {guide?.y !== undefined && <span className="canvas-guide horizontal" style={{ top: guide.y }} />}
              {items.map((item) => <CanvasItem key={`${item.id}:${item.canvas_x}:${item.canvas_y}:${item.rotation}`} collectionId={id} item={item} siblings={items} onCommit={(change) => recordLayout([change])} onGuideChange={setGuide} />)}
            </div>
          </Tabs.Content>
          <Tabs.Content value="activity"><div className="activity-panel"><div><span className="eyebrow">COLLECTION HISTORY</span><h3>What changed here</h3></div><div className="activity-list">{collection.activity?.map((activity) => <div key={activity.id}><span className="activity-mark" /><span><strong>{activity.message}</strong><small>{new Date(`${activity.created_at}Z`).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small></span></div>)}</div></div></Tabs.Content>
        </Tabs.Root>
      ) : <div className="empty-state large"><Grid2X2 size={32} /><h3>This collection is waiting for something good.</h3><p>Find something on the web, or capture your own reference.</p><div className="empty-actions"><Link className="primary-button" to="/">Discover ideas</Link><Link className="secondary-button" to="/capture"><ImagePlus size={15} /> Quick capture</Link></div></div>}
    </div>
  )
}
