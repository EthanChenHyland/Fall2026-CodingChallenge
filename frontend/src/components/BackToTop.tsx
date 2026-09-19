import { ArrowUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

export function BackToTop() {
  const location = useLocation()
  const [visible, setVisible] = useState(() => window.scrollY > 640)

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 640)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [location.pathname])

  if (!visible) return null
  return <button
    type="button"
    className="back-to-top"
    aria-label="Back to top"
    title="Back to top"
    onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
  ><ArrowUp size={18} /></button>
}
