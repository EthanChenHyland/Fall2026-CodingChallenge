import { ArrowUpRight, Bookmark, Check, Heart, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PublicPin } from '../types'
import { SavePinDialog } from './SavePinDialog'

export function PublicPinCard({ pin, selectionMode = false, selected = false, onToggleSelection }: { pin: PublicPin; selectionMode?: boolean; selected?: boolean; onToggleSelection?: (pinId: number) => void }) {
  return (
    <article className={`image-card public-pin-card${selected ? ' is-selected' : ''}`} data-pin-id={pin.id} data-source-id={pin.source_id}>
      {selectionMode ? (
        <button type="button" className="image-frame public-pin-image public-pin-select-surface" aria-label={`${selected ? 'Deselect' : 'Select'} ${pin.title}`} aria-pressed={selected} onClick={() => onToggleSelection?.(pin.id)}>
          <img src={pin.image_url} alt={pin.title} loading="lazy" decoding="async" />
          <span className="pin-selection-mark"><Check size={16} /></span>
        </button>
      ) : (
        <Link className="image-frame public-pin-image" to={`/pin/${pin.id}`} aria-label={`Open ${pin.title}`}>
          <img src={pin.image_url} alt={pin.title} loading="lazy" decoding="async" />
          <span className="pin-open-badge"><ArrowUpRight size={16} /></span>
        </Link>
      )}
      {!selectionMode && <SavePinDialog pinId={pin.id} pinTitle={pin.title} pinImageUrl={pin.image_url} trigger={<button className="pin-card-save"><Bookmark size={14} /> Save</button>} />}
      <div className="image-meta public-pin-meta">
        <strong>{pin.title}</strong>
        <span>{pin.collection_name}</span>
        {(pin.like_count || pin.comment_count) ? <span className="pin-card-social">{Boolean(pin.like_count) && <span><Heart size={11} /> {pin.like_count}</span>}{Boolean(pin.comment_count) && <span><MessageCircle size={11} /> {pin.comment_count}</span>}</span> : null}
        <Link className="pin-mini-owner" to={`/people/${pin.owner_id}`}>{pin.owner_avatar ? <img src={pin.owner_avatar} alt="" /> : <i>{pin.owner_name.slice(0, 1)}</i>}<b>{pin.owner_name}</b></Link>
      </div>
    </article>
  )
}
