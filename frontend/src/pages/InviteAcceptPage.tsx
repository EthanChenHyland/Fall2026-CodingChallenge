import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Users } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api'

export function InviteAcceptPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const started = useRef(false)
  const accept = useMutation({
    mutationFn: () => api.acceptEditorInvite(token),
    onSuccess: ({ collection, alreadyMember }) => {
      void queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast.success(alreadyMember ? 'You already have access to this collection' : 'You joined as an editor')
      navigate(`/collections/${collection.id}`, { replace: true })
    },
  })

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    accept.mutate()
  }, [token, accept])

  if (accept.isError) {
    return <main className="empty-state large"><Users size={28} /><h1>Invite unavailable</h1><p>{accept.error.message}</p><Link className="secondary-button" to="/collections"><ArrowLeft size={16} /> Back to collections</Link></main>
  }

  return <main className="empty-state large"><Users size={28} /><h1>Joining collection…</h1><p>Checking this editor invite and adding your account.</p></main>
}
