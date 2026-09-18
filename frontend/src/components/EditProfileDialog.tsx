import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, UploadCloud, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import { cloudUploadsConfigured, uploadImage } from '../lib/uploads'
import type { PublicProfile } from '../types'

export function EditProfileDialog({ profile }: { profile: PublicProfile }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(profile.name)
  const [bio, setBio] = useState(profile.bio)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url)
  const [uploading, setUploading] = useState(false)
  const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'M'
  const handleAvatarUpload = async (file: File) => {
    setUploading(true)
    try {
      const uploaded = await uploadImage(file, 'mosaic-avatars')
      setAvatarUrl(uploaded.imageUrl)
      toast.success('Profile photo uploaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Profile photo upload failed.')
    } finally {
      setUploading(false)
    }
  }
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
        <Dialog.Content aria-describedby={undefined} className="dialog-card">
          <div className="dialog-head"><div><span className="eyebrow">YOUR PROFILE</span><Dialog.Title>Make it feel like you.</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close></div>
          <div className="profile-photo-editor">
            <div className="profile-photo-preview">{avatarUrl ? <img src={avatarUrl} alt="Profile preview" /> : initials}</div>
            <div className="profile-photo-actions">
              {cloudUploadsConfigured() && <label className="secondary-button profile-photo-upload"><UploadCloud size={15} /> {uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload photo'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleAvatarUpload(file); event.currentTarget.value = '' }} /></label>}
              {avatarUrl && <button type="button" className="secondary-button" disabled={uploading} onClick={() => setAvatarUrl('')}><Trash2 size={14} /> Remove</button>}
            </div>
          </div>
          <label className="field-label">Name<input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="field-label">Bio<textarea maxLength={220} rows={4} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="What are you collecting lately?" /></label>
          <label className="field-label">Photo URL <span className="field-optional">optional</span><input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://…" /></label>
          <button className="primary-button full" disabled={update.isPending || uploading || name.trim().length < 2} onClick={() => update.mutate()}>{update.isPending ? 'Saving…' : 'Save profile'}</button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
