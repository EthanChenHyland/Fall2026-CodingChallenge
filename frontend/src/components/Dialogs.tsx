import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Link2, Lock, Plus, Trash2, UploadCloud, UserPlus, Users, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api'
import { rememberCollection } from '../lib/recentCollection'
import { cloudUploadsConfigured, uploadImage } from '../lib/uploads'
import type { CatalogImage, Collection, SavedItem } from '../types'

export function CreateCollectionDialog({ trigger, open: controlledOpen, onOpenChange }: { trigger?: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const queryClient = useQueryClient()
  const changeOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next)
    onOpenChange?.(next)
  }
  const create = useMutation({
    mutationFn: () => api.createCollection({ name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      setName('')
      setDescription('')
      changeOpen(false)
      toast.success('Collection created')
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content aria-describedby={undefined} className="dialog-card">
          <div className="dialog-head">
            <div><span className="eyebrow">NEW COLLECTION</span><Dialog.Title>Start a new mood.</Dialog.Title></div>
            <Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close>
          </div>
          <Dialog.Description className="muted">Give it a name now. You can shape it as you collect.</Dialog.Description>
          <label className="field-label">Name<input maxLength={80} autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Late night Tokyo" /></label>
          <label className="field-label">Description<textarea maxLength={280} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Neon, small bars, rainy streets..." rows={3} /></label>
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
        <Dialog.Content aria-describedby={undefined} className="dialog-card compact">
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
  const [tags, setTags] = useState(item.tags ?? '')
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: () => api.updateItem(collectionId, item.id, { title, note, tags }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['collection', collectionId] })
      const previous = queryClient.getQueryData<{ collection: Collection }>(['collection', collectionId])
      queryClient.setQueryData<{ collection: Collection }>(['collection', collectionId], (current) => current ? ({
        collection: {
          ...current.collection,
          items: current.collection.items?.map((saved) => saved.id === item.id ? { ...saved, title, note, tags } : saved),
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
        <Dialog.Content aria-describedby={undefined} className="dialog-card">
          <div className="dialog-head"><Dialog.Title>Edit saved image</Dialog.Title><Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close></div>
          <img className="edit-image" src={item.image_url} alt="" />
          <label className="field-label">Title<input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="field-label">Note<textarea aria-label="Note" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Why did you save this?" /></label>
          <label className="field-label">Tags <span className="field-optional">comma separated</span><input maxLength={240} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="architecture, blue, reference" /></label>
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
  const [theme, setTheme] = useState<NonNullable<Collection['theme']>>(collection.theme ?? 'paper')
  const [gridLayout, setGridLayout] = useState<NonNullable<Collection['grid_layout']>>(collection.grid_layout ?? 'gallery')
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: () => api.updateCollection(collection.id, { name, description, coverItemId, coverFocusX, coverFocusY, theme, gridLayout }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection', collection.id] })
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      setOpen(false)
      toast.success('Collection updated', {
        action: {
          label: 'Undo',
          onClick: () => {
            void api.updateCollection(collection.id, {
              name: collection.name,
              description: collection.description,
              coverItemId: collection.cover_item_id ?? null,
              coverFocusX: collection.cover_focus_x ?? 50,
              coverFocusY: collection.cover_focus_y ?? 50,
              theme: collection.theme ?? 'paper',
              gridLayout: collection.grid_layout ?? 'gallery',
            }).then(() => {
              queryClient.invalidateQueries({ queryKey: ['collection', collection.id] })
              queryClient.invalidateQueries({ queryKey: ['collections'] })
            }).catch((error: Error) => toast.error(error.message))
          },
        },
      })
    },
    onError: (error) => toast.error(error.message),
  })
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content aria-describedby={undefined} className="dialog-card">
          <div className="dialog-head"><div><span className="eyebrow">COLLECTION DETAILS</span><Dialog.Title>Shape the board.</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close></div>
          <label className="field-label">Name<input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="field-label">Description<textarea maxLength={280} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <section className="collection-style-editor">
            <div className="cover-editor-head"><strong>Board style</strong><span>A little personality, without changing the content.</span></div>
            <div className="theme-picker" aria-label="Collection background">
              {(['paper', 'sage', 'clay', 'slate'] as const).map((option) => <button type="button" key={option} className={`theme-swatch theme-${option} ${theme === option ? 'active' : ''}`} aria-label={`${option} theme`} aria-pressed={theme === option} onClick={() => setTheme(option)}><span />{option}</button>)}
            </div>
            <div className="layout-picker" aria-label="Collection grid layout">
              {(['gallery', 'compact', 'masonry'] as const).map((option) => <button type="button" key={option} className={gridLayout === option ? 'active' : ''} aria-pressed={gridLayout === option} onClick={() => setGridLayout(option)}>{option}</button>)}
            </div>
          </section>
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
                  <label>Horizontal focus <input aria-label="Cover horizontal focus" type="range" min="0" max="100" value={coverFocusX} onChange={(event) => setCoverFocusX(Number(event.target.value))} /></label>
                  <label>Vertical focus <input aria-label="Cover vertical focus" type="range" min="0" max="100" value={coverFocusY} onChange={(event) => setCoverFocusY(Number(event.target.value))} /></label>
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
  const navigate = useNavigate()
  const isOwner = collection.role === 'owner'
  const editorInvite = useQuery({
    queryKey: ['editor-invite', collection.id],
    queryFn: () => api.editorInvite(collection.id),
    enabled: open && isOwner,
  })
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['collection', collection.id] })
    queryClient.invalidateQueries({ queryKey: ['collections'] })
  }
  const audience = collection.audience ?? collection.visibility
  const setAudience = useMutation({
    mutationFn: (nextAudience: Collection['audience']) => api.updateCollection(collection.id, { audience: nextAudience }),
    onSuccess: (_result, nextAudience) => {
      refresh()
      toast.success(nextAudience === 'private' ? 'Collection is private' : nextAudience === 'followers' ? 'Followers can now view this collection' : 'Collection is public')
    },
    onError: (error) => toast.error(error.message),
  })
  const addEditor = useMutation({
    mutationFn: () => api.addCollaborator(collection.id, email),
    onSuccess: () => { setEmail(''); refresh(); toast.success('Editor added') },
    onError: (error) => toast.error(error.message),
  })
  const createEditorInvite = useMutation({
    mutationFn: () => api.createEditorInvite(collection.id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['editor-invite', collection.id] }); toast.success('Editor invite ready') },
    onError: (error) => toast.error(error.message),
  })
  const revokeEditorInvite = useMutation({
    mutationFn: () => api.revokeEditorInvite(collection.id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['editor-invite', collection.id] }); toast.success('Editor invite revoked') },
    onError: (error) => toast.error(error.message),
  })
  const remove = useMutation({
    mutationFn: (userId: number) => api.removeCollaborator(collection.id, userId),
    onSuccess: () => { refresh(); toast.success('Editor removed') },
    onError: (error) => toast.error(error.message),
  })
  const leave = useMutation({
    mutationFn: () => api.leaveCollection(collection.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['collection', collection.id] })
      void queryClient.invalidateQueries({ queryKey: ['collections'] })
      setOpen(false)
      toast.success('You left the collection')
      navigate('/collections')
    },
    onError: (error) => toast.error(error.message),
  })
  const shareUrl = collection.share_token ? `${window.location.origin}/shared/${collection.share_token}` : ''
  const editorInviteUrl = editorInvite.data?.invite ? `${window.location.origin}/invite/${editorInvite.data.invite.token}` : ''

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
          <Dialog.Description className="muted">Choose who can view the board. Account collaborators can still save, edit, remove, and rearrange images with you.</Dialog.Description>

          <section className="share-section">
            <div className="share-section-title"><span className="share-icon"><Link2 size={16} /></span><div><strong>Collection privacy</strong><span>Private, followers-only, or public. Shared views are always read-only.</span></div></div>
            {isOwner ? (
              <div className="privacy-toggle" aria-label="Collection privacy">
                <button className={audience === 'private' ? 'active' : ''} onClick={() => audience !== 'private' && setAudience.mutate('private')} disabled={setAudience.isPending}><Lock size={14} /> Private</button>
                <button className={audience === 'followers' ? 'active' : ''} onClick={() => audience !== 'followers' && setAudience.mutate('followers')} disabled={setAudience.isPending}><Users size={14} /> Followers</button>
                <button className={audience === 'public' ? 'active' : ''} onClick={() => audience !== 'public' && setAudience.mutate('public')} disabled={setAudience.isPending}><Link2 size={14} /> Public</button>
              </div>
            ) : <div className="owner-only-note"><Lock size={14} /> Only the owner can change collection privacy.</div>}
            {collection.share_token ? (
              <div className="share-link-row">
                <span className="share-url">{shareUrl.replace(/^https?:\/\//, '')}</span>
                <button className="secondary-button" onClick={() => { void navigator.clipboard.writeText(shareUrl).then(() => toast.success('Link copied')).catch(() => toast.error('Could not copy. Select the link and copy it manually.')) }}><Copy size={15} /> Copy</button>
              </div>
            ) : <p className="privacy-note">Only collaborators can open this collection while it is private.</p>}
            {audience === 'followers' && <p className="privacy-note">The link opens only for signed-in people who follow the collection owner.</p>}
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
                <input aria-label="Collaborator account email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Collaborator account email" onKeyDown={(event) => { if (event.key === 'Enter' && email.trim()) addEditor.mutate() }} />
                <button className="primary-button" disabled={!email.trim() || addEditor.isPending} onClick={() => addEditor.mutate()}><UserPlus size={15} /> {addEditor.isPending ? 'Adding…' : 'Add editor'}</button>
              </div>
            )}
            {isOwner && <p className="invite-hint">Try <strong>sam@mosaic.local</strong> with the seeded demo account.</p>}
            {isOwner && (
              <div className="editor-invite-panel">
                <div><strong>Editor invite link</strong><span>Anyone signed in with this link can join as an editor. Revoke it whenever you want.</span></div>
                {editorInviteUrl ? (
                  <div className="editor-invite-actions">
                    <button className="secondary-button" onClick={() => { void navigator.clipboard.writeText(editorInviteUrl).then(() => toast.success('Invite link copied')).catch(() => toast.error('Could not copy the invite link.')) }}><Copy size={15} /> Copy link</button>
                    <button className="secondary-button danger-button" disabled={revokeEditorInvite.isPending} onClick={() => revokeEditorInvite.mutate()}><Trash2 size={15} /> Revoke</button>
                    <button className="text-button" disabled={createEditorInvite.isPending} onClick={() => createEditorInvite.mutate()}>Create a new link</button>
                  </div>
                ) : (
                  <button className="secondary-button" disabled={editorInvite.isLoading || createEditorInvite.isPending} onClick={() => createEditorInvite.mutate()}><Link2 size={15} /> {createEditorInvite.isPending ? 'Creating…' : 'Create editor link'}</button>
                )}
              </div>
            )}
            {!isOwner && collection.role === 'editor' && <button className="secondary-button danger-button" disabled={leave.isPending} onClick={() => leave.mutate()}><Trash2 size={15} /> {leave.isPending ? 'Leaving…' : 'Leave collection'}</button>}
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
  const [tags, setTags] = useState('')
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
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
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
      setTags('')
      toast.success('Pin added')
    },
    onError: (error) => toast.error(error.message),
  })
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content aria-describedby={undefined} className="dialog-card">
          <div className="dialog-head"><div><span className="eyebrow">ADD YOUR OWN PIN</span><Dialog.Title>Save something from anywhere.</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close></div>
          {imageUrl && <img className="edit-image" src={imageUrl} alt="Preview" />}
          {cloudUploadsConfigured() && <div className={`upload-dropzone ${uploading ? 'busy' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (!uploading && file?.type.startsWith('image/')) void handleUpload(file) }}><UploadCloud size={22} /><strong>{uploading ? 'Uploading image…' : 'Drop an image here'}</strong><span>or choose one from your computer</span><label className="secondary-button upload-browse">Browse<input type="file" accept="image/*" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUpload(file) }} /></label></div>}
          <label className="field-label">Image URL<input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…/image.jpg" /></label>
          <label className="field-label">Title<input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What should you remember this as?" /></label>
          <label className="field-label">Tags <span className="field-optional">optional</span><input maxLength={240} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="interior, type, reference" /></label>
          <label className="field-label">Source URL <span className="field-optional">optional</span><input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
          <button className="primary-button full" disabled={!imageUrl.trim() || !title.trim() || save.isPending || uploading} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Add pin'}</button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
