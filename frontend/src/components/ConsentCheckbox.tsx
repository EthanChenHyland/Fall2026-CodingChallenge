import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

export function ConsentCheckbox({ checked, onChange, children, disabled = false }: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={`consent-checkbox ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="consent-checkbox-box" aria-hidden="true"><Check size={12} /></span>
      <span className="consent-checkbox-copy">{children}</span>
    </label>
  )
}
