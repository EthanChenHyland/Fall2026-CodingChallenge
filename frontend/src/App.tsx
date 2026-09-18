import { MutationCache, QueryCache, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import { api, ApiError } from './api'
import { AppShell } from './components/AppShell'
import { BrandMark } from './components/BrandMark'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthPage } from './pages/AuthPage'
import { CollectionPage } from './pages/CollectionPage'
import { CollectionsPage } from './pages/CollectionsPage'
import { DiscoverPage } from './pages/DiscoverPage'
import { ExplorePage } from './pages/ExplorePage'
import { SharedPage } from './pages/SharedPage'
import { ProfilePage } from './pages/ProfilePage'
import { PinPage } from './pages/PinPage'
import { CapturePage } from './pages/CapturePage'
import { SmartCollectionPage } from './pages/SmartCollectionPage'
import { MessagesPage } from './pages/MessagesPage'
import { InviteAcceptPage } from './pages/InviteAcceptPage'

function handleUnauthorized(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401) return false
  // A session can expire or be revoked without the in-app Sign out button.
  // Drop account-scoped data immediately so another login can never inherit it.
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' })
  queryClient.setQueryData(['me'], { user: null })
  return true
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => { handleUnauthorized(error) },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (handleUnauthorized(error)) return
      if (!mutation.options.onError) toast.error(error.message)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ predicate: (query) => ['smart-collection', 'pin', 'profile', 'explore', 'profile-connections', 'social-search', 'shared'].includes(String(query.queryKey[0])) }) },
  }),
  defaultOptions: {
    mutations: { networkMode: 'always' },
    queries: { networkMode: 'always', staleTime: 15_000, refetchOnWindowFocus: false, retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2 },
  },
})

function ProtectedApp() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false })
  if (isLoading) return <div className="app-boot"><BrandMark /><span>Mosaic</span></div>
  if (!data?.user && error && !(error instanceof ApiError && error.status === 401)) return <main className="empty-state large"><BrandMark /><h1>Connect to Mosaic</h1><p>{error.message}</p><button className="primary-button" onClick={() => void refetch()}>Try again</button></main>
  if (!data?.user) return <AuthPage />
  return <AppShell />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<ProtectedApp />}>
            <Route path="/" element={<DiscoverPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/smart/:mode" element={<SmartCollectionPage />} />
            <Route path="/collections/:id" element={<CollectionPage />} />
            <Route path="/people/:id" element={<ProfilePage />} />
            <Route path="/pin/:id" element={<PinPage />} />
            <Route path="/capture" element={<CapturePage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/:conversationId" element={<MessagesPage />} />
            <Route path="/invite/:token" element={<InviteAcceptPage />} />
          </Route>
          <Route path="/shared/:token" element={<SharedPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ErrorBoundary>
      <Toaster position="bottom-center" richColors />
    </QueryClientProvider>
  )
}
