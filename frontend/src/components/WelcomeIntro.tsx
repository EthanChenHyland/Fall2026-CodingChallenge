import { ArrowLeft, ArrowRight, Bookmark, MessageCircle, Search, UsersRound } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from './BrandMark'

type AuthMode = 'login' | 'register'

const AmbientMosaic3D = lazy(() => import('./AmbientMosaic3D').then((module) => ({ default: module.AmbientMosaic3D })))

const slides = [
  {
    eyebrow: '01 · DISCOVER',
    title: 'Find it once. Keep it.',
    copy: 'Search visual references, save the ones that matter, and stop losing good ideas to open tabs.',
    image: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=900&q=85',
    imageTwo: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85',
    imageThree: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=85',
    label: 'Search → save',
  },
  {
    eyebrow: '02 · COLLECT',
    title: 'Turn finds into a point of view.',
    copy: 'Build image-led collections, split them into sections, and shape the same references as a gallery or canvas.',
    image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=85',
    imageTwo: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=900&q=85',
    imageThree: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=85',
    label: 'Boards with structure',
  },
  {
    eyebrow: '03 · SHARE',
    title: 'Keep the conversation beside the work.',
    copy: 'Follow collections, invite editors, send pins in messages, and keep the source attached as ideas move between people.',
    image: 'https://images.unsplash.com/photo-1504215680853-026ed2a45def?auto=format&fit=crop&w=900&q=85',
    imageTwo: 'https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=900&q=85',
    imageThree: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=900&q=85',
    label: 'Collect together',
  },
] as const

export function WelcomeIntro({ onContinue }: { onContinue: (mode: AuthMode) => void }) {
  const [index, setIndex] = useState(0)
  const visualRef = useRef<HTMLDivElement>(null)
  const slide = slides[index]

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % slides.length), 5200)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setIndex((current) => (current + 1) % slides.length)
      if (event.key === 'ArrowLeft') setIndex((current) => (current - 1 + slides.length) % slides.length)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const nudgeVisual = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return
    const box = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - box.left) / box.width - .5) * 2
    const y = ((event.clientY - box.top) / box.height - .5) * 2
    visualRef.current?.style.setProperty('--welcome-x', x.toFixed(3))
    visualRef.current?.style.setProperty('--welcome-y', y.toFixed(3))
  }

  const resetVisual = () => {
    visualRef.current?.style.setProperty('--welcome-x', '0')
    visualRef.current?.style.setProperty('--welcome-y', '0')
  }

  return (
    <main className="welcome-shell">
      <header className="welcome-nav">
        <span className="welcome-brand"><BrandMark /> Mosaic</span>
        <div>
          <Link to="/privacy">Privacy</Link>
          <button type="button" className="welcome-text-button" onClick={() => onContinue('login')}>Sign in</button>
        </div>
      </header>

      <section className="welcome-copy" aria-live="polite">
        <div className="welcome-slide-copy" key={'copy-' + index}>
          <span className="eyebrow">{slide.eyebrow}</span>
          <h1>{slide.title}</h1>
          <p>{slide.copy}</p>
        </div>
        <div className="welcome-actions">
          <button type="button" className="primary-button welcome-enter" onClick={() => onContinue('register')}>Start collecting <ArrowRight size={17} /></button>
          <button type="button" className="secondary-button welcome-signin" onClick={() => onContinue('login')}>I already have an account</button>
        </div>
        <div className="welcome-pagination" aria-label="Intro slides">
          <button type="button" className="welcome-arrow" onClick={() => setIndex((index - 1 + slides.length) % slides.length)} aria-label="Previous slide"><ArrowLeft size={15} /></button>
          <div>{slides.map((item, itemIndex) => <button type="button" key={item.eyebrow} className={itemIndex === index ? 'active' : ''} aria-label={'Show slide ' + (itemIndex + 1)} aria-current={itemIndex === index ? 'true' : undefined} onClick={() => setIndex(itemIndex)}><span /></button>)}</div>
          <button type="button" className="welcome-arrow" onClick={() => setIndex((index + 1) % slides.length)} aria-label="Next slide"><ArrowRight size={15} /></button>
        </div>
      </section>

      <section className="welcome-visual" onPointerMove={nudgeVisual} onPointerLeave={resetVisual} aria-label={slide.label + ' preview'}>
        <Suspense fallback={null}><AmbientMosaic3D /></Suspense>
        <div className="welcome-visual-card" ref={visualRef} key={'visual-' + index}>
          <div className="welcome-visual-topline"><span>{slide.label}</span><span>{String(index + 1).padStart(2, '0')} / 03</span></div>
          <div className="welcome-collage">
            <img src={slide.image} alt="" />
            <img src={slide.imageTwo} alt="" />
            <img src={slide.imageThree} alt="" />
          </div>
          {index === 0 && <div className="welcome-demo-bar"><Search size={15} /><span>Find something to save</span><kbd>/</kbd></div>}
          {index === 1 && <div className="welcome-demo-meta"><span><Bookmark size={14} /> Alpine mornings</span><span>8 saved</span></div>}
          {index === 2 && <div className="welcome-demo-message"><span className="welcome-message-avatar"><UsersRound size={15} /></span><span><strong>Material study</strong><small><MessageCircle size={11} /> Maya sent a pin with a note</small></span></div>}
        </div>
      </section>

      <footer className="welcome-foot">
        <span>Mosaic · Fall 2026</span>
      </footer>
    </main>
  )
}
