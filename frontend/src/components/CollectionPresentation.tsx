import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Collection } from '../types'

export function CollectionPresentation({ collection, open, onOpenChange }: { collection: Collection; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [index, setIndex] = useState(0)
  const pointerStart = useRef<number | null>(null)
  const items = useMemo(() => {
    const saved = collection.items ?? []
    const sectionOrder = new Map((collection.sections ?? []).map((section, sectionIndex) => [section.id, sectionIndex]))
    return [...saved].sort((a, b) => {
      const aSection = a.section_id ? sectionOrder.get(a.section_id) ?? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER
      const bSection = b.section_id ? sectionOrder.get(b.section_id) ?? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER
      return aSection - bSection || a.id - b.id
    })
  }, [collection.items, collection.sections])
  const current = items[index]
  const section = current?.section_id ? collection.sections?.find((entry) => entry.id === current.section_id) : null
  const go = (delta: number) => setIndex((value) => Math.min(items.length - 1, Math.max(0, value + delta)))

  useEffect(() => {
    if (!open) return
    const listener = (event: KeyboardEvent) => {
      const step = (delta: number) => setIndex((value) => Math.min(items.length - 1, Math.max(0, value + delta)))
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); step(1) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1) }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [open, items.length])

  if (!items.length || !current) return null

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) setIndex(0); onOpenChange(next) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="presentation-overlay" />
        <Dialog.Content
          className="presentation-dialog"
          aria-describedby="collection-presentation-description"
          onPointerDown={(event) => { pointerStart.current = event.clientX }}
          onPointerUp={(event) => {
            if (pointerStart.current === null) return
            const distance = event.clientX - pointerStart.current
            pointerStart.current = null
            if (Math.abs(distance) < 54) return
            go(distance < 0 ? 1 : -1)
          }}
        >
          <div className="presentation-topbar">
            <div>
              <span className="eyebrow">PRESENTING</span>
              <Dialog.Title>{collection.name}</Dialog.Title>
            </div>
            <Dialog.Close className="presentation-close" aria-label="Close presentation"><X size={18} /></Dialog.Close>
          </div>

          <div className="presentation-stage">
            <div className="presentation-media" key={current.id}>
              <img src={current.image_url} alt={current.title} />
            </div>
            <div className="presentation-copy">
              <span className="presentation-kicker">{section?.name ?? 'Unsorted'}</span>
              <h2>{current.title}</h2>
              {current.note && <p id="collection-presentation-description">{current.note}</p>}
              {!current.note && <p id="collection-presentation-description" className="muted">Saved in {collection.name}.</p>}
            </div>
          </div>

          <div className="presentation-controls">
            <button onClick={() => go(-1)} disabled={index === 0} aria-label="Previous pin"><ArrowLeft size={18} /></button>
            <div className="presentation-progress" aria-label={(index + 1) + ' of ' + items.length}>
              <span><i style={{ width: String(((index + 1) / items.length) * 100) + '%' }} /></span>
              <b>{String(index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</b>
            </div>
            <button onClick={() => go(1)} disabled={index === items.length - 1} aria-label="Next pin"><ArrowRight size={18} /></button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
