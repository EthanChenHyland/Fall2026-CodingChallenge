import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, FolderHeart } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'

export function ProfilePage() {
  const { id: rawId } = useParams()
  const id = Number(rawId)
  const { data, isLoading, isError } = useQuery({ queryKey: ['profile', id], queryFn: () => api.profile(id), enabled: Number.isInteger(id) })

  if (isLoading) return <div className="loading-page">Opening profile…</div>
  if (isError || !data) return <div className="empty-state large"><h3>That profile is not available.</h3><Link className="primary-button" to="/">Back to Mosaic</Link></div>

  const { profile, collections } = data
  const initials = profile.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <section className="profile-hero">
        <div className="profile-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials}</div>
        <div className="profile-copy">
          <span className="eyebrow">MOSAIC PROFILE</span>
          <h1>{profile.name}</h1>
          <p>{profile.bio || 'Collecting a few good things at a time.'}</p>
          <div className="profile-stats"><span><strong>{profile.pin_count}</strong> pins</span><span><strong>{profile.collection_count}</strong> collections</span></div>
        </div>
      </section>

      <section className="section-head profile-section-head"><div><span className="eyebrow">PUBLIC COLLECTIONS</span><h2>What {profile.name.split(' ')[0]} is collecting</h2></div><span className="result-count">{collections.length} public</span></section>
      {collections.length ? (
        <div className="collection-grid">
          {collections.map((collection) => (
            <Link className="collection-card" to={`/shared/${collection.share_token}`} key={collection.id}>
              <div className="collection-cover">{collection.cover_url ? <img src={collection.cover_url} alt="" /> : <div className="blank-cover"><FolderHeart size={28} /></div>}<span className="open-badge"><ArrowUpRight size={16} /></span></div>
              <div className="collection-card-copy"><div><h3>{collection.name}</h3><p>{collection.description || 'A public Mosaic collection.'}</p></div><span>{collection.item_count} saved</span></div>
            </Link>
          ))}
        </div>
      ) : <div className="empty-state"><FolderHeart size={28} /><h3>No public collections yet.</h3></div>}
    </>
  )
}
