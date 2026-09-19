import { useQuery } from '@tanstack/react-query'
import { LoaderCircle, RotateCcw } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { BrandMark } from '../components/BrandMark'
import { CollectionPresentation } from '../components/CollectionPresentation'

export function SharedPresentationPage() {
  const token = useParams().token ?? ''
  const navigate = useNavigate()
  const { data, isLoading, isError, isFetching, refetch } = useQuery({ queryKey: ['shared', token], queryFn: () => api.sharedCollection(token), enabled: Boolean(token) })

  if (isLoading) return <div className="shared-shell"><div className="loading-page presentation-loading" role="status" aria-live="polite"><LoaderCircle size={22} className="spin" /><span>Preparing presentation…</span></div></div>
  if (isError || !data) return <div className="shared-shell"><div className="empty-state presentation-error" role="alert"><BrandMark /><h3>We couldn’t open this presentation.</h3><p>The link may have changed, or the connection may have dropped.</p><button className="secondary-button" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />} {isFetching ? 'Trying again…' : 'Try again'}</button></div></div>

  return <CollectionPresentation collection={data.collection} open onOpenChange={(open) => { if (!open) navigate(`/shared/${token}`) }} />
}
