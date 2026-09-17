export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`mosaic-mark ${compact ? 'compact' : ''}`} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  )
}
