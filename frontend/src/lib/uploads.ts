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

  const body = new FormData()
  body.append('file', file)
  body.append('upload_preset', uploadPreset)
  body.append('folder', 'mosaic-pins')

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, { method: 'POST', body })
  if (!response.ok) throw new Error('Image upload failed. Check the Cloudinary preset and try again.')
  const result = await response.json() as { secure_url: string; width: number; height: number; original_filename?: string }
  return {
    imageUrl: result.secure_url,
    width: result.width,
    height: result.height,
    originalName: result.original_filename || file.name.replace(/\.[^.]+$/, ''),
  }
}
