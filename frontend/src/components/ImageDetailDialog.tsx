import * as Dialog from '@radix-ui/react-dialog'
import { ExternalLink, Maximize2, X } from 'lucide-react'
import type { CatalogImage } from '../types'
import { QuickSaveControls } from './QuickSaveControls'

export function ImageDetailDialog({ image }: { image: CatalogImage }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="image-open-button" aria-label={`Open ${image.title}`}>
          <img src={image.imageUrl} alt={image.title} loading="lazy" decoding="async" />
          <span className="image-expand-badge"><Maximize2 size={15} /></span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay pin-detail-overlay" />
        <Dialog.Content className="pin-detail-dialog">
          <Dialog.Title className="sr-only">{image.title}</Dialog.Title>
          <Dialog.Description className="sr-only">Image details and saving options for {image.title}.</Dialog.Description>
          <Dialog.Close className="icon-button pin-detail-close" aria-label="Close image details"><X size={19} /></Dialog.Close>
          <div className="pin-detail-media">
            <img src={image.imageUrl} alt={image.title} decoding="async" />
          </div>
          <div className="pin-detail-copy">
            <span className="eyebrow">FOUND ON THE WEB</span>
            <h2>{image.title}</h2>
            <p className="pin-detail-creator">Saved from <strong>{image.creator || 'the original source'}</strong></p>
            <div className="pin-detail-tags">
              {image.tags.slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}
            </div>
            <div className="pin-detail-actions">
              <QuickSaveControls image={image} />
              <a className="secondary-button" href={image.pageUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> View source</a>
            </div>
            <div className="pin-detail-note">
              <span>IMAGE SIZE</span>
              <strong>{image.width} × {image.height}</strong>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
