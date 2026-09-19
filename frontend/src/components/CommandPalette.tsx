import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { Compass, FolderHeart, Globe2, HelpCircle, MessageCircle, Plus, Search, UserRound, X } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

type Command = {
  id: string
  label: string
  hint: string
  icon: ReactNode
  keywords: string
  run: () => void
}

export function CommandPalette({ open, onOpenChange, username, onShowShortcuts }: { open: boolean; onOpenChange: (open: boolean) => void; username?: string; onShowShortcuts: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const collections = useQuery({ queryKey: ['collections'], queryFn: api.collections, enabled: open })
  const closeAnd = useCallback((action: () => void) => { onOpenChange(false); action() }, [onOpenChange])

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: 'discover', label: 'Search ideas', hint: 'Discover', icon: <Search size={17} />, keywords: 'search discover home ideas', run: () => closeAnd(() => navigate('/', { state: { focusSearch: true } })) },
      { id: 'explore', label: 'Explore Mosaic', hint: 'Public pins', icon: <Globe2 size={17} />, keywords: 'explore public pins community', run: () => closeAnd(() => navigate('/explore')) },
      { id: 'collections', label: 'Open collections', hint: 'Your boards', icon: <FolderHeart size={17} />, keywords: 'collections boards library', run: () => closeAnd(() => navigate('/collections')) },
      { id: 'messages', label: 'Open messages', hint: 'Conversations', icon: <MessageCircle size={17} />, keywords: 'messages dm conversations', run: () => closeAnd(() => navigate('/messages')) },
      { id: 'capture', label: 'Quick capture', hint: 'Save an image', icon: <Plus size={17} />, keywords: 'capture save upload pin', run: () => closeAnd(() => navigate('/capture')) },
      { id: 'new', label: 'Create a collection', hint: 'New board', icon: <Compass size={17} />, keywords: 'new create collection board', run: () => closeAnd(() => navigate('/collections?new=1')) },
      ...(username ? [{ id: 'profile', label: 'View profile', hint: '@' + username, icon: <UserRound size={17} />, keywords: 'profile account me', run: () => closeAnd(() => navigate('/people/' + username)) }] : []),
      { id: 'shortcuts', label: 'Keyboard shortcuts', hint: 'Reference', icon: <HelpCircle size={17} />, keywords: 'keyboard shortcuts help keys', run: () => closeAnd(onShowShortcuts) },
    ]
    const collectionCommands = (collections.data?.collections ?? []).slice(0, 12).map((collection) => ({
      id: 'collection-' + collection.id,
      label: collection.name,
      hint: collection.item_count + ' saved',
      icon: <FolderHeart size={17} />,
      keywords: ('collection board ' + collection.name + ' ' + (collection.description ?? '')).toLowerCase(),
      run: () => closeAnd(() => navigate('/collections/' + collection.id)),
    }))
    return [...base, ...collectionCommands]
  }, [closeAnd, collections.data?.collections, navigate, onShowShortcuts, username])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return commands
    return commands.filter((command) => (command.label + ' ' + command.hint + ' ' + command.keywords).toLowerCase().includes(needle))
  }, [commands, query])

  const activeIndex = Math.min(active, Math.max(0, filtered.length - 1))
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="command-overlay" />
        <Dialog.Content className="command-palette" aria-describedby="command-palette-description">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description id="command-palette-description" className="sr-only">Search navigation and actions in Mosaic.</Dialog.Description>
          <div className="command-search">
            <Search size={18} />
            <input
              autoFocus
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActive(0) }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(filtered.length - 1, value + 1)) }
                if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(0, value - 1)) }
                if (event.key === 'Enter' && filtered[activeIndex]) { event.preventDefault(); filtered[activeIndex].run() }
              }}
              placeholder="Search commands and collections…"
              aria-label="Search commands and collections"
            />
            <Dialog.Close aria-label="Close command palette"><X size={16} /></Dialog.Close>
          </div>
          <div className="command-results" role="listbox" aria-label="Commands">
            {filtered.length ? filtered.map((command, index) => (
              <button
                key={command.id}
                className={index === activeIndex ? 'active' : ''}
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActive(index)}
                onClick={command.run}
              >
                <span className="command-icon">{command.icon}</span>
                <span><strong>{command.label}</strong><small>{command.hint}</small></span>
                {index === activeIndex && <kbd>↵</kbd>}
              </button>
            )) : <div className="command-empty">No matching command.</div>}
          </div>
          <div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
