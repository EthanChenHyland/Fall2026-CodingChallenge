import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Bookmark, MessageCircle, Send } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api'
import { SavePinDialog } from '../components/SavePinDialog'

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function MessagesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { conversationId: rawConversationId } = useParams()
  const [searchParams] = useSearchParams()
  const requestedUserId = Number(searchParams.get('with'))
  const conversationId = Number(rawConversationId)
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef<number | null>(null)

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: api.me })
  const conversations = useQuery({
    queryKey: ['message-conversations'],
    queryFn: api.messageConversations,
    refetchInterval: 15_000,
  })
  const thread = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.conversation(conversationId),
    enabled: Number.isSafeInteger(conversationId) && conversationId > 0,
    refetchInterval: 10_000,
  })

  const start = useMutation({
    mutationFn: (userId: number) => api.startConversation(userId),
    onSuccess: ({ conversationId: id }) => {
      void queryClient.invalidateQueries({ queryKey: ['message-conversations'] })
      navigate(`/messages/${id}`, { replace: true })
    },
    onError: (error) => toast.error(error.message),
  })

  useEffect(() => {
    if (!rawConversationId && Number.isSafeInteger(requestedUserId) && requestedUserId > 0 && requestedUserId !== me?.user?.id && startedRef.current !== requestedUserId) {
      startedRef.current = requestedUserId
      start.mutate(requestedUserId)
    }
  }, [me?.user?.id, rawConversationId, requestedUserId, start])

  useEffect(() => {
    if (!thread.data || !conversationId) return
    void api.markConversationRead(conversationId).then(() => queryClient.invalidateQueries({ queryKey: ['message-conversations'] })).catch(() => undefined)
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [thread.data, conversationId, queryClient])

  const send = useMutation({
    mutationFn: (body: string) => api.sendMessage(conversationId, body),
    onSuccess: () => {
      setDraft('')
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
      void queryClient.invalidateQueries({ queryKey: ['message-conversations'] })
    },
    onError: (error) => toast.error(error.message),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (body && !send.isPending) send.mutate(body)
  }

  const list = conversations.data?.conversations ?? []
  const current = thread.data?.conversation

  return (
    <section className="messages-page">
      <div className="messages-heading">
        <span className="eyebrow">MESSAGES</span>
        <h1>Keep the idea moving.</h1>
        <p>Talk directly with people you find on Mosaic.</p>
      </div>

      <div className="messages-shell">
        <aside className={`conversation-list ${current ? 'has-active-thread' : ''}`}>
          <div className="conversation-list-head"><strong>Inbox</strong><span>{list.length}</span></div>
          {conversations.isLoading ? <p className="messages-placeholder">Loading conversations…</p> : list.length ? list.map((conversation) => (
            <Link className={`conversation-row ${conversation.id === conversationId ? 'active' : ''}`} to={`/messages/${conversation.id}`} key={conversation.id}>
              <span className="conversation-avatar">{conversation.other_user_avatar ? <img src={conversation.other_user_avatar} alt="" /> : initials(conversation.other_user_name)}</span>
              <span className="conversation-copy"><strong>{conversation.other_user_name}</strong><small>{conversation.last_message || 'Start the conversation'}</small></span>
              {conversation.unread_count > 0 && <span className="conversation-unread">{conversation.unread_count > 9 ? '9+' : conversation.unread_count}</span>}
            </Link>
          )) : <div className="messages-empty-list"><MessageCircle size={22} /><p>No messages yet.</p><span>Open a profile and choose Message.</span></div>}
        </aside>

        <div className={`thread-panel ${current ? 'active' : ''}`}>
          {thread.isError ? <div className="empty-state"><h3>Conversation not available.</h3><Link className="secondary-button" to="/messages">Back to inbox</Link></div> : current ? (
            <>
              <header className="thread-head">
                <Link className="thread-back" to="/messages" aria-label="Back to inbox"><ArrowLeft size={18} /></Link>
                <span className="conversation-avatar">{current.other_user_avatar ? <img src={current.other_user_avatar} alt="" /> : initials(current.other_user_name)}</span>
                <div><strong>{current.other_user_name}</strong><Link to={`/people/${current.other_user_username}`}>View profile</Link></div>
              </header>
              <div className="message-stream" aria-live="polite">
                {thread.data?.messages.length ? thread.data.messages.map((message) => {
                  const mine = message.sender_id === me?.user?.id
                  return <div className={`message-bubble-row ${mine ? 'mine' : ''}`} key={message.id}><div className="message-bubble">{message.pin_id && message.pin_image_url && <div className="message-pin-attachment"><Link className="message-pin-preview" to={`/pin/${message.pin_id}`}><img src={message.pin_image_url} alt="" /><span><b>{message.pin_title || 'Shared pin'}</b><small>Open pin</small></span></Link><SavePinDialog pinId={message.pin_id} pinTitle={message.pin_title || 'Shared pin'} pinImageUrl={message.pin_image_url} trigger={<button className="message-pin-save" aria-label={`Save ${message.pin_title || 'shared pin'}`}><Bookmark size={13} /> Save</button>} /></div>}{message.body && <p>{message.body}</p>}<small>{new Date(`${message.created_at}Z`).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></div></div>
                }) : <div className="thread-empty"><MessageCircle size={28} /><h3>Say hello.</h3><p>Start a conversation with {current.other_user_name.split(' ')[0]}.</p></div>}
                <div ref={endRef} />
              </div>
              <form className="message-composer" onSubmit={submit}>
                <textarea aria-label="Message" maxLength={1200} rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${current.other_user_name.split(' ')[0]}…`} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (draft.trim() && !send.isPending) send.mutate(draft.trim()) } }} />
                <button className="primary-button" type="submit" disabled={!draft.trim() || send.isPending} aria-label="Send message"><Send size={16} /> Send</button>
              </form>
            </>
          ) : (
            <div className="thread-empty thread-empty-large"><MessageCircle size={34} /><h2>Your conversations live here.</h2><p>Choose a conversation, or open someone’s profile to start one.</p></div>
          )}
        </div>
      </div>
    </section>
  )
}
