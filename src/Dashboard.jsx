import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from './api'

const PAGE_SIZE = 6
const COMPUTER_STATUS = {
  Available: 'פנוי',
  Loaned: 'מושאל',
  InMaintenance: 'בתחזוקה',
}
const LOAN_STATUS = { Active: 'פעילה', Returned: 'הוחזרה' }

function defaultDueDate() {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  return date.toISOString().slice(0, 10)
}

function queryString(values) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) params.set(key, value)
  })
  return params.toString()
}

function dateText(value) {
  return value ? new Date(value).toLocaleDateString('he-IL') : '—'
}

function Notice({ notice, clear }) {
  if (!notice) return null
  return (
    <div className={`notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
      <span>{notice.text}</span>
      <button type="button" className="link" onClick={clear}>סגירה</button>
    </div>
  )
}

function Pager({ result, page, setPage }) {
  if (!result) return null
  const pages = Math.max(1, Math.ceil(result.totalCount / result.pageSize))
  return (
    <nav className="pager" aria-label="עמודים">
      <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>הקודם</button>
      <span>עמוד {page} מתוך {pages} · {result.totalCount} תוצאות</span>
      <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>הבא</button>
    </nav>
  )
}

export default function Dashboard({ session, onUnauthorized }) {
  const isAdmin = session.role === 'Admin'
  const tabs = isAdmin
    ? [['computers', 'מחשבים'], ['loans', 'כל ההלוואות'], ['tags', 'תגיות']]
    : [['computers', 'מחשבים להשאלה'], ['loans', 'ההלוואות שלי']]
  const [tab, setTab] = useState('computers')

  return (
    <>
      <nav className="tabs" aria-label="ניווט ראשי">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'computers' && (
        <Computers token={session.token} isAdmin={isAdmin} onUnauthorized={onUnauthorized} />
      )}
      {tab === 'loans' && (
        <Loans token={session.token} isAdmin={isAdmin} onUnauthorized={onUnauthorized} />
      )}
      {tab === 'tags' && isAdmin && (
        <Tags token={session.token} onUnauthorized={onUnauthorized} />
      )}
    </>
  )
}

function useRequest(token, onUnauthorized) {
  const [notice, setNotice] = useState(null)

  const request = useCallback(async (path, options = {}) => {
    try {
      return await api(path, { ...options, token })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized()
        throw error
      }
      setNotice({
        type: error instanceof ApiError && error.status === 409 ? 'conflict' : 'error',
        text: error instanceof ApiError ? error.message : 'לא ניתן להתחבר לשרת.',
      })
      throw error
    }
  }, [token, onUnauthorized])

  return { request, notice, setNotice }
}

function Computers({ token, isAdmin, onUnauthorized }) {
  const { request, notice, setNotice } = useRequest(token, onUnauthorized)
  const [result, setResult] = useState(null)
  const [tags, setTags] = useState([])
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ search: '', status: '', tagId: '', sortBy: 'Name', desc: false })
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [dueDate, setDueDate] = useState(defaultDueDate)
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const [pendingId, setPendingId] = useState(null)

  const load = useCallback(async () => {
    const query = queryString({ ...filters, page, pageSize: PAGE_SIZE })
    try {
      setResult(await request(`/api/computers?${query}`))
    } catch {
      // The request helper displays the failure.
    }
  }, [filters, page, request])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Load server data when query inputs change.
    load()
  }, [load])

  useEffect(() => {
    request('/api/tags').then(setTags).catch(() => {})
  }, [request])

  async function view(computer) {
    setPendingId(computer.id)
    try {
      setSelected(await request(`/api/computers/${computer.id}`))
    } catch {
      // The request helper displays the failure.
    } finally {
      setPendingId(null)
    }
  }

  async function borrow(computer) {
    setPendingId(computer.id)
    try {
      await request('/api/loans', {
        method: 'POST',
        body: {
          computerId: computer.id,
          dueAtUtc: new Date(`${dueDate}T12:00:00`).toISOString(),
        },
      })
      setNotice({ type: 'success', text: `${computer.name} הושאל בהצלחה.` })
      await load()
    } catch {
      await load()
    } finally {
      setPendingId(null)
    }
  }

  async function remove(computer) {
    if (!window.confirm(`למחוק את ${computer.name}?`)) return
    setPendingId(computer.id)
    try {
      await request(`/api/computers/${computer.id}`, { method: 'DELETE' })
      setNotice({ type: 'success', text: 'המחשב נמחק.' })
      setSelected(null)
      await load()
    } catch {
      // The request helper displays the failure.
    } finally {
      setPendingId(null)
    }
  }

  function updateFilter(name, value) {
    setPage(1)
    setFilters((current) => ({ ...current, [name]: value }))
  }

  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>{isAdmin ? 'ניהול מחשבים' : 'מחשבים זמינים'}</h2>
          <p className="hint">{isAdmin ? 'יצירה, עריכה, תגיות ומחיקה.' : 'בחרי תאריך החזרה והשאלי מחשב פנוי.'}</p>
        </div>
        {isAdmin && <button type="button" onClick={() => setShowCreate(true)}>מחשב חדש</button>}
      </div>

      <Notice notice={notice} clear={() => setNotice(null)} />

      <div className="filters">
        <label>חיפוש
          <input value={filters.search} onChange={(e) => updateFilter('search', e.target.value)} placeholder="שם, מפרט או מספר נכס" />
        </label>
        <label>סטטוס
          <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
            <option value="">הכול</option>
            {Object.entries(COMPUTER_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>תגית
          <select value={filters.tagId} onChange={(e) => updateFilter('tagId', e.target.value)}>
            <option value="">הכול</option>
            {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select>
        </label>
        <label>מיון
          <select value={filters.sortBy} onChange={(e) => updateFilter('sortBy', e.target.value)}>
            <option value="Name">שם</option>
            <option value="AssetTag">מספר נכס</option>
            <option value="Status">סטטוס</option>
            <option value="CreatedAtUtc">תאריך יצירה</option>
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={filters.desc} onChange={(e) => updateFilter('desc', e.target.checked)} />
          סדר יורד
        </label>
        {!isAdmin && <label>תאריך החזרה
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} min={today} />
        </label>}
      </div>

      {!result && <p>טוענת מחשבים...</p>}
      {result?.items.length === 0 && <p className="empty">לא נמצאו מחשבים.</p>}
      <ul className="list">
        {result?.items.map((computer) => (
          <li key={computer.id} className="card computer">
            <div>
              <h3>{computer.name}</h3>
              <p className="meta">{computer.assetTag} · {computer.specs || 'ללא מפרט'}</p>
              <p className={`status status-${computer.status}`}>{COMPUTER_STATUS[computer.status] ?? computer.status}</p>
              <p className="tags">{computer.tags.map((tag) => tag.name).join(' · ') || 'ללא תגיות'}</p>
            </div>
            <div className="actions">
              <button type="button" className="secondary" onClick={() => view(computer)} disabled={pendingId === computer.id}>פרטים</button>
              {isAdmin ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing(computer)}
                    disabled={computer.status === 'Loaned'}
                    title={computer.status === 'Loaned' ? 'יש להחזיר את המחשב לפני עריכה' : undefined}
                  >
                    עריכה
                  </button>
                  <button type="button" className="danger" onClick={() => remove(computer)} disabled={pendingId === computer.id}>מחיקה</button>
                </>
              ) : (
                <button type="button" disabled={computer.status !== 'Available' || pendingId === computer.id} onClick={() => borrow(computer)}>
                  {pendingId === computer.id ? 'משאילה...' : 'השאילי'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Pager result={result} page={page} setPage={setPage} />

      {selected && (
        <DetailPanel title="פרטי מחשב" close={() => setSelected(null)}>
          <p><strong>{selected.name}</strong> ({selected.assetTag})</p>
          <p>{selected.specs || 'ללא מפרט'}</p>
          <p>סטטוס: {COMPUTER_STATUS[selected.status] ?? selected.status}</p>
          <p>תגיות: {selected.tags.map((tag) => tag.name).join(', ') || 'ללא'}</p>
        </DetailPanel>
      )}
      {showCreate && (
        <ComputerForm
          request={request}
          close={() => setShowCreate(false)}
          saved={() => {
            setShowCreate(false)
            setNotice({ type: 'success', text: 'המחשב נוצר.' })
            load()
          }}
        />
      )}
      {editing && (
        <ComputerForm
          computer={editing}
          tags={tags}
          request={request}
          close={() => setEditing(null)}
          saved={() => {
            setEditing(null)
            setNotice({ type: 'success', text: 'המחשב עודכן.' })
            load()
          }}
        />
      )}
    </section>
  )
}

function DetailPanel({ title, close, children }) {
  return (
    <aside className="card detail-panel">
      <div className="section-heading">
        <h2>{title}</h2>
        <button type="button" className="secondary" onClick={close}>סגירה</button>
      </div>
      {children}
    </aside>
  )
}

function ComputerForm({ computer, tags = [], request, close, saved }) {
  const isEdit = Boolean(computer)
  const [assetTag, setAssetTag] = useState(computer?.assetTag ?? '')
  const [name, setName] = useState(computer?.name ?? '')
  const [specs, setSpecs] = useState(computer?.specs ?? '')
  const [status, setStatus] = useState(computer?.status ?? 'Available')
  const [tagIds, setTagIds] = useState(computer?.tags.map((tag) => tag.id) ?? [])
  const [pending, setPending] = useState(false)

  function toggleTag(id) {
    setTagIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  async function submit(event) {
    event.preventDefault()
    setPending(true)
    try {
      if (isEdit) {
        await request(`/api/computers/${computer.id}`, {
          method: 'PUT',
          body: { name, specs: specs || null, status },
        })
        await request(`/api/computers/${computer.id}/tags`, {
          method: 'PUT',
          body: { tagIds },
        })
      } else {
        await request('/api/computers', {
          method: 'POST',
          body: { assetTag, name, specs: specs || null },
        })
      }
      saved()
    } catch {
      // The request helper displays the failure.
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="card editor" onSubmit={submit}>
      <div className="section-heading">
        <h2>{isEdit ? 'עריכת מחשב' : 'מחשב חדש'}</h2>
        <button type="button" className="secondary" onClick={close}>ביטול</button>
      </div>
      {!isEdit && <label>מספר נכס
        <input value={assetTag} onChange={(e) => setAssetTag(e.target.value)} required maxLength={50} />
      </label>}
      <label>שם
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
      </label>
      <label>מפרט
        <textarea value={specs} onChange={(e) => setSpecs(e.target.value)} maxLength={500} />
      </label>
      {isEdit && (
        <>
          <label>סטטוס
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="Available">פנוי</option>
              <option value="InMaintenance">בתחזוקה</option>
              {status === 'Loaned' && <option value="Loaned">מושאל</option>}
            </select>
          </label>
          <fieldset>
            <legend>תגיות</legend>
            <div className="checks">
              {tags.map((tag) => (
                <label key={tag.id} className="checkbox">
                  <input type="checkbox" checked={tagIds.includes(tag.id)} onChange={() => toggleTag(tag.id)} />
                  {tag.name}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
      <button type="submit" disabled={pending}>{pending ? 'שומרת...' : 'שמירה'}</button>
    </form>
  )
}

function Loans({ token, isAdmin, onUnauthorized }) {
  const { request, notice, setNotice } = useRequest(token, onUnauthorized)
  const [result, setResult] = useState(null)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ status: '', computerId: '', userId: '' })
  const [selected, setSelected] = useState(null)
  const [pendingId, setPendingId] = useState(null)

  const load = useCallback(async () => {
    const query = queryString({
      ...filters,
      userId: isAdmin ? filters.userId : '',
      page,
      pageSize: PAGE_SIZE,
    })
    try {
      setResult(await request(`/api/loans?${query}`))
    } catch {
      // The request helper displays the failure.
    }
  }, [filters, isAdmin, page, request])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Load server data when query inputs change.
    load()
  }, [load])

  function updateFilter(name, value) {
    setPage(1)
    setFilters((current) => ({ ...current, [name]: value }))
  }

  async function view(loan) {
    setPendingId(loan.id)
    try {
      setSelected(await request(`/api/loans/${loan.id}`))
    } catch {
      // The request helper displays the failure.
    } finally {
      setPendingId(null)
    }
  }

  async function returnLoan(loan) {
    if (!window.confirm(`לסמן את ${loan.computerName} כמוחזר?`)) return
    setPendingId(loan.id)
    try {
      const updated = await request(`/api/loans/${loan.id}`, {
        method: 'PATCH',
        body: { status: 'Returned' },
      })
      setNotice({ type: 'success', text: 'המחשב הוחזר בהצלחה.' })
      setSelected(updated)
      await load()
    } catch {
      // The request helper displays the failure.
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>{isAdmin ? 'כל ההלוואות' : 'ההלוואות שלי'}</h2>
          <p className="hint">{isAdmin ? 'מעקב והחזרה בשם המשתמשים.' : 'מעקב אחר הלוואות פעילות והיסטוריה.'}</p>
        </div>
      </div>
      <Notice notice={notice} clear={() => setNotice(null)} />
      <div className="filters">
        <label>סטטוס
          <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
            <option value="">הכול</option>
            <option value="Active">פעילות</option>
            <option value="Returned">הוחזרו</option>
          </select>
        </label>
        <label>מזהה מחשב
          <input type="number" min="1" value={filters.computerId} onChange={(e) => updateFilter('computerId', e.target.value)} />
        </label>
        {isAdmin && <label>מזהה משתמש
          <input type="number" min="1" value={filters.userId} onChange={(e) => updateFilter('userId', e.target.value)} />
        </label>}
      </div>
      {!result && <p>טוענת הלוואות...</p>}
      {result?.items.length === 0 && <p className="empty">לא נמצאו הלוואות.</p>}
      <ul className="list">
        {result?.items.map((loan) => (
          <li key={loan.id} className="card loan">
            <div>
              <h3>{loan.computerName}</h3>
              <p className="meta">{loan.assetTag}{isAdmin ? ` · ${loan.userName} (#${loan.userId})` : ''}</p>
              <p>מ־{dateText(loan.loanedAtUtc)} עד {dateText(loan.dueAtUtc)}</p>
              <p className={`status loan-${loan.status}`}>{LOAN_STATUS[loan.status] ?? loan.status}</p>
            </div>
            <div className="actions">
              <button type="button" className="secondary" onClick={() => view(loan)} disabled={pendingId === loan.id}>פרטים</button>
              {loan.status === 'Active' && (
                <button type="button" onClick={() => returnLoan(loan)} disabled={pendingId === loan.id}>החזרה</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Pager result={result} page={page} setPage={setPage} />
      {selected && (
        <DetailPanel title={`הלוואה #${selected.id}`} close={() => setSelected(null)}>
          <p><strong>{selected.computerName}</strong> ({selected.assetTag})</p>
          <p>שואלת: {selected.userName} · תאריך יעד: {dateText(selected.dueAtUtc)}</p>
          <p>סטטוס: {LOAN_STATUS[selected.status] ?? selected.status}</p>
          {selected.status === 'Active' && <button type="button" onClick={() => returnLoan(selected)}>סימון כהוחזר</button>}
        </DetailPanel>
      )}
    </section>
  )
}

function Tags({ token, onUnauthorized }) {
  const { request, notice, setNotice } = useRequest(token, onUnauthorized)
  const [tags, setTags] = useState([])
  const [name, setName] = useState('')
  const [pendingId, setPendingId] = useState(null)

  const load = useCallback(async () => {
    try {
      setTags(await request('/api/tags'))
    } catch {
      // The request helper displays the failure.
    }
  }, [request])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Load tags when this admin view opens.
    load()
  }, [load])

  async function create(event) {
    event.preventDefault()
    try {
      await request('/api/tags', { method: 'POST', body: { name } })
      setName('')
      setNotice({ type: 'success', text: 'התגית נוצרה.' })
      await load()
    } catch {
      // The request helper displays the failure.
    }
  }

  async function remove(tag) {
    if (!window.confirm(`למחוק את התגית "${tag.name}"?`)) return
    setPendingId(tag.id)
    try {
      await request(`/api/tags/${tag.id}`, { method: 'DELETE' })
      setNotice({ type: 'success', text: 'התגית נמחקה.' })
      await load()
    } catch {
      // The request helper displays the failure.
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>ניהול תגיות</h2>
          <p className="hint">התגיות משמשות לסינון ושיוך מחשבים.</p>
        </div>
      </div>
      <Notice notice={notice} clear={() => setNotice(null)} />
      <form className="inline-form card" onSubmit={create}>
        <label>שם תגית
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} />
        </label>
        <button type="submit">יצירה</button>
      </form>
      <ul className="tag-list">
        {tags.map((tag) => (
          <li key={tag.id} className="card">
            <span>{tag.name}</span>
            <button type="button" className="danger" onClick={() => remove(tag)} disabled={pendingId === tag.id}>מחיקה</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
