import { Compass, FolderHeart, Plus, Search, Sparkles } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()

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
          <button className="avatar" aria-label="Demo profile">EC</button>
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
