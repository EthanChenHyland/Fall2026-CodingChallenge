import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserRound, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../api'
import type { ProfileConnection } from '../types'

export function ConnectionsDialog({ profileId, kind, count }: { profileId: number; kind: 'followers' | 'following'; count: number }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: api.me })
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['profile-connections', profileId, kind],
    queryFn: () => api.profileConnections(profileId, kind),
    enabled: open,
  })
  const follow = useMutation({
    mutationFn: ({ person, next }: { person: ProfileConnection; next: boolean }) => next ? api.followProfile(person.id) : api.unfollowProfile(person.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-connections', profileId, kind] })
      queryClient.invalidateQueries({ queryKey: ['profile', profileId] })
      queryClient.invalidateQueries({ queryKey: ['explore', 'following'] })
    },
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><button className="profile-stat-button"><strong>{count}</strong> {kind}</button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card compact connections-dialog">
          <div className="dialog-head"><div><span className="eyebrow">PEOPLE</span><Dialog.Title>{kind === 'followers' ? 'Followers' : 'Following'}</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close"><X size={18} /></Dialog.Close></div>
          <Dialog.Description className="muted">{count ? `${count} ${kind}` : `No ${kind} yet.`}</Dialog.Description>
          <div className="connection-list">
            {isError ? <div className="popover-empty">Could not load people. <button className="secondary-button" onClick={() => void refetch()}>Try again</button></div> : isLoading ? <div className="popover-empty">Loading people…</div> : data?.people.length ? data.people.map((person) => (
              <div className="connection-row" key={person.id}>
                <Link className="connection-person" to={`/people/${person.id}`} onClick={() => setOpen(false)}>
                  <span className="connection-avatar">{person.avatar_url ? <img src={person.avatar_url} alt="" /> : <UserRound size={18} />}</span>
                  <span><strong>{person.name}</strong><small>{person.bio || 'Mosaic curator'}</small></span>
                </Link>
                {person.id !== me?.user.id && <button className="mini-follow" disabled={follow.isPending} onClick={() => follow.mutate({ person, next: !person.followed_by_me })}>{person.followed_by_me ? 'Following' : 'Follow'}</button>}
              </div>
            )) : <div className="popover-empty">No people here yet.</div>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
