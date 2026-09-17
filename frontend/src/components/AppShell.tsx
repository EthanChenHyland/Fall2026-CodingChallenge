import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Compass, Download, FolderHeart, Globe2, HelpCircle, LogOut, Plus, Search, UserRound, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { BrandMark } from './BrandMark'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const coachSteps = [
  { eyebrow: '1 OF 3 · QUICK SAVE', title: 'One click keeps the idea.', copy: 'Hover a discovery card and Save goes straight to your most recent collection. Use the arrow beside it to choose another.' },
  { eyebrow: '2 OF 3 · CANVAS', title: 'Boards can become compositions.', copy: 'Open any collection and switch to Canvas. Drag, align, undo, redo, or remix the layout without changing the saved content.' },
  { eyebrow: '3 OF 3 · SHARE', title: 'Make a board collaborative.', copy: 'Share can create a public read-only link or invite another Mosaic account as an editor.' },
] as const

function ProductCoach({ replay }: { replay: number }) {
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(() => replay > 0 || window.localStorage.getItem('mosaic:onboarding:v2') !== 'done')
  if (!open) return null
  const current = coachSteps[step]
  const close = () => { window.localStorage.setItem('mosaic:onboarding:v2', 'done'); setOpen(false) }
  return (
    <aside className="product-coach" aria-live="polite" aria-label="Mosaic quick tour">
      <button className="coach-close" onClick={close} aria-label="Dismiss quick tour"><X size={15} /></button>
      <span className="eyebrow">{current.eyebrow}</span>
      <strong>{current.title}</strong>
      <p>{current.copy}</p>
      <div className="coach-foot"><span>{coachSteps.map((_, index) => <i className={index === step ? 'active' : ''} key={index} />)}</span>{step < coachSteps.length - 1 ? <button onClick={() => setStep(step + 1)}>Next</button> : <button onClick={close}>Got it</button>}</div>
    </aside>
  )
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [shortcutOpen, setShortcutOpen] = useState(false)
  const [coachReplay, setCoachReplay] = useState(0)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false })
  const { data: notifications } = useQuery({ queryKey: ['notifications'], queryFn: api.notifications, refetchInterval: 20_000 })
  const unread = notifications?.notifications.filter((item) => !item.read_at).length ?? 0
  const readNotifications = useMutation({
    mutationFn: api.markNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.clear()
      navigate('/')
    },
  })
  const initials = me?.user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'M'

  useEffect(() => {
    const install = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent) }
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('beforeinstallprompt', install)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('beforeinstallprompt', install)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target?.matches('input, textarea, select, [contenteditable="true"]')
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === '/') { event.preventDefault(); navigate('/', { state: { focusSearch: true } }) }
      else if (event.key.toLowerCase() === 'n') { event.preventDefault(); navigate('/collections?new=1') }
      else if (event.key.toLowerCase() === 's') { event.preventDefault(); navigate('/capture') }
      else if (event.key === '?') { event.preventDefault(); setShortcutOpen(true) }
      else if (event.key === 'Escape') { setProfileOpen(false); setNotificationsOpen(false) }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [navigate])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('/')} aria-label="Mosaic home">
          <BrandMark />
          <span>Mosaic</span>
        </button>
        <nav className="nav-list" aria-label="Primary navigation">
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Compass size={20} /> <span>Discover</span>
          </NavLink>
          <NavLink to="/explore" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Globe2 size={20} /> <span>Explore</span>
          </NavLink>
          <NavLink to="/collections" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <FolderHeart size={20} /> <span>Collections</span>
          </NavLink>
        </nav>
        <div className="sidebar-note">
          <span className="eyebrow">YOUR SPACE</span>
          <p>Save the things you want to find again.</p>
        </div>
      </aside>

      <main className="main-area" id="main-content">
        <header className="topbar">
          <button className="mini-brand" onClick={() => navigate('/')} aria-label="Mosaic home">
            <BrandMark compact /> Mosaic
          </button>
          <button className="topbar-search" onClick={() => navigate('/', { state: { focusSearch: true } })}>
            <Search size={17} />
            <span>{location.pathname === '/' ? 'Search ideas' : 'Find something to save'}</span>
            <kbd>/</kbd>
          </button>
          <div className="topbar-actions">
            {!online && <span className="offline-badge" title="Using cached pages while offline"><WifiOff size={13} /> Offline</span>}
            <div className="popover-wrap">
              <button
                className="notification-button"
                aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
                aria-expanded={notificationsOpen}
                aria-haspopup="menu"
                onClick={() => {
                  const next = !notificationsOpen
                  setNotificationsOpen(next)
                  setProfileOpen(false)
                  if (next && unread) readNotifications.mutate()
                }}
              >
                <Bell size={18} />
                {unread > 0 && <span>{unread > 9 ? '9+' : unread}</span>}
              </button>
              {notificationsOpen && (
                <div className="account-popover notification-popover">
                  <div className="popover-title"><strong>Updates</strong><span>Shared collections</span></div>
                  <div className="notification-list">
                    {notifications?.notifications.length ? notifications.notifications.map((item) => (
                      <button key={item.id} onClick={() => { if (item.collection_id) navigate(`/collections/${item.collection_id}`); setNotificationsOpen(false) }}>
                        <span className={`notification-dot ${item.read_at ? '' : 'unread'}`} />
                        <span><strong>{item.message}</strong><small>{item.collection_name ?? 'Mosaic'}</small></span>
                      </button>
                    )) : <p className="popover-empty">Nothing new yet.</p>}
                  </div>
                </div>
              )}
            </div>
            <div className="popover-wrap">
              <button className="avatar" aria-label="Account menu" aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false) }}>{initials}</button>
              {profileOpen && (
                <div className="account-popover profile-popover" role="menu">
                  <div className="profile-copy"><strong>{me?.user.name}</strong><span>{me?.user.email}</span></div>
                  <button className="popover-action" onClick={() => { navigate(`/people/${me?.user.id}`); setProfileOpen(false) }}><UserRound size={15} /> View profile</button>
                  <button className="popover-action" onClick={() => { setShortcutOpen(true); setProfileOpen(false) }}><HelpCircle size={15} /> Keyboard shortcuts</button>
                  <button className="popover-action" onClick={() => { setCoachReplay((value) => value + 1); setProfileOpen(false) }}><Compass size={15} /> Replay quick tour</button>
                  {installPrompt && <button className="popover-action" onClick={() => { void installPrompt.prompt().then(() => installPrompt.userChoice).then(() => setInstallPrompt(null)); setProfileOpen(false) }}><Download size={15} /> Install Mosaic</button>}
                  <button className="popover-action" onClick={() => logout.mutate()}><LogOut size={15} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="page-wrap"><Outlet /></div>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <NavLink to="/" end><Compass size={21} /><span>Discover</span></NavLink>
        <NavLink to="/explore"><Globe2 size={21} /><span>Explore</span></NavLink>
        <button onClick={() => navigate('/', { state: { focusSearch: true } })}><Plus size={22} /><span>Save</span></button>
        <NavLink to="/collections"><FolderHeart size={21} /><span>Collections</span></NavLink>
      </nav>
      <ProductCoach key={coachReplay} replay={coachReplay} />
      <Dialog.Root open={shortcutOpen} onOpenChange={setShortcutOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-card compact shortcut-dialog">
            <div className="dialog-head"><div><span className="eyebrow">KEYBOARD</span><Dialog.Title>Move faster in Mosaic.</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close shortcuts"><X size={18} /></Dialog.Close></div>
            <Dialog.Description className="muted">Shortcuts stay out of the way while you’re typing in a field.</Dialog.Description>
            <div className="shortcut-list"><span><kbd>/</kbd><b>Search ideas</b></span><span><kbd>N</kbd><b>New collection</b></span><span><kbd>S</kbd><b>Quick capture</b></span><span><kbd>?</kbd><b>Show shortcuts</b></span><span><kbd>↑ ↓ ← →</kbd><b>Nudge a Canvas pin</b></span></div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
