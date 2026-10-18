const TOKEN_KEY = 'computer-lending-token'
const USER_KEY = 'computer-lending-user'

export function loadSession() {
  const token = localStorage.getItem(TOKEN_KEY)
  const userRaw = localStorage.getItem(USER_KEY)
  if (!token || !userRaw) return null
  return { token, ...JSON.parse(userRaw) }
}

export function saveSession(auth) {
  localStorage.setItem(TOKEN_KEY, auth.token)
  localStorage.setItem(USER_KEY, JSON.stringify({ email: auth.email, role: auth.role }))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const baseUrl = import.meta.env.VITE_API_URL
  if (!baseUrl) {
    throw new ApiError(0, 'חסרה כתובת השרת. הגדירי VITE_API_URL בקובץ הסביבה.')
  }

  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new ApiError(response.status, data?.message || 'הבקשה נכשלה.')
  }

  return data
}
