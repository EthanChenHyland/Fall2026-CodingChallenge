import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileJson, ImagePlus, UploadCloud, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api'
import { cloudUploadsConfigured, uploadImage } from '../lib/uploads'
import { ConsentCheckbox } from './ConsentCheckbox'

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export function ImportDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [collectionId, setCollectionId] = useState(0)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const [importingImages, setImportingImages] = useState(false)
  const [progress, setProgress] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const collectionsQuery = useQuery({ queryKey: ['collections'], queryFn: api.collections })
  const collections = collectionsQuery.data?.collections ?? []
  const effectiveCollectionId = collections.some((collection) => collection.id === collectionId)
    ? collectionId
    : collections[0]?.id ?? 0
  const uploadsEnabled = cloudUploadsConfigured()

  const importCollection = useMutation({
    mutationFn: api.importCollection,
    onSuccess: ({ collection }) => {
      void queryClient.invalidateQueries({ queryKey: ['collections'] })
      setOpen(false)
      toast.success('Collection imported privately')
      navigate(`/collections/${collection.id}`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const chooseCollectionExport = async (file?: File) => {
    if (!file) return
    try {
      importCollection.mutate(JSON.parse(await file.text()) as unknown)
    } catch {
      toast.error('Choose a valid Mosaic JSON export.')
    }
  }

  const chooseImages = (files: FileList | null) => {
    const selected = Array.from(files ?? []).slice(0, 20)
    const valid = selected.filter((file) => imageTypes.has(file.type) && file.size <= 10 * 1024 * 1024)
    if (selected.length > valid.length) toast.info('Mosaic skipped unsupported images or files over 10 MB.')
    if ((files?.length ?? 0) > 20) toast.info('You can import up to 20 images at a time.')
    setImageFiles(valid)
  }

  const importImages = async () => {
    if (!rightsConfirmed) return toast.error('Confirm that you have the right to use these images first.')
    if (!effectiveCollectionId) return toast.error('Create a collection before importing images.')
    if (!imageFiles.length) return toast.error('Choose at least one image to import.')
    setImportingImages(true)
    const failed: File[] = []
    let saved = 0
    for (let index = 0; index < imageFiles.length; index += 1) {
      const file = imageFiles[index]
      setProgress(`Importing ${index + 1} of ${imageFiles.length}…`)
      try {
        const uploaded = await uploadImage(file, 'mosaic-pins')
        const title = (uploaded.originalName || file.name.replace(/\.[^.]+$/, '') || 'Imported image').trim().slice(0, 120)
        await api.saveImage(effectiveCollectionId, {
          id: `upload-${crypto.randomUUID()}`,
          title: title || 'Imported image',
          creator: 'Uploaded by you',
          imageUrl: uploaded.imageUrl,
          pageUrl: uploaded.imageUrl,
          tags: [],
          width: uploaded.width,
          height: uploaded.height,
        })
        saved += 1
      } catch {
        failed.push(file)
      }
    }
    setImageFiles(failed)
    setProgress('')
    setImportingImages(false)
    void queryClient.invalidateQueries({ queryKey: ['collections'] })
    void queryClient.invalidateQueries({ queryKey: ['collection', effectiveCollectionId] })
    if (saved) toast.success(`${saved} ${saved === 1 ? 'image' : 'images'} imported`)
    if (failed.length) toast.error(`${failed.length} ${failed.length === 1 ? 'image' : 'images'} could not be imported. You can retry.`)
    if (saved && !failed.length) {
      setRightsConfirmed(false)
      setOpen(false)
      navigate(`/collections/${effectiveCollectionId}`)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card import-dialog">
          <div className="dialog-head">
            <div><span className="eyebrow">IMPORT</span><Dialog.Title>Bring things into Mosaic.</Dialog.Title></div>
            <Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close>
          </div>
          <Dialog.Description className="muted">Add image files from your device, or restore a collection that was exported from Mosaic.</Dialog.Description>

          <section className="import-panel">
            <div className="import-panel-head"><span className="import-panel-icon"><ImagePlus size={19} /></span><div><strong>Images from your device</strong><span>JPEG, PNG, WebP, or GIF · up to 20 files · 10 MB each</span></div></div>
            {uploadsEnabled ? <>
              {collections.length ? <label className="field-label import-destination">Save into<select value={effectiveCollectionId} onChange={(event) => setCollectionId(Number(event.target.value))}>{collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select></label> : <p className="import-help">Create a collection first, then come back here to add image files.</p>}
              <ConsentCheckbox checked={rightsConfirmed} onChange={setRightsConfirmed} disabled={importingImages}>I confirm I have the right to use the images I upload.</ConsentCheckbox>
              <label className={`import-file-picker ${!rightsConfirmed || importingImages ? 'disabled' : ''}`}>
                <UploadCloud size={18} />
                <span><strong>{imageFiles.length ? `${imageFiles.length} ${imageFiles.length === 1 ? 'image' : 'images'} selected` : 'Choose images'}</strong><small>{imageFiles.length ? imageFiles.map((file) => file.name).slice(0, 3).join(' · ') : 'Select one or several files'}</small></span>
                <input aria-label="Choose images to import" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" disabled={!rightsConfirmed || importingImages} onChange={(event) => { chooseImages(event.target.files); event.currentTarget.value = '' }} />
              </label>
              {progress ? <div className="import-progress" role="status" aria-live="polite">{progress}</div> : null}
              <button className="primary-button full" disabled={!rightsConfirmed || !effectiveCollectionId || !imageFiles.length || importingImages} onClick={() => void importImages()}>{importingImages ? 'Importing…' : `Import ${imageFiles.length || ''} ${imageFiles.length === 1 ? 'image' : 'images'}`.replace('  ', ' ')}</button>
            </> : <div className="import-unavailable"><p>Direct file uploads are not configured on this deployment.</p><Link to="/capture" onClick={() => setOpen(false)}>Use Quick Capture with an image URL instead</Link></div>}
          </section>

          <section className="import-panel compact-panel">
            <div className="import-panel-head"><span className="import-panel-icon"><FileJson size={19} /></span><div><strong>Mosaic collection export</strong><span>Restore a `.json` file created with Download export.</span></div></div>
            <label className={`secondary-button full import-json-button ${importCollection.isPending ? 'disabled' : ''}`}><FileJson size={15} /> {importCollection.isPending ? 'Importing collection…' : 'Choose Mosaic JSON export'}<input aria-label="Choose Mosaic JSON export" type="file" accept="application/json,.json" disabled={importCollection.isPending} onChange={(event) => { void chooseCollectionExport(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
