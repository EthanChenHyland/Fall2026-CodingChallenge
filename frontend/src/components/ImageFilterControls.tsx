import { SlidersHorizontal, X } from 'lucide-react'
import type { ImageOrder, ImageOrientation } from '../lib/imageFilters'

export function ImageFilterControls({ orientation, order, onOrientationChange, onOrderChange, onReset, showHeading = true }: {
  orientation: ImageOrientation
  order: ImageOrder
  onOrientationChange: (value: ImageOrientation) => void
  onOrderChange: (value: ImageOrder) => void
  onReset?: () => void
  showHeading?: boolean
}) {
  const activeCount = Number(orientation !== 'all') + Number(order !== 'default')
  return (
    <div className="image-filter-controls">
      {showHeading && <span className="filter-heading"><SlidersHorizontal size={14} /> Filters{activeCount ? <b>{activeCount}</b> : null}</span>}
      <label><span>Orientation</span><select aria-label="Image orientation" value={orientation} onChange={(event) => onOrientationChange(event.target.value as ImageOrientation)}><option value="all">Any</option><option value="landscape">Landscape</option><option value="portrait">Portrait</option><option value="square">Square-ish</option></select></label>
      <label><span>Order</span><select aria-label="Image order" value={order} onChange={(event) => onOrderChange(event.target.value as ImageOrder)}><option value="default">Default</option><option value="largest">Largest first</option><option value="tall">Tall first</option><option value="wide">Wide first</option></select></label>
      {activeCount > 0 && onReset ? <button type="button" className="filter-reset" onClick={onReset}><X size={13} /> Reset</button> : null}
    </div>
  )
}
