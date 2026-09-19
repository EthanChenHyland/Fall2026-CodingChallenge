import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { BrandMark } from '../components/BrandMark'
import { ConsentCheckbox } from '../components/ConsentCheckbox'
import { WelcomeIntro } from '../components/WelcomeIntro'
import type { User } from '../types'

type AuthResult =
  | { user: User }
  | { verificationRequired: false; user: User }
  | { verificationRequired: true; email: string }

export function AuthPage() {
  const [showIntro, setShowIntro] = useState(() => window.sessionStorage.getItem('mosaic:intro:seen') !== '1')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const queryClient = useQueryClient()

  const finish = ({ user }: { user: User }) => {
    // Authentication establishes a new account boundary. Never reuse queries
    // that may have been populated by an expired or previously signed-in user.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' })
    queryClient.setQueryData(['me'], { user })
  }

  const auth = useMutation<AuthResult, Error>({
    mutationFn: (): Promise<AuthResult> =>
      mode === 'login'
        ? api.login({ email, password })
        : api.startRegistration({ name, email, password, ageConfirmed }),
    onSuccess: (result) => {
      if ('verificationRequired' in result && result.verificationRequired) {
        setVerificationEmail(result.email)
        setVerificationCode('')
        return
      }
      if ('user' in result) finish(result)
    },
    onError: () => { /* The form renders the error inline. */ },
  })
  const verify = useMutation({
    mutationFn: () => api.verifyRegistration({ email: verificationEmail, code: verificationCode }),
    onSuccess: finish,
    onError: () => { /* The form renders the error inline. */ },
  })

  const switchMode = (nextMode: 'login' | 'register') => {
    if (nextMode === mode || auth.isPending || verify.isPending) return
    setMode(nextMode)
    setPassword('')
    setAgeConfirmed(false)
    setShowPassword(false)
    setVerificationEmail('')
    setVerificationCode('')
    auth.reset()
    verify.reset()
  }

  const enterAuth = (nextMode: 'login' | 'register') => {
    window.sessionStorage.setItem('mosaic:intro:seen', '1')
    setMode(nextMode)
    setShowIntro(false)
  }

  const errorMessage = verify.error?.message ?? auth.error?.message
  const showCreateAccountPrompt = mode === 'login' && auth.error?.message === 'Email or password is incorrect.'
  const canSubmit = Boolean(email.trim()) && password.length >= 6 && (mode === 'login' || (name.trim().length >= 2 && ageConfirmed))

  if (showIntro) return <WelcomeIntro onContinue={enterAuth} />

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="auth-brand"><BrandMark /> Mosaic</div>
        <div>
          <span className="eyebrow">SAVE · ORGANIZE · SHARE</span>
          <h1>Keep track of what you find.</h1>
          <p>Save images, build collections, and share them when you want to.</p>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mode-switch" aria-label="Account action">
            <button type="button" className={mode === 'login' ? 'active' : ''} aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>Sign in</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} aria-pressed={mode === 'register'} onClick={() => switchMode('register')}>Create account</button>
          </div>
          <span className="eyebrow">{verificationEmail ? 'CHECK YOUR EMAIL' : mode === 'login' ? 'WELCOME BACK' : 'MAKE A SPACE'}</span>
          <h2>{verificationEmail ? 'Enter your code.' : mode === 'login' ? 'Pick up where you left off.' : 'Start collecting.'}</h2>
          <p>{verificationEmail ? `We sent a 6-digit code to ${verificationEmail}. It expires in 10 minutes.` : mode === 'login' ? 'Sign in to your collections and shared boards.' : 'Create an account to save and collaborate.'}</p>

          {verificationEmail ? (
            <form className="auth-form" onSubmit={(event) => { event.preventDefault(); if (/^\d{6}$/.test(verificationCode) && !verify.isPending) verify.mutate() }}>
              <label className="field-label" htmlFor="auth-code">Verification code<input id="auth-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={verificationCode} onChange={(event) => { setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6)); verify.reset() }} placeholder="000000" /></label>
              {errorMessage && <div className="auth-inline-error" role="alert">{errorMessage}</div>}
              <button type="submit" className="primary-button full auth-submit" disabled={verify.isPending || !/^\d{6}$/.test(verificationCode)}>{verify.isPending ? 'Checking…' : 'Verify & create account'} <ArrowRight size={16} /></button>
              <div className="auth-code-actions"><button type="button" className="secondary-button auth-code-button" disabled={auth.isPending} onClick={() => auth.mutate()}>{auth.isPending ? 'Sending…' : 'Send a new code'}</button><button type="button" className="secondary-button auth-code-button" onClick={() => { setVerificationEmail(''); setVerificationCode(''); verify.reset(); auth.reset() }}>Use a different email</button></div>
            </form>
          ) : <form className="auth-form" onSubmit={(event) => { event.preventDefault(); if (canSubmit && !auth.isPending) auth.mutate() }}>
            {mode === 'register' && (
              <label className="field-label" htmlFor="auth-name">Name<input disabled={auth.isPending} id="auth-name" name="name" maxLength={80} autoFocus autoComplete="name" value={name} onChange={(event) => { setName(event.target.value); auth.reset() }} placeholder="Your name" /></label>
            )}
            <label className="field-label" htmlFor="auth-email">Email<input disabled={auth.isPending} id="auth-email" name="email" maxLength={160} autoFocus={mode === 'login'} autoComplete="email" inputMode="email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); auth.reset() }} placeholder="you@gmail.com" /></label>
            <div className="field-label auth-password-label">
              <label htmlFor="auth-password">Password</label>
              <span className="auth-password-field">
                <input disabled={auth.isPending} id="auth-password" name="password" maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => { setPassword(event.target.value); auth.reset() }} placeholder={mode === 'login' ? 'Your password' : 'At least 6 characters'} />
                <button type="button" className="auth-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </span>
            </div>

            {mode === 'register' && <ConsentCheckbox checked={ageConfirmed} onChange={setAgeConfirmed}>I confirm I am at least 13 years old.</ConsentCheckbox>}

            {errorMessage && <div className="auth-inline-error" role="alert">{errorMessage}</div>}
            {showCreateAccountPrompt && (
              <div className="auth-account-hint">
                <span>Don&apos;t have an account?</span>
                <button type="button" className="text-button" onClick={() => switchMode('register')}>Create one</button>
              </div>
            )}

            <button type="submit" className="primary-button full auth-submit" disabled={auth.isPending || !canSubmit}>
              {auth.isPending ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16} />
            </button>
          </form>}

          <p className="auth-legal">By using Mosaic, you acknowledge how this educational deployment handles account and content data. <Link to="/privacy">Read the Privacy Policy</Link>.</p>
        </div>
      </section>
    </main>
  )
}
