import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { BrandMark } from '../components/BrandMark'
import { CollectionPresentation } from '../components/CollectionPresentation'

export function SharedPresentationPage() {
  const token = useParams().token ?? ''
  const navigate = useNavigate()
  const { data, isLoading, isError } = useQuery({ queryKey: ['shared', token], queryFn: () => api.sharedCollection(token), enabled: Boolean(token) })

  if (isLoading) return <div className="shared-shell"><div className="loading-page">Preparing presentation…</div></div>
  if (isError || !data) return <div className="shared-shell"><div className="empty-state"><BrandMark /><h3>This presentation is no longer available.</h3></div></div>

  return <CollectionPresentation collection={data.collection} open onOpenChange={(open) => { if (!open) navigate(`/shared/${token}`) }} />
}
