import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Send, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api } from '../api'

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function SendPinDialog({ pinId, pinTitle, pinImageUrl, trigger }: { pinId: number; pinTitle: string; pinImageUrl: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const queryClient = useQueryClient()
  const conversations = useQuery({ queryKey: ['message-conversations'], queryFn: api.messageConversations, enabled: open })
  const send = useMutation({
    mutationFn: ({ conversationId, name }: { conversationId: number; name: string }) => api.sendMessage(conversationId, message.trim(), pinId).then(() => name),
    onSuccess: (name) => {
      void queryClient.invalidateQueries({ queryKey: ['message-conversations'] })
      void queryClient.invalidateQueries({ queryKey: ['conversation'] })
      setMessage('')
      setOpen(false)
      toast.success(`Sent to ${name}`)
    },
    onError: (error) => toast.error(error.message),
  })

  const list = conversations.data?.conversations ?? []
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setMessage('') }}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card send-pin-dialog">
          <div className="dialog-head"><div><span className="eyebrow">SEND PIN</span><Dialog.Title>Share it with someone.</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close dialog"><X size={18} /></Dialog.Close></div>
          <Dialog.Description className="muted">Add a note if you want, then choose a recent conversation. The pin stays attached as a preview in the thread.</Dialog.Description>
          <div className="send-pin-compose">
            <div className="send-pin-preview"><img src={pinImageUrl} alt="" /><span><strong>{pinTitle}</strong><small>Pin preview</small></span></div>
            <label><span>Message <small>optional</small></span><textarea aria-label="Add a message" maxLength={1200} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Add a personal note…" /></label>
          </div>
          <div className="send-pin-list">
            {conversations.isLoading ? <p className="messages-placeholder">Loading conversations…</p> : list.length ? list.map((conversation) => (
              <button key={conversation.id} disabled={send.isPending} onClick={() => send.mutate({ conversationId: conversation.id, name: conversation.other_user_name })}>
                <span className="conversation-avatar">{conversation.other_user_avatar ? <img src={conversation.other_user_avatar} alt="" /> : initials(conversation.other_user_name)}</span>
                <span><strong>{conversation.other_user_name}</strong><small>{conversation.last_message || 'Start the conversation'}</small></span>
                <Send size={15} />
              </button>
            )) : <div className="send-pin-empty"><MessageCircle size={24} /><strong>No conversations yet.</strong><span>Open someone’s profile and choose Message first.</span></div>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
