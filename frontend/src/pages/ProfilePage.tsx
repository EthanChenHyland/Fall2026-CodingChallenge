import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, FolderHeart, MessageCircle } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api'
import { AvatarFrame } from '../components/AvatarFrame'
import { CollectionCover } from '../components/CollectionCover'
import { EditProfileDialog } from '../components/EditProfileDialog'
import { ConnectionsDialog } from '../components/ConnectionsDialog'
import { ReportDialog } from '../components/ReportDialog'

export function ProfilePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { identifier: rawIdentifier } = useParams()
  const identifier = rawIdentifier ?? ''
  const { data, isLoading, isError } = useQuery({ queryKey: ['profile', identifier], queryFn: () => api.profile(identifier), enabled: Boolean(identifier) })
  const profileId = data?.profile.id ?? 0
  const follow = useMutation({ mutationFn: () => data?.profile.followed_by_me ? api.unfollowProfile(profileId) : api.followProfile(profileId), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }) })
  const followCollection = useMutation({
    mutationFn: ({ collectionId, followed }: { collectionId: number; followed: boolean }) => followed ? api.unfollowCollection(collectionId) : api.followCollection(collectionId),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['profile'] }); void queryClient.invalidateQueries({ queryKey: ['explore'] }) },
    onError: (error: Error) => toast.error(error.message),
  })

  useEffect(() => {
    if (data?.profile.username && identifier !== data.profile.username) navigate(`/people/${data.profile.username}`, { replace: true })
  }, [data?.profile.username, identifier, navigate])

  if (isLoading) return <div className="loading-page">Opening profile…</div>
  if (isError || !data) return <div className="empty-state large"><h3>That profile is not available.</h3><Link className="primary-button" to="/">Back to Mosaic</Link></div>

  const { profile, collections } = data

  return (
    <>
      <section className="profile-hero">
        <AvatarFrame className="profile-avatar" src={profile.avatar_url} name={profile.name} />
        <div className="profile-copy">
          <span className="eyebrow">MOSAIC PROFILE</span>
          <h1>{profile.name}</h1>
          <span className="profile-handle">@{profile.username}</span>
          <p>{profile.bio || 'Collecting a few good things at a time.'}</p>
          <div className="profile-stats"><span className="profile-stat"><strong>{profile.pin_count}</strong><span>pins</span></span><span className="profile-stat"><strong>{profile.collection_count}</strong><span>collections</span></span><ConnectionsDialog profileId={profile.id} kind="followers" count={profile.follower_count} /><ConnectionsDialog profileId={profile.id} kind="following" count={profile.following_count} /></div>
          <div className="profile-actions">{profile.is_self ? <EditProfileDialog profile={profile} /> : <><button className={profile.followed_by_me ? 'secondary-button' : 'primary-button'} disabled={follow.isPending} onClick={() => follow.mutate()}>{profile.followed_by_me ? 'Following' : 'Follow'}</button><Link className="secondary-button" to={`/messages?with=${profile.id}`}><MessageCircle size={15} /> Message</Link><ReportDialog targetType="profile" targetId={profile.id} /></>}</div>
        </div>
      </section>

      <section className="section-head profile-section-head"><div><span className="eyebrow">VISIBLE COLLECTIONS</span><h2>What {profile.name.split(' ')[0]} is collecting</h2></div><span className="result-count">{collections.length} visible</span></section>
      {collections.length ? (
        <div className="collection-grid">
          {collections.map((collection) => (
            <article className="collection-card profile-collection-card" key={collection.id}>
              <Link to={`/shared/${collection.share_token}`} aria-label={`Open ${collection.name}`}>
                <div className="collection-cover"><CollectionCover collection={collection} emptyLabel="Waiting for a first save" /><span className="open-badge"><ArrowUpRight size={16} /></span></div>
              </Link>
              <div className="collection-card-copy">
                <div className="collection-card-heading"><Link to={`/shared/${collection.share_token}`}><h3>{collection.name}</h3></Link><span>{collection.item_count} saved</span></div>
                <p>{collection.description || 'A Mosaic collection.'}</p>
                <div className="collection-card-meta"><span>{collection.audience === 'followers' ? 'Followers only' : 'Public'}</span><span>{collection.follower_count ?? 0} {(collection.follower_count ?? 0) === 1 ? 'follower' : 'followers'}</span></div>
                <div className="collection-card-byline"><AvatarFrame className="collection-owner-avatar" src={profile.avatar_url} name={profile.name} /><span>Curated by {profile.is_self ? 'you' : profile.name}</span></div>
              </div>
              {!profile.is_self && collection.audience === 'public' && <div className="collection-follow-row"><span>See new saves in Following</span><button className={collection.followed_by_me ? 'secondary-button' : 'primary-button'} disabled={followCollection.isPending} onClick={() => followCollection.mutate({ collectionId: collection.id, followed: Boolean(collection.followed_by_me) })}>{collection.followed_by_me ? 'Following board' : 'Follow board'}</button></div>}
            </article>
          ))}
        </div>
      ) : <div className="empty-state"><FolderHeart size={28} /><h3>No visible collections yet.</h3></div>}
    </>
  )
}
