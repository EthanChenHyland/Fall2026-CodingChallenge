import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Compass, FolderHeart, LogOut, Plus, Search, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('/')} aria-label="Mosaic home">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span>Mosaic</span>
        </button>
        <nav className="nav-list" aria-label="Primary navigation">
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Compass size={20} /> <span>Discover</span>
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

      <main className="main-area">
        <header className="topbar">
          <button className="mini-brand" onClick={() => navigate('/')} aria-label="Mosaic home">
            <Sparkles size={18} /> Mosaic
          </button>
          <button className="topbar-search" onClick={() => navigate('/')}>
            <Search size={17} />
            <span>{location.pathname === '/' ? 'Search ideas' : 'Find something to save'}</span>
            <kbd>/</kbd>
          </button>
          <div className="topbar-actions">
            <div className="popover-wrap">
              <button
                className="notification-button"
                aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
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
              <button className="avatar" aria-label="Account menu" onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false) }}>{initials}</button>
              {profileOpen && (
                <div className="account-popover profile-popover">
                  <div className="profile-copy"><strong>{me?.user.name}</strong><span>{me?.user.email}</span></div>
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
        <button onClick={() => navigate('/')}><Plus size={22} /><span>Save</span></button>
        <NavLink to="/collections"><FolderHeart size={21} /><span>Collections</span></NavLink>
      </nav>
    </div>
  )
}
