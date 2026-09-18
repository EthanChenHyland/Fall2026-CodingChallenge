import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Users } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api'

export function InviteAcceptPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const preview = useQuery({ queryKey: ['editor-invite-preview', token], queryFn: () => api.editorInvitePreview(token), enabled: Boolean(token), retry: false })
  const accept = useMutation({
    mutationFn: () => api.acceptEditorInvite(token),
    onSuccess: ({ collection, alreadyMember }) => {
      void queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast.success(alreadyMember ? 'You already have access to this collection' : 'You joined as an editor')
      navigate(`/collections/${collection.id}`, { replace: true })
    },
  })

  if (preview.isError || accept.isError) {
    const error = preview.error ?? accept.error
    return <main className="empty-state large"><Users size={28} /><h1>Invite unavailable</h1><p>{error?.message}</p><Link className="secondary-button" to="/collections"><ArrowLeft size={16} /> Back to collections</Link></main>
  }

  if (preview.isLoading || !preview.data) return <main className="empty-state large"><Users size={28} /><h1>Checking invite…</h1><p>Loading the collection details.</p></main>

  const invite = preview.data.invite
  return <main className="empty-state large"><Users size={28} /><h1>{invite.collectionName}</h1><p>{invite.ownerName} invited you to collaborate as an editor.</p>{invite.alreadyMember ? <button className="primary-button" onClick={() => navigate(`/collections/${invite.collectionId}`)}>Open collection</button> : <button className="primary-button" disabled={accept.isPending} onClick={() => accept.mutate()}>{accept.isPending ? 'Joining…' : 'Accept editor invite'}</button>}<Link className="secondary-button" to="/collections"><ArrowLeft size={16} /> Back to collections</Link></main>
}
