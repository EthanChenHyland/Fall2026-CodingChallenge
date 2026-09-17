import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Link2, Lock, Plus, Trash2, UploadCloud, UserPlus, Users, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import { rememberCollection } from '../lib/recentCollection'
import { cloudUploadsConfigured, uploadImage } from '../lib/uploads'
import type { CatalogImage, Collection, SavedItem } from '../types'

export function CreateCollectionDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const queryClient = useQueryClient()
  const create = useMutation({
    mutationFn: () => api.createCollection({ name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      setName('')
      setDescription('')
      setOpen(false)
      toast.success('Collection created')
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card">
          <div className="dialog-head">
            <div><span className="eyebrow">NEW COLLECTION</span><Dialog.Title>Start a new mood.</Dialog.Title></div>
            <Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close>
          </div>
          <Dialog.Description className="muted">Give it a name now. You can shape it as you collect.</Dialog.Description>
          <label className="field-label">Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Late night Tokyo" /></label>
          <label className="field-label">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Neon, small bars, rainy streets..." rows={3} /></label>
          <button className="primary-button full" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            <Plus size={17} /> {create.isPending ? 'Creating…' : 'Create collection'}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function SaveImageDialog({ image, trigger }: { image: CatalogImage; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['collections'], queryFn: api.collections })
  const save = useMutation({
    mutationFn: (collectionId: number) => api.saveImage(collectionId, image),
    onMutate: async (collectionId) => {
      await queryClient.cancelQueries({ queryKey: ['collections'] })
      const previous = queryClient.getQueryData<{ collections: Collection[] }>(['collections'])
      queryClient.setQueryData<{ collections: Collection[] }>(['collections'], (current) => current ? ({
        collections: current.collections.map((collection) => collection.id === collectionId
          ? {
              ...collection,
              item_count: collection.item_count + 1,
              cover_url: collection.cover_item_id ? collection.cover_url : image.imageUrl,
              cover_urls: collection.cover_item_id && collection.cover_url
                ? [collection.cover_url, image.imageUrl, ...(collection.cover_urls ?? []).filter((url) => url !== image.imageUrl && url !== collection.cover_url)].slice(0, 4)
                : [image.imageUrl, ...(collection.cover_urls ?? []).filter((url) => url !== image.imageUrl)].slice(0, 4),
            }
          : collection),
      }) : current)
      return { previous }
    },
    onSuccess: (_, collectionId) => {
      rememberCollection(collectionId)
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
      setOpen(false)
      toast.success('Saved to collection')
    },
    onError: (error, _collectionId, context) => {
      if (context?.previous) queryClient.setQueryData(['collections'], context.previous)
      if (error.message.includes('already in this collection')) {
        rememberCollection(_collectionId)
        setOpen(false)
        toast.info('Already saved to that collection')
        return
      }
      toast.error(error.message)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['collections'] }),
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card compact">
          <div className="dialog-head">
            <div><span className="eyebrow">SAVE IMAGE</span><Dialog.Title>Choose a collection</Dialog.Title></div>
            <Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close>
          </div>
          <div className="save-preview"><img src={image.imageUrl} alt="" /><div><strong>{image.title}</strong><span>{image.creator}</span></div></div>
          <div className="collection-choice-list">
            {data?.collections.map((collection) => (
              <button key={collection.id} onClick={() => save.mutate(collection.id)} disabled={save.isPending}>
                <span className="choice-thumb">{collection.cover_url ? <img src={collection.cover_url} alt="" /> : <span>{collection.name.slice(0, 1)}</span>}</span>
                <span><strong>{collection.name}</strong><small>{collection.item_count} saved</small></span>
                <Check size={17} />
              </button>
            ))}
          </div>
          <CreateCollectionDialog trigger={<button className="secondary-button full"><Plus size={16} /> New collection</button>} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function EditItemDialog({ collectionId, item, trigger }: { collectionId: number; item: SavedItem; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [note, setNote] = useState(item.note)
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: () => api.updateItem(collectionId, item.id, { title, note }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['collection', collectionId] })
      const previous = queryClient.getQueryData<{ collection: Collection }>(['collection', collectionId])
      queryClient.setQueryData<{ collection: Collection }>(['collection', collectionId], (current) => current ? ({
        collection: {
          ...current.collection,
          items: current.collection.items?.map((saved) => saved.id === item.id ? { ...saved, title, note } : saved),
        },
      }) : current)
      return { previous }
    },
    onSuccess: () => {
      setOpen(false)
      toast.success('Saved changes')
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(['collection', collectionId], context.previous)
      toast.error(error.message)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['collection', collectionId] }),
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card">
          <div className="dialog-head"><Dialog.Title>Edit saved image</Dialog.Title><Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close></div>
          <img className="edit-image" src={item.image_url} alt="" />
          <label className="field-label">Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="field-label">Note<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Why did you save this?" /></label>
          <button className="primary-button full" disabled={!title.trim() || update.isPending} onClick={() => update.mutate()}>Save changes</button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function EditCollectionDialog({ collection, trigger }: { collection: Collection; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(collection.name)
  const [description, setDescription] = useState(collection.description)
  const [coverItemId, setCoverItemId] = useState<number | null>(collection.cover_item_id ?? null)
  const [coverFocusX, setCoverFocusX] = useState(collection.cover_focus_x ?? 50)
  const [coverFocusY, setCoverFocusY] = useState(collection.cover_focus_y ?? 50)
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: () => api.updateCollection(collection.id, { name, description, coverItemId, coverFocusX, coverFocusY }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection', collection.id] })
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      setOpen(false)
      toast.success('Collection updated')
    },
    onError: (error) => toast.error(error.message),
  })
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card">
          <div className="dialog-head"><div><span className="eyebrow">COLLECTION DETAILS</span><Dialog.Title>Shape the board.</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close></div>
          <label className="field-label">Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="field-label">Description<textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          {!!collection.items?.length && (
            <section className="cover-editor">
              <div className="cover-editor-head"><strong>Collection cover</strong><span>Choose a lead image or use the automatic four-image mosaic.</span></div>
              <div className="cover-picker">
                <button className={coverItemId == null ? 'active' : ''} onClick={() => setCoverItemId(null)} type="button"><span className="cover-auto-grid"><i /><i /><i /><i /></span><small>Auto</small></button>
                {collection.items.slice(0, 8).map((item) => (
                  <button className={coverItemId === item.id ? 'active' : ''} onClick={() => setCoverItemId(item.id)} type="button" key={item.id} title={item.title}>
                    <img src={item.image_url} alt="" loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
              {coverItemId != null && (
                <div className="cover-focus-controls">
                  <label>Horizontal focus <input type="range" min="0" max="100" value={coverFocusX} onChange={(event) => setCoverFocusX(Number(event.target.value))} /></label>
                  <label>Vertical focus <input type="range" min="0" max="100" value={coverFocusY} onChange={(event) => setCoverFocusY(Number(event.target.value))} /></label>
                </div>
              )}
            </section>
          )}
          <button className="primary-button full" disabled={!name.trim() || update.isPending} onClick={() => update.mutate()}>{update.isPending ? 'Saving…' : 'Save collection'}</button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ShareCollectionDialog({ collection, trigger }: { collection: Collection; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const queryClient = useQueryClient()
  const isOwner = collection.role === 'owner'
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['collection', collection.id] })
    queryClient.invalidateQueries({ queryKey: ['collections'] })
  }
  const share = useMutation({
    mutationFn: () => api.shareCollection(collection.id),
    onSuccess: ({ token }) => {
      refresh()
      navigator.clipboard.writeText(`${window.location.origin}/shared/${token}`).catch(() => undefined)
      toast.success('Public link copied')
    },
    onError: (error) => toast.error(error.message),
  })
  const disableShare = useMutation({
    mutationFn: () => api.disableShare(collection.id),
    onSuccess: () => { refresh(); toast.success('Public link disabled') },
    onError: (error) => toast.error(error.message),
  })
  const invite = useMutation({
    mutationFn: () => api.addCollaborator(collection.id, email),
    onSuccess: () => { setEmail(''); refresh(); toast.success('Editor added') },
    onError: (error) => toast.error(error.message),
  })
  const remove = useMutation({
    mutationFn: (userId: number) => api.removeCollaborator(collection.id, userId),
    onSuccess: () => { refresh(); toast.success('Editor removed') },
    onError: (error) => toast.error(error.message),
  })
  const shareUrl = collection.share_token ? `${window.location.origin}/shared/${collection.share_token}` : ''

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card share-dialog">
          <div className="dialog-head">
            <div><span className="eyebrow">SHARE & COLLABORATE</span><Dialog.Title>Bring people into the board.</Dialog.Title></div>
            <Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close>
          </div>
          <Dialog.Description className="muted">Public links are view-only. Account collaborators can save, edit, remove, and rearrange images with you.</Dialog.Description>

          <section className="share-section">
            <div className="share-section-title"><span className="share-icon"><Link2 size={16} /></span><div><strong>Collection privacy</strong><span>Private by default. Public collections get a view-only URL.</span></div></div>
            {isOwner ? (
              <div className="privacy-toggle" aria-label="Collection privacy">
                <button className={!collection.share_token ? 'active' : ''} onClick={() => collection.share_token && disableShare.mutate()} disabled={disableShare.isPending}><Lock size={14} /> Private</button>
                <button className={collection.share_token ? 'active' : ''} onClick={() => !collection.share_token && share.mutate()} disabled={share.isPending}><Link2 size={14} /> Public</button>
              </div>
            ) : <div className="owner-only-note"><Lock size={14} /> Only the owner can change collection privacy.</div>}
            {collection.share_token ? (
              <div className="share-link-row">
                <span className="share-url">{shareUrl.replace(/^https?:\/\//, '')}</span>
                <button className="secondary-button" onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success('Link copied') }}><Copy size={15} /> Copy</button>
              </div>
            ) : <p className="privacy-note">Only collaborators can open this collection while it is private.</p>}
          </section>

          <section className="share-section">
            <div className="share-section-title"><span className="share-icon"><Users size={16} /></span><div><strong>People with access</strong><span>Editors can change this collection.</span></div></div>
            <div className="collaborator-list">
              {collection.collaborators?.map((person) => (
                <div className="collaborator-row" key={person.id}>
                  <span className="collaborator-avatar">{person.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
                  <span><strong>{person.name}</strong><small>{person.email}</small></span>
                  <span className="role-pill">{person.role}</span>
                  {isOwner && person.role === 'editor' && <button aria-label={`Remove ${person.name}`} className="remove-collaborator" onClick={() => remove.mutate(person.id)}><Trash2 size={15} /></button>}
                </div>
              ))}
            </div>
            {isOwner && (
              <div className="invite-row">
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Collaborator account email" onKeyDown={(event) => { if (event.key === 'Enter' && email.trim()) invite.mutate() }} />
                <button className="primary-button" disabled={!email.trim() || invite.isPending} onClick={() => invite.mutate()}><UserPlus size={15} /> {invite.isPending ? 'Adding…' : 'Add editor'}</button>
              </div>
            )}
            {isOwner && <p className="invite-hint">Try <strong>sam@mosaic.local</strong> with the seeded demo account.</p>}
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function AddPinDialog({ collectionId, trigger }: { collectionId: number; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [title, setTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const queryClient = useQueryClient()
  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const uploaded = await uploadImage(file)
      setImageUrl(uploaded.imageUrl)
      if (!title) setTitle(uploaded.originalName)
      toast.success('Image uploaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }
  const save = useMutation({
    mutationFn: () => api.saveImage(collectionId, {
      id: `manual-${Date.now()}`,
      title,
      creator: 'Added by you',
      imageUrl,
      pageUrl: sourceUrl || imageUrl,
      tags: ['manual'],
      width: 1,
      height: 1,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      setOpen(false)
      setImageUrl('')
      setSourceUrl('')
      setTitle('')
      toast.success('Pin added')
    },
    onError: (error) => toast.error(error.message),
  })
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card">
          <div className="dialog-head"><div><span className="eyebrow">ADD YOUR OWN PIN</span><Dialog.Title>Save something from anywhere.</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close></div>
          {imageUrl && <img className="edit-image" src={imageUrl} alt="Preview" />}
          {cloudUploadsConfigured() && <div className={`upload-dropzone ${uploading ? 'busy' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file?.type.startsWith('image/')) void handleUpload(file) }}><UploadCloud size={22} /><strong>{uploading ? 'Uploading image…' : 'Drop an image here'}</strong><span>or choose one from your computer</span><label className="secondary-button upload-browse">Browse<input type="file" accept="image/*" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUpload(file) }} /></label></div>}
          <label className="field-label">Image URL<input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…/image.jpg" /></label>
          <label className="field-label">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What should you remember this as?" /></label>
          <label className="field-label">Source URL <span className="field-optional">optional</span><input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
          <button className="primary-button full" disabled={!imageUrl.trim() || !title.trim() || save.isPending || uploading} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Add pin'}</button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
