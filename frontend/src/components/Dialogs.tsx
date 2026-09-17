import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import type { CatalogImage, SavedItem } from '../types'

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
            <Dialog.Close className="icon-button"><X size={19} /></Dialog.Close>
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
    onSuccess: (_, collectionId) => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
      setOpen(false)
      toast.success('Saved to collection')
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card compact">
          <div className="dialog-head">
            <div><span className="eyebrow">SAVE IMAGE</span><Dialog.Title>Choose a collection</Dialog.Title></div>
            <Dialog.Close className="icon-button"><X size={19} /></Dialog.Close>
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
      setOpen(false)
      toast.success('Saved changes')
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card">
          <div className="dialog-head"><Dialog.Title>Edit saved image</Dialog.Title><Dialog.Close className="icon-button"><X size={19} /></Dialog.Close></div>
          <img className="edit-image" src={item.image_url} alt="" />
          <label className="field-label">Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="field-label">Note<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Why did you save this?" /></label>
          <button className="primary-button full" disabled={!title.trim() || update.isPending} onClick={() => update.mutate()}>Save changes</button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
