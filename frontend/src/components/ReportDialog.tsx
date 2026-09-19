import * as Dialog from '@radix-ui/react-dialog'
import { useMutation } from '@tanstack/react-query'
import { Flag, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '../api'

type TargetType = 'pin' | 'profile' | 'comment'
type Reason = 'spam' | 'harassment' | 'sexual' | 'copyright' | 'other'

export function ReportDialog({ targetType, targetId, trigger }: { targetType: TargetType; targetId: number; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<Reason | ''>('')
  const [details, setDetails] = useState('')
  const report = useMutation({
    mutationFn: () => api.reportContent({ targetType, targetId, reason: reason as Reason, details }),
    onSuccess: () => {
      setOpen(false)
      setReason('')
      setDetails('')
      toast.success('Report submitted')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger ?? <button className="text-button report-trigger"><Flag size={13} /> Report</button>}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card compact report-dialog" aria-describedby="report-dialog-description">
          <div className="dialog-head">
            <div><span className="eyebrow">REPORT</span><Dialog.Title>Tell us what’s wrong</Dialog.Title></div>
            <Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close>
          </div>
          <Dialog.Description id="report-dialog-description" className="muted">Reports are private and help keep public Mosaic content useful.</Dialog.Description>
          <label className="field-label">Reason
            <select aria-label="Report reason" value={reason} onChange={(event) => setReason(event.target.value as Reason | '')}>
              <option value="">Choose a reason</option>
              <option value="spam">Spam or misleading</option>
              <option value="harassment">Harassment or abuse</option>
              <option value="sexual">Sexual or inappropriate content</option>
              <option value="copyright">Copyright or ownership concern</option>
              <option value="other">Something else</option>
            </select>
          </label>
          <label className="field-label">Details <span className="field-optional">optional</span>
            <textarea aria-label="Report details" value={details} maxLength={500} rows={3} onChange={(event) => setDetails(event.target.value)} placeholder="Add context for the review." />
          </label>
          <button className="primary-button full" disabled={!reason || report.isPending} onClick={() => report.mutate()}>{report.isPending ? 'Submitting…' : 'Submit report'}</button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
