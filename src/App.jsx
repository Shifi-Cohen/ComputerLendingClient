import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, clearSession, loadSession, saveSession } from './api'
import './App.css'

const PAGE_SIZE = 4

const STATUS_LABEL = {
  Available: 'פנוי',
  Loaned: 'מושאל',
  InMaintenance: 'בתחזוקה',
}

function defaultDueDate() {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export default function App() {
  const [session, setSession] = useState(loadSession)
  const [screen, setScreen] = useState(session ? 'computers' : 'login')

  function enter(auth) {
    saveSession(auth)
    setSession({ token: auth.token, email: auth.email, role: auth.role })
    setScreen('computers')
  }

  const logout = useCallback(() => {
    clearSession()
    setSession(null)
    setScreen('login')
  }, [])

  return (
    <main className="app">
      <header className="top">
        <div>
          <p className="eyebrow">סמינר</p>
          <h1>השאלת מחשבים</h1>
        </div>
        {session && (
          <div className="who">
            <span>{session.email}</span>
            <span className="role">{session.role}</span>
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
      {session && <Computers token={session.token} onUnauthorized={logout} />}
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

function Computers({ token, onUnauthorized }) {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [dueDate, setDueDate] = useState(defaultDueDate)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState('')
  const [success, setSuccess] = useState('')
  const [pendingId, setPendingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    api(`/api/computers?page=${page}&pageSize=${PAGE_SIZE}`, { token })
      .then((data) => {
        if (!cancelled) setResult(data)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) onUnauthorized()
        else setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [page, token, onUnauthorized])

  const totalPages = result ? Math.max(1, Math.ceil(result.totalCount / result.pageSize)) : 1

  async function borrow(computer) {
    setError('')
    setConflict('')
    setSuccess('')
    setPendingId(computer.id)
    try {
      await api('/api/loans', {
        method: 'POST',
        token,
        body: {
          computerId: computer.id,
          dueAtUtc: new Date(`${dueDate}T12:00:00`).toISOString(),
        },
      })
      setSuccess(`${computer.name} הושאל.`)
      setResult(await api(`/api/computers?page=${page}&pageSize=${PAGE_SIZE}`, { token }))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      if (err instanceof ApiError && err.status === 409) {
        setConflict(err.message)
        setResult(await api(`/api/computers?page=${page}&pageSize=${PAGE_SIZE}`, { token }).catch(() => result))
        return
      }
      setError(err instanceof ApiError ? err.message : 'ההשאלה נכשלה.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section>
      <div className="toolbar">
        <label>
          תאריך החזרה
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </label>
        <p className="hint">התאריך נשלח לשרת ב-UTC, עם Z.</p>
      </div>

      {conflict && (
        <p className="conflict" role="alert">
          <strong>המחשב נתפס.</strong> {conflict}
        </p>
      )}
      {success && <p className="success" role="status">{success}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {!result && !error && <p>טוענת מחשבים...</p>}

      <ul className="list">
        {result?.items.map((computer) => (
          <li key={computer.id} className="card computer">
            <div>
              <h2>{computer.name}</h2>
              <p className="meta">{computer.assetTag} · {computer.specs}</p>
              <p className={`status status-${computer.status}`}>{STATUS_LABEL[computer.status] ?? computer.status}</p>
              {computer.tags.length > 0 && (
                <p className="tags">{computer.tags.map((tag) => tag.name).join(' · ')}</p>
              )}
            </div>
            <button
              type="button"
              disabled={computer.status !== 'Available' || pendingId === computer.id}
              onClick={() => borrow(computer)}
            >
              {pendingId === computer.id ? 'משאילה...' : 'השאילי'}
            </button>
          </li>
        ))}
      </ul>

      {result && (
        <nav className="pager" aria-label="עמודים">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>הקודם</button>
          <span>עמוד {page} מתוך {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>הבא</button>
        </nav>
      )}
    </section>
  )
}
