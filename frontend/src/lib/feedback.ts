export function confirmSaveFeedback() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (typeof navigator.vibrate === 'function') navigator.vibrate(8)
}
