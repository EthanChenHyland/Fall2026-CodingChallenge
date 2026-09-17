import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { api } from './api'
import { AppShell } from './components/AppShell'
import { AuthPage } from './pages/AuthPage'
import { CollectionPage } from './pages/CollectionPage'
import { CollectionsPage } from './pages/CollectionsPage'
import { DiscoverPage } from './pages/DiscoverPage'
import { ExplorePage } from './pages/ExplorePage'
import { SharedPage } from './pages/SharedPage'
import { ProfilePage } from './pages/ProfilePage'
import { PinPage } from './pages/PinPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: false },
  },
})

function ProtectedApp() {
  const { data, isLoading } = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false })
  if (isLoading) return <div className="app-boot"><span className="brand-mark"><Sparkles size={18} /></span><span>Mosaic</span></div>
  if (!data?.user) return <AuthPage />
  return <AppShell />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<ProtectedApp />}>
            <Route path="/" element={<DiscoverPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/:id" element={<CollectionPage />} />
            <Route path="/people/:id" element={<ProfilePage />} />
            <Route path="/pin/:id" element={<PinPage />} />
          </Route>
          <Route path="/shared/:token" element={<SharedPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-center" richColors />
    </QueryClientProvider>
  )
}
