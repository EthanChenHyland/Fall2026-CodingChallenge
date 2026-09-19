import * as Dialog from '@radix-ui/react-dialog'
import { ExternalLink, ListTree, Maximize2, X } from 'lucide-react'
import { useState } from 'react'
import type { CollectionSection, SavedItem } from '../types'

export function SavedItemDetailDialog({ item, sections, disabled, onMove }: {
  item: SavedItem
  sections: CollectionSection[]
  disabled?: boolean
  onMove: (sectionId: number | null) => Promise<void>
}) {
  const currentValue = item.section_id ? String(item.section_id) : 'unsorted'
  const [targetSection, setTargetSection] = useState(currentValue)

  const tags = item.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 6)
  const move = async () => {
    if (targetSection === currentValue) return
    await onMove(targetSection === 'unsorted' ? null : Number(targetSection))
  }

  return (
    <Dialog.Root onOpenChange={(open) => { if (open) setTargetSection(currentValue) }}>
      <Dialog.Trigger asChild>
        <button className="saved-image-trigger" aria-label={`Open ${item.title}`}>
          <img src={item.image_url} alt={item.title} loading="lazy" decoding="async" />
          <span className="saved-image-expand"><Maximize2 size={15} /></span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay pin-detail-overlay" />
        <Dialog.Content className="pin-detail-dialog saved-item-detail-dialog">
          <Dialog.Title className="sr-only">{item.title}</Dialog.Title>
          <Dialog.Description className="sr-only">Saved pin details and section controls for {item.title}.</Dialog.Description>
          <Dialog.Close className="icon-button pin-detail-close" aria-label="Close saved pin"><X size={19} /></Dialog.Close>
          <div className="pin-detail-media saved-item-detail-media"><img src={item.image_url} alt={item.title} decoding="async" /></div>
          <div className="pin-detail-copy">
            <span className="eyebrow">SAVED PIN</span>
            <h2>{item.title}</h2>
            {item.note && <p className="saved-item-detail-note">{item.note}</p>}
            <p className="pin-detail-creator">Saved from <strong>{item.source_creator || 'the original source'}</strong></p>
            {!!tags.length && <div className="pin-detail-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
            <div className="saved-item-organize">
              <div><ListTree size={16} /><span><strong>Section</strong><small>Move this pin without entering selection mode.</small></span></div>
              <div className="saved-item-organize-controls">
                <select aria-label={`Move ${item.title} to section`} value={targetSection} onChange={(event) => setTargetSection(event.target.value)}>
                  <option value="unsorted">Unsorted</option>
                  {sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}
                </select>
                <button className="primary-button" disabled={disabled || targetSection === currentValue} onClick={() => void move()}>Move</button>
              </div>
            </div>
            {item.source_page && <div className="pin-detail-actions"><a className="secondary-button" href={item.source_page} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> View source</a></div>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
