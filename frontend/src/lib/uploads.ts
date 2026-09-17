export type UploadedImage = {
  imageUrl: string
  width: number
  height: number
  originalName: string
}

export function cloudUploadsConfigured() {
  return Boolean(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME && import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET)
}

export async function uploadImage(file: File): Promise<UploadedImage> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  if (!cloudName || !uploadPreset) throw new Error('Cloudinary upload settings are not configured.')

  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Choose a JPEG, PNG, WebP, or GIF image.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose an image under 10 MB.')
  const body = new FormData()
  body.append('file', file)
  body.append('upload_preset', uploadPreset)
  body.append('folder', 'mosaic-pins')

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, { method: 'POST', body, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error('Image upload failed. Check the Cloudinary preset and try again.')
  const result = await response.json() as { secure_url: string; width: number; height: number; original_filename?: string }
  return {
    imageUrl: result.secure_url,
    width: result.width,
    height: result.height,
    originalName: result.original_filename || file.name.replace(/\.[^.]+$/, ''),
  }
}
