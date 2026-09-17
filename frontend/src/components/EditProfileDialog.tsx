import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import type { PublicProfile } from '../types'

export function EditProfileDialog({ profile }: { profile: PublicProfile }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(profile.name)
  const [bio, setBio] = useState(profile.bio)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url)
  const update = useMutation({
    mutationFn: () => api.updateProfile({ name, bio, avatarUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', profile.id] })
      queryClient.invalidateQueries({ queryKey: ['me'] })
      setOpen(false)
      toast.success('Profile updated')
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><button className="secondary-button"><Pencil size={15} /> Edit profile</button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card">
          <div className="dialog-head"><div><span className="eyebrow">YOUR PROFILE</span><Dialog.Title>Make it feel like you.</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close></div>
          <label className="field-label">Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="field-label">Bio<textarea rows={4} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="What are you collecting lately?" /></label>
          <label className="field-label">Avatar URL<input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://…" /></label>
          <button className="primary-button full" disabled={update.isPending || name.trim().length < 2} onClick={() => update.mutate()}>{update.isPending ? 'Saving…' : 'Save profile'}</button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
