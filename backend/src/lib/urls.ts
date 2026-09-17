import { z } from 'zod'

export const imageUrlSchema = z.string().max(2048).refine((value) => {
  if (/^\/media\/[a-f0-9]{64}\.(jpg|png|webp|gif)$/.test(value)) return true
  try { return new URL(value).protocol === 'https:' } catch { return false }
}, 'Use an HTTPS image URL.')
export const sourceUrlSchema = z.string().max(2048).refine((value) => {
  if (!value || /^\/media\/[a-f0-9]{64}\.(jpg|png|webp|gif)$/.test(value)) return true
  try { return ['https:', 'http:'].includes(new URL(value).protocol) } catch { return false }
}, 'Use an HTTP or HTTPS source URL.')
