import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ImagePlus, UploadCloud } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api'
import { ConsentCheckbox } from '../components/ConsentCheckbox'
import { cloudUploadsConfigured, uploadImage } from '../lib/uploads'

function looksLikeDirectImageUrl(value: string) {
  if (!value) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const path = url.pathname.toLowerCase()
    return /\.(avif|gif|jpe?g|png|webp)$/.test(path)
      || ['cdn.pixabay.com', 'images.pexels.com', 'images.unsplash.com'].includes(url.hostname)
  } catch {
    return false
  }
}

export function CapturePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['collections'], queryFn: api.collections })
  const [captureId] = useState(() => `capture-${crypto.randomUUID()}`)
  const sharedUrl = params.get('url') || ''
  const [collectionId, setCollectionId] = useState(0)
  const [title, setTitle] = useState(params.get('title') || '')
  const [imageUrl, setImageUrl] = useState(looksLikeDirectImageUrl(sharedUrl) ? sharedUrl : '')
  const [sourceUrl, setSourceUrl] = useState(sharedUrl)
  const [note, setNote] = useState(params.get('text') || '')
  const [tags, setTags] = useState('')
  const [uploading, setUploading] = useState(false)
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const effectiveCollectionId = collectionId || data?.collections[0]?.id || 0
  const uploadsEnabled = cloudUploadsConfigured()

  const save = useMutation({
    mutationFn: async () => {
      const result = await api.saveImage(effectiveCollectionId, {
        id: captureId,
        title: title.trim(),
        creator: 'Captured by you',
        imageUrl: imageUrl.trim(),
        pageUrl: sourceUrl.trim() || imageUrl.trim(),
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
        width: 1,
        height: 1,
      }, note.trim())
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      queryClient.invalidateQueries({ queryKey: ['collection', effectiveCollectionId] })
      toast.success('Captured to Mosaic')
      navigate(`/collections/${effectiveCollectionId}`)
    },
    onError: (error) => toast.error(error.message),
  })

  const handleUpload = async (file: File) => {
    if (!rightsConfirmed) {
      toast.error('Confirm that you have the right to use this image before uploading it.')
      return
    }
    setUploading(true)
    try {
      const uploaded = await uploadImage(file)
      setImageUrl(uploaded.imageUrl)
      if (!title.trim()) setTitle(uploaded.originalName)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="capture-page">
      <div className="capture-intro"><span className="eyebrow">QUICK CAPTURE</span><h1>Save something new.</h1><p>Paste a direct image URL to keep it in a collection. A shared webpage link goes in Source URL; choose its image separately.</p></div>
      <div className="capture-card">
        <ConsentCheckbox checked={rightsConfirmed} onChange={setRightsConfirmed}>I confirm I have the right to use this image.</ConsentCheckbox>
        {imageUrl ? <div className="capture-preview"><img src={imageUrl} alt="Preview" /></div> : uploadsEnabled ? (
          <label className={`capture-placeholder capture-upload-dropzone ${uploading ? 'uploading' : ''} ${!rightsConfirmed ? 'locked' : ''}`} aria-disabled={!rightsConfirmed}>
            <span className="capture-upload-icon"><ImagePlus size={30} /></span>
            <strong>{uploading ? 'Uploading your image…' : rightsConfirmed ? 'Upload an image' : 'Confirm your rights to upload'}</strong>
            <span>{rightsConfirmed ? 'Choose a JPEG, PNG, WebP, or GIF up to 10 MB.' : 'Check the confirmation above, then choose your file.'}</span>
            <span className="capture-upload-cta"><UploadCloud size={14} /> Choose file</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading || !rightsConfirmed} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUpload(file); event.currentTarget.value = '' }} />
          </label>
        ) : <div className="capture-placeholder"><ImagePlus size={32} /><span>Your image preview will appear here.</span></div>}
        {uploadsEnabled && imageUrl && <label className={`capture-upload secondary-button ${!rightsConfirmed ? 'disabled' : ''}`}><UploadCloud size={15} /> {uploading ? 'Uploading…' : 'Replace image'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading || !rightsConfirmed} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUpload(file); event.currentTarget.value = '' }} /></label>}
        <label className="field-label">Image URL<input autoFocus value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…/image.jpg" /></label>
        <label className="field-label">Title<input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What should you remember this as?" /></label>
        <label className="field-label">Note <span className="field-optional">optional</span><textarea aria-label="Note" maxLength={500} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why are you keeping it?" /></label>
        <label className="field-label">Tags <span className="field-optional">optional</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="architecture, blue, reference" /></label>
        <label className="field-label">Source URL <span className="field-optional">optional</span><input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
        {data?.collections.length ? <label className="field-label">Collection<select value={effectiveCollectionId} onChange={(event) => setCollectionId(Number(event.target.value))}>{data.collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select></label> : <div className="capture-no-collections"><p>Create a collection before capturing your first pin.</p><Link className="secondary-button" to="/collections">Go to Collections</Link></div>}
        <button className="primary-button full" disabled={!effectiveCollectionId || !imageUrl.trim() || !title.trim() || !rightsConfirmed || save.isPending || uploading} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : <>Save to Mosaic <ArrowRight size={16} /></>}</button>
      </div>
    </section>
  )
}
