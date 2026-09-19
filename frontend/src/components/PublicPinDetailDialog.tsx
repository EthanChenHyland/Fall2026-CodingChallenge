import * as Dialog from '@radix-ui/react-dialog'
import { ArrowUpRight, ExternalLink, Heart, MessageCircle, X } from 'lucide-react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import type { PublicPin } from '../types'
import { SavePinDialog } from './SavePinDialog'

export function PublicPinDetailDialog({ pin, trigger }: { pin: PublicPin; trigger: ReactElement }) {
  const tags = pin.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 6)
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay pin-detail-overlay" />
        <Dialog.Content className="pin-detail-dialog public-pin-detail-dialog">
          <Dialog.Title className="sr-only">{pin.title}</Dialog.Title>
          <Dialog.Description className="sr-only">Preview of {pin.title} from {pin.collection_name}.</Dialog.Description>
          <Dialog.Close className="icon-button pin-detail-close" aria-label="Close pin preview"><X size={19} /></Dialog.Close>
          <div className="pin-detail-media"><img src={pin.image_url} alt={pin.title} decoding="async" /></div>
          <div className="pin-detail-copy">
            <span className="eyebrow">PUBLIC PIN</span>
            <h2>{pin.title}</h2>
            <p className="pin-detail-creator">From <strong>{pin.collection_name}</strong> by <Link to={`/people/${pin.owner_username}`}>{pin.owner_name}</Link></p>
            {!!tags.length && <div className="pin-detail-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
            {(pin.like_count || pin.comment_count) ? <div className="pin-preview-social">{Boolean(pin.like_count) && <span><Heart size={13} /> {pin.like_count}</span>}{Boolean(pin.comment_count) && <span><MessageCircle size={13} /> {pin.comment_count}</span>}</div> : null}
            <div className="pin-detail-actions">
              <SavePinDialog pinId={pin.id} pinTitle={pin.title} pinImageUrl={pin.image_url} trigger={<button className="primary-button">Save</button>} />
              <Link className="secondary-button" to={`/pin/${pin.id}`}><ArrowUpRight size={16} /> Open full pin</Link>
              {pin.source_page ? <a className="secondary-button" href={pin.source_page} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Source</a> : null}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
