// Cloud sync for the annotations store. Talks to the Cloudflare Pages
// Function at /api/store (see functions/api/store.js). When the endpoint
// isn't there — plain vite dev, static-only hosting — every call fails soft
// and the app keeps working from localStorage alone.
const ENDPOINT = '/api/store'

let timer = null
let pending = null

export async function fetchRemote() {
  try {
    const r = await fetch(ENDPOINT, { headers: { accept: 'application/json' } })
    if (!r.ok) return { ok: false, data: null }
    // vite dev serves index.html for unknown paths; .json() throwing lands
    // in the catch and correctly reports "no sync here"
    return { ok: true, data: await r.json() }
  } catch {
    return { ok: false, data: null }
  }
}

export function pushRemote(store) {
  pending = JSON.stringify(store)
  clearTimeout(timer)
  timer = setTimeout(flush, 600)
}

async function flush() {
  if (pending == null) return
  const body = pending
  pending = null
  try {
    await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
    })
  } catch {
    // network hiccup — keep the payload so the next push retries it,
    // unless a newer one already replaced it
    if (pending == null) pending = body
  }
}

// Last-chance flush when the tab is backgrounded or closed mid-debounce.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pending != null) {
      clearTimeout(timer)
      navigator.sendBeacon(ENDPOINT, new Blob([pending], { type: 'application/json' }))
      pending = null
    }
  })
}
