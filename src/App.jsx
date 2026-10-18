import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, clearSession, loadSession, saveSession } from './api'
import Dashboard from './Dashboard'
import './App.css'

export default function App() {
  const [session, setSession] = useState(loadSession)
  const [screen, setScreen] = useState(session ? 'computers' : 'login')
  const [checkingSession, setCheckingSession] = useState(Boolean(session))

  function enter(auth) {
    saveSession(auth)
    setSession({ token: auth.token, email: auth.email, role: auth.role })
    setCheckingSession(true)
    setScreen('computers')
  }

  const logout = useCallback(() => {
    clearSession()
    setSession(null)
    setCheckingSession(false)
    setScreen('login')
  }, [])

  const sessionToken = session?.token
  useEffect(() => {
    if (!sessionToken) return
    let cancelled = false
    api('/api/auth/me', { token: sessionToken })
      .then((user) => {
        if (cancelled) return
        setSession((current) => {
          const verified = { ...current, email: user.email, role: user.role }
          saveSession(verified)
          return verified
        })
      })
      .catch((error) => {
        if (!cancelled && error instanceof ApiError && error.status === 401) logout()
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionToken, logout])

  return (
    <main className="app" dir="rtl">
      <header className="top">
        <div>
          <p className="eyebrow">Computer Lending</p>
          <h1>השאלת מחשבים</h1>
        </div>
        {session && (
          <div className="who">
            <span>{session.email}</span>
            <span className="role">{session.role === 'Admin' ? 'מנהלת' : 'משתמשת'}</span>
            <button type="button" onClick={logout}>יציאה</button>
          </div>
        )}
      </header>

      {!session && screen === 'login' && (
        <AuthForm
          mode="login"
          onSuccess={enter}
          onSwitch={() => setScreen('register')}
        />
      )}
      {!session && screen === 'register' && (
        <AuthForm
          mode="register"
          onSuccess={enter}
          onSwitch={() => setScreen('login')}
        />
      )}
      {session && checkingSession && <p>מאמתת את ההתחברות...</p>}
      {session && !checkingSession && <Dashboard session={session} onUnauthorized={logout} />}
    </main>
  )
}

function AuthForm({ mode, onSuccess, onSwitch }) {
  const isLogin = mode === 'login'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      const path = isLogin ? '/api/auth/login' : '/api/auth/register'
      const body = isLogin ? { email, password } : { fullName, email, password }
      onSuccess(await api(path, { method: 'POST', body }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'לא ניתן להתחבר לשרת.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="card auth" onSubmit={onSubmit}>
      <h2>{isLogin ? 'התחברות' : 'הרשמה'}</h2>
      {!isLogin && (
        <label>
          שם מלא
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} />
        </label>
      )}
      <label>
        אימייל
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        סיסמה
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={isLogin ? undefined : 8}
        />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={pending}>{pending ? 'שולחת...' : isLogin ? 'כניסה' : 'יצירת חשבון'}</button>
      <button type="button" className="link" onClick={onSwitch}>
        {isLogin ? 'אין לך חשבון? להרשמה' : 'יש לך חשבון? להתחברות'}
      </button>
    </form>
  )
}
