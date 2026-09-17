import { ExternalLink } from 'lucide-react'
import type { CatalogImage } from '../types'
import { ImageDetailDialog } from './ImageDetailDialog'
import { QuickSaveControls } from './QuickSaveControls'

export function ImageCard({ image }: { image: CatalogImage }) {
  return (
    <article className="image-card">
      <div className="image-frame" style={{ aspectRatio: `${image.width}/${image.height}` }}>
        <ImageDetailDialog image={image} />
        <div className="image-hover">
          <a className="round-action" href={image.pageUrl} target="_blank" rel="noreferrer" aria-label="Open source"><ExternalLink size={17} /></a>
          <QuickSaveControls image={image} />
        </div>
      </div>
      <div className="image-meta"><strong>{image.title}</strong><span>{image.tags.slice(0, 2).join(' · ')}</span></div>
    </article>
  )
}
