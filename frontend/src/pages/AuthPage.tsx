import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { BrandMark } from '../components/BrandMark'
import type { User } from '../types'

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const queryClient = useQueryClient()

  const finish = ({ user }: { user: User }) => {
    // Authentication establishes a new account boundary. Never reuse queries
    // that may have been populated by an expired or previously signed-in user.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' })
    queryClient.setQueryData(['me'], { user })
  }

  const auth = useMutation({
    mutationFn: () =>
      mode === 'login'
        ? api.login({ email, password })
        : api.register({ name, email, password }),
    onSuccess: finish,
    onError: () => { /* The form renders the error inline. */ },
  })

  const demo = useMutation({
    mutationFn: api.demoLogin,
    onSuccess: finish,
    onError: () => { /* The form renders the error inline. */ },
  })

  const switchMode = (nextMode: 'login' | 'register') => {
    if (nextMode === mode || auth.isPending || demo.isPending) return
    setMode(nextMode)
    setPassword('')
    setShowPassword(false)
    auth.reset()
    demo.reset()
  }

  const errorMessage = auth.error?.message ?? demo.error?.message
  const canSubmit = Boolean(email.trim()) && password.length >= 6 && (mode === 'login' || name.trim().length >= 2)

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="auth-brand"><BrandMark /> Mosaic</div>
        <div>
          <span className="eyebrow">SAVE · ORGANIZE · SHARE</span>
          <h1>Keep track of what you find.</h1>
          <p>Save images, build collections, and share them when you want to.</p>
        </div>
        <span className="auth-foot">Mosaic · Fall 2026</span>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mode-switch" aria-label="Account action">
            <button type="button" className={mode === 'login' ? 'active' : ''} aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>Sign in</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} aria-pressed={mode === 'register'} onClick={() => switchMode('register')}>Create account</button>
          </div>
          <span className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'MAKE A SPACE'}</span>
          <h2>{mode === 'login' ? 'Pick up where you left off.' : 'Start collecting.'}</h2>
          <p>{mode === 'login' ? 'Sign in to your collections and shared boards.' : 'Create an account to save and collaborate.'}</p>

          <form className="auth-form" onSubmit={(event) => { event.preventDefault(); if (canSubmit && !auth.isPending && !demo.isPending) auth.mutate() }}>
            {mode === 'register' && (
              <label className="field-label" htmlFor="auth-name">Name<input disabled={auth.isPending || demo.isPending} id="auth-name" name="name" maxLength={80} autoFocus autoComplete="name" value={name} onChange={(event) => { setName(event.target.value); auth.reset(); demo.reset() }} placeholder="Your name" /></label>
            )}
            <label className="field-label" htmlFor="auth-email">Email<input disabled={auth.isPending || demo.isPending} id="auth-email" name="email" maxLength={160} autoFocus={mode === 'login'} autoComplete="email" inputMode="email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); auth.reset(); demo.reset() }} placeholder="you@vanderbilt.edu" /></label>
            <div className="field-label auth-password-label">
              <label htmlFor="auth-password">Password</label>
              <span className="auth-password-field">
                <input disabled={auth.isPending || demo.isPending} id="auth-password" name="password" maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => { setPassword(event.target.value); auth.reset(); demo.reset() }} placeholder={mode === 'login' ? 'Your password' : 'At least 6 characters'} />
                <button type="button" className="auth-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </span>
            </div>

            {errorMessage && <div className="auth-inline-error" role="alert">{errorMessage}</div>}

            <button type="submit" className="primary-button full auth-submit" disabled={auth.isPending || demo.isPending || !canSubmit}>
              {auth.isPending ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16} />
            </button>
          </form>

          <div className="auth-divider"><span>or</span></div>
          <div className="auth-demo-card">
            <div className="auth-demo-copy"><strong>Just looking around?</strong><span>Open a filled-in workspace with saved pins, boards, and collaboration data.</span></div>
            <button type="button" className="secondary-button" disabled={demo.isPending || auth.isPending} onClick={() => { demo.reset(); auth.reset(); demo.mutate() }}>
              {demo.isPending ? 'Opening…' : 'Open demo'}
            </button>
          </div>
          <p className="auth-legal">By using Mosaic, you acknowledge how this educational deployment handles account and content data. <Link to="/privacy">Read the Privacy Policy</Link>.</p>
        </div>
      </section>
    </main>
  )
}
