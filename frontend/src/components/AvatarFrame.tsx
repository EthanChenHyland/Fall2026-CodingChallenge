export function AvatarFrame({ src, name, className = '' }: { src?: string; name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'M'

  return (
    <span className={`avatar-frame ${className}`.trim()}>
      {src ? <img src={src} alt="" /> : <span className="avatar-initials">{initials}</span>}
    </span>
  )
}
