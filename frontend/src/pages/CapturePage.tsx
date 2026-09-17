import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ImagePlus, UploadCloud } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api'
import { cloudUploadsConfigured, uploadImage } from '../lib/uploads'

export function CapturePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['collections'], queryFn: api.collections })
  const [collectionId, setCollectionId] = useState(0)
  const [title, setTitle] = useState(params.get('title') || '')
  const [imageUrl, setImageUrl] = useState(params.get('url') || '')
  const [sourceUrl, setSourceUrl] = useState(params.get('url') || '')
  const [note, setNote] = useState(params.get('text') || '')
  const [uploading, setUploading] = useState(false)
  const effectiveCollectionId = collectionId || data?.collections[0]?.id || 0

  const save = useMutation({
    mutationFn: async () => {
      const result = await api.saveImage(effectiveCollectionId, {
        id: `capture-${Date.now()}`,
        title: title.trim(),
        creator: 'Captured by you',
        imageUrl: imageUrl.trim(),
        pageUrl: sourceUrl.trim() || imageUrl.trim(),
        tags: ['capture'],
        width: 1,
        height: 1,
      })
      if (note.trim()) await api.updateItem(effectiveCollectionId, result.item.id, { note: note.trim() })
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
      <div className="capture-intro"><span className="eyebrow">QUICK CAPTURE</span><h1>Bring it into<br /><em>Mosaic.</em></h1><p>Paste an image URL, share one into the installed app, or upload a file when Cloudinary is configured.</p></div>
      <div className="capture-card">
        {imageUrl ? <div className="capture-preview"><img src={imageUrl} alt="Preview" /></div> : <div className="capture-placeholder"><ImagePlus size={32} /><span>Your image preview will appear here.</span></div>}
        {cloudUploadsConfigured() && <label className="capture-upload secondary-button"><UploadCloud size={15} /> {uploading ? 'Uploading…' : 'Upload image'}<input type="file" accept="image/*" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUpload(file) }} /></label>}
        <label className="field-label">Image URL<input autoFocus value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…/image.jpg" /></label>
        <label className="field-label">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What should you remember this as?" /></label>
        <label className="field-label">Note <span className="field-optional">optional</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why are you keeping it?" /></label>
        <label className="field-label">Source URL <span className="field-optional">optional</span><input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
        {data?.collections.length ? <label className="field-label">Collection<select value={effectiveCollectionId} onChange={(event) => setCollectionId(Number(event.target.value))}>{data.collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select></label> : <div className="capture-no-collections"><p>Create a collection before capturing your first pin.</p><Link className="secondary-button" to="/collections">Go to Collections</Link></div>}
        <button className="primary-button full" disabled={!effectiveCollectionId || !imageUrl.trim() || !title.trim() || save.isPending || uploading} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : <>Save to Mosaic <ArrowRight size={16} /></>}</button>
      </div>
    </section>
  )
}
