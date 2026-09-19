import { FolderHeart } from 'lucide-react'
import type { Collection } from '../types'

export function CollectionCover({ collection, emptyLabel = 'Ready for a first save' }: { collection: Collection; emptyLabel?: string }) {
  const images = collection.cover_urls?.length ? collection.cover_urls : collection.cover_url ? [collection.cover_url] : []

  if (!images.length) {
    return <div className="blank-cover"><FolderHeart size={28} /><span>{emptyLabel}</span></div>
  }

  return (
    <div className={`collection-cover-mosaic count-${Math.min(images.length, 4)}`}>
      {images.slice(0, 4).map((url, index) => (
        <img
          key={`${url}-${index}`}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          style={index === 0 ? { objectPosition: `${collection.cover_focus_x ?? 50}% ${collection.cover_focus_y ?? 50}%` } : undefined}
        />
      ))}
    </div>
  )
}
