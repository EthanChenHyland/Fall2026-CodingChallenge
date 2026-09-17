import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api'

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const queryClient = useQueryClient()

  const finish = () => {
    queryClient.invalidateQueries({ queryKey: ['me'] })
    queryClient.invalidateQueries({ queryKey: ['collections'] })
  }

  const auth = useMutation({
    mutationFn: () =>
      mode === 'login'
        ? api.login({ email, password })
        : api.register({ name, email, password }),
    onSuccess: finish,
    onError: (error) => toast.error(error.message),
  })

  const demo = useMutation({
    mutationFn: api.demoLogin,
    onSuccess: finish,
    onError: (error) => toast.error(error.message),
  })

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="auth-brand"><span className="brand-mark"><Sparkles size={18} /></span> Mosaic</div>
        <div>
          <span className="eyebrow">A PLACE FOR WHAT CATCHES YOUR EYE</span>
          <h1>Keep the internet<br /><em>worth keeping.</em></h1>
          <p>Discover images, shape visual collections, and build boards together.</p>
        </div>
        <span className="auth-foot">Designed for collecting slowly.</span>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <span className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'MAKE A SPACE'}</span>
          <h2>{mode === 'login' ? 'Pick up where you left off.' : 'Start collecting.'}</h2>
          <p>{mode === 'login' ? 'Sign in to your collections and shared boards.' : 'Create an account to save and collaborate.'}</p>

          {mode === 'register' && (
            <label className="field-label">Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label>
          )}
          <label className="field-label">Email<input autoFocus={mode === 'login'} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@vanderbilt.edu" /></label>
          <label className="field-label">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" /></label>
          <button className="primary-button full auth-submit" disabled={auth.isPending || !email.trim() || password.length < 6 || (mode === 'register' && name.trim().length < 2)} onClick={() => auth.mutate()}>
            {auth.isPending ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16} />
          </button>

          <div className="auth-divider"><span>or</span></div>
          <button className="secondary-button full" disabled={demo.isPending} onClick={() => demo.mutate()}>
            {demo.isPending ? 'Opening demo…' : 'Explore with the demo account'}
          </button>
          <p className="auth-demo-note">No setup needed. The demo account includes a starter collection and a second account for collaboration testing.</p>

          <button className="auth-switch" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'New to Mosaic? Create an account' : 'Already have an account? Sign in'}
          </button>
        </div>
      </section>
    </main>
  )
}
