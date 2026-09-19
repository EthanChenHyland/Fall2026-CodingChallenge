import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api'
import { confirmSaveFeedback } from '../lib/feedback'
import { recentCollection, rememberCollection } from '../lib/recentCollection'
import type { CatalogImage, Collection } from '../types'
import { SaveImageDialog } from './Dialogs'
import { SavePinDialog } from './SavePinDialog'

export function QuickSaveControls({ image, pinId }: { image: CatalogImage; pinId?: number }) {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['collections'], queryFn: api.collections })
  const [saved, setSaved] = useState(false)
  const collections = data?.collections ?? []
  const target = collections.length ? recentCollection(collections) : null

  const save = useMutation({
    mutationFn: (collectionId: number) => pinId ? api.savePin(pinId, collectionId) : api.saveImage(collectionId, image),
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
      confirmSaveFeedback()
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1400)
      queryClient.invalidateQueries({ queryKey: ['collection', collectionId] })
      toast.success(`Saved to ${target?.name ?? 'collection'}`)
    },
    onError: (error, _collectionId, context) => {
      if (context?.previous) queryClient.setQueryData(['collections'], context.previous)
      if (error.message.includes('already in this collection')) {
        rememberCollection(_collectionId)
        setSaved(true)
        window.setTimeout(() => setSaved(false), 1400)
        toast.info(`Already saved to ${target?.name ?? 'this collection'}`)
        return
      }
      toast.error(error.message)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['collections'] }),
  })

  if (!target) {
    return pinId
      ? <SavePinDialog pinId={pinId} pinTitle={image.title} pinImageUrl={image.imageUrl} trigger={<button className="save-button"><Bookmark size={16} /> Save</button>} />
      : <SaveImageDialog image={image} trigger={<button className="save-button"><Bookmark size={16} /> Save</button>} />
  }

  return (
    <div className="quick-save-controls">
      <button
        className={`save-button quick-save-main ${saved ? 'saved' : ''}`}
        aria-label={`Save to ${target.name}`}
        title={`Save to ${target.name}`}
        disabled={save.isPending}
        onClick={() => save.mutate(target.id)}
      >
        {saved ? <Check size={16} /> : <Bookmark size={16} />}
        {saved ? 'Saved' : 'Save'}
      </button>
      {pinId
        ? <SavePinDialog pinId={pinId} pinTitle={image.title} pinImageUrl={image.imageUrl} trigger={<button className="quick-save-more" aria-label="Choose another collection" title="Choose another collection"><ChevronDown size={15} /></button>} />
        : <SaveImageDialog image={image} trigger={<button className="quick-save-more" aria-label="Choose another collection" title="Choose another collection"><ChevronDown size={15} /></button>} />}
    </div>
  )
}
