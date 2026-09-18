import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import { rememberCollection } from '../lib/recentCollection'
import { CreateCollectionDialog } from './Dialogs'

export function SavePinDialog({ pinId, pinTitle, pinImageUrl, trigger }: { pinId: number; pinTitle: string; pinImageUrl: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['collections'], queryFn: api.collections })
  const savedIn = useQuery({ queryKey: ['pin-saved-in', pinId], queryFn: () => api.pinSavedIn(pinId), enabled: open })
  const savedIds = new Set(savedIn.data?.collections.map((collection) => collection.id) ?? [])
  const collections = [...(data?.collections ?? [])].sort((a, b) => Number(savedIds.has(a.id)) - Number(savedIds.has(b.id)))
  const save = useMutation({
    mutationFn: (collectionId: number) => api.savePin(pinId, collectionId, note),
    onSuccess: ({ item }, collectionId) => {
      rememberCollection(collectionId)
      void queryClient.invalidateQueries({ queryKey: ['collections'] })
      void queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
      void queryClient.invalidateQueries({ queryKey: ['pin-saved-in', pinId] })
      setNote('')
      setOpen(false)
      toast.success('Saved to collection', {
        action: {
          label: 'Undo',
          onClick: () => {
            void api.deleteItem(collectionId, item.id).then(() => {
              void queryClient.invalidateQueries({ queryKey: ['collections'] })
              void queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
              void queryClient.invalidateQueries({ queryKey: ['pin-saved-in', pinId] })
              toast.success('Save undone')
            }).catch((error) => toast.error(error.message))
          },
        },
      })
    },
    onError: (error, collectionId) => {
      if (error.message.includes('already in this collection')) {
        rememberCollection(collectionId)
        setOpen(false)
        toast.info('Already saved to that collection')
        return
      }
      toast.error(error.message)
    },
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content aria-describedby={undefined} className="dialog-card compact">
          <div className="dialog-head">
            <div><span className="eyebrow">SAVE PIN</span><Dialog.Title>Choose a collection</Dialog.Title></div>
            <Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close>
          </div>
          <div className="save-preview"><img src={pinImageUrl} alt="" /><div><strong>{pinTitle}</strong><span>From Mosaic</span></div></div>
          <label className="field-label save-pin-note">Private note <span className="field-optional">optional</span><textarea aria-label="Private note" maxLength={500} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why are you saving this?" /></label>
          <div className="collection-choice-list">
            {collections.map((collection) => {
              const duplicate = savedIds.has(collection.id)
              return (
              <button key={collection.id} onClick={() => save.mutate(collection.id)} disabled={save.isPending || duplicate}>
                <span className="choice-thumb">{collection.cover_url ? <img src={collection.cover_url} alt="" /> : <span>{collection.name.slice(0, 1)}</span>}</span>
                <span><strong>{collection.name}</strong><small>{duplicate ? 'Already saved here' : `${collection.item_count} saved`}</small></span>
                {duplicate ? <span className="save-duplicate-mark">Saved</span> : <Check size={17} />}
              </button>
              )
            })}
          </div>
          <CreateCollectionDialog trigger={<button className="secondary-button full"><Plus size={16} /> New collection</button>} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
