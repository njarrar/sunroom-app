import { useEffect, useMemo, useRef, useState } from 'react'
// Your bookmarks (src/data/bookmarks.json, made by scripts/categorize.js) stay out of git.
// Without them the app shows the small sample, so a fresh clone still runs.
const dataFiles = import.meta.glob('./data/bookmarks*.json', { eager: true, import: 'default' })
const raw = dataFiles['./data/bookmarks.json'] ?? dataFiles['./data/bookmarks.sample.json'] ?? []
import { processImported } from './lib/classify.js'
import { loadImported, saveImported, clearImported } from './lib/importStore.js'
import { fetchRemote, pushRemote } from './lib/sync.js'
import scraperSrc from '../scripts/export_bookmarks.js?raw'

const PAGE_SIZE = 80
const AUTO_READ_ON_OPEN = true
const STORE_KEY = 'sunroom-v1'
const UNSORTED = 'Uncategorized'

// hue per curated category (scripts/categorize.js), null = neutral
const HUES = {
  'Tech & AI': 265,
  'News & Politics': 0,
  'Entertainment & Gaming': 90,
  'Books & Learning': 120,
  'Society & Life': 350,
  'Business & Finance': 230,
  'Humor & Memes': 55,
  'Culture & History': 35,
  'Celebs & Photos': 305,
  'Tools & Resources': 195,
  'Design & Art': 320,
  'Fashion & Style': 285,
  'Health & Fitness': 25,
  'Science & Space': 185,
  'Food & Travel': 140,
  'Religion & Spirituality': 160,
  Sports: 110,
  [UNSORTED]: null,
}

function enrich(t) {
  const d = new Date(t.time)
  const parts = (t.name || t.handle || '?').trim().split(/\s+/)
  const topic = HUES[t.category] === undefined ? UNSORTED : t.category
  return {
    ...t,
    topic,
    hue: HUES[topic],
    initials: ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase(),
    rtl: /[؀-ۿ]/.test(t.text || ''),
    year: d.getFullYear(),
    dateStr: d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }),
    dateFull:
      d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ', ' +
      d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }),
    low: ' ' + ((t.text || '') + ' ' + (t.name || '') + ' ' + (t.handle || '')).toLowerCase() + ' ',
  }
}

const BASE = raw.map(enrich).sort((a, b) => (a.time < b.time ? 1 : -1))
const BASE_IDS = new Set(BASE.map(t => t.id))

function hues(hue) {
  if (hue === null)
    return { chipBg: '#F0EBE0', chipColor: '#8A8068', avBg: '#EFE9DC', avColor: '#8A8068', bar: '#D9CFB8' }
  return {
    chipBg: `oklch(0.93 0.045 ${hue})`,
    chipColor: `oklch(0.42 0.1 ${hue})`,
    avBg: `oklch(0.87 0.06 ${hue})`,
    avColor: `oklch(0.38 0.1 ${hue})`,
    bar: `oklch(0.75 0.1 ${hue})`,
  }
}

function tagStyle(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return { bg: `oklch(0.9 0.06 ${h})`, color: `oklch(0.4 0.11 ${h})` }
}

function download(name, mime, content) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type: mime }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

function loadStore() {
  const empty = { favs: {}, read: {}, notes: {}, tags: {}, scraps: [], trash: {} }
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY))
    if (s && s.favs) return { ...empty, ...s }
  } catch {
    /* corrupt store — start fresh */
  }
  return empty
}

// local copy first, remote URL as fallback
function TweetImg({ media, style }) {
  const [failed, setFailed] = useState(false)
  const src = !failed && media.local ? media.local : media.url
  return <img src={src} loading="lazy" style={style} onError={() => setFailed(true)} alt="" />
}

const font = (spec, mono) =>
  `${spec} '${mono ? 'IBM Plex Mono' : 'Space Grotesk'}', ${mono ? 'monospace' : 'sans-serif'}`

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = e => setMatches(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export default function App() {
  const [ui, setUi] = useState({
    query: '',
    view: 'all',
    topic: null,
    author: null,
    dateF: 'all',
    mediaOnly: false,
    sort: 'new',
    visible: PAGE_SIZE,
    selectedId: null,
    tagF: null,
    tagInput: '',
    tagEditorOpen: false,
    scrapText: '',
    scrapUrl: '',
  })
  const [store, setStore] = useState(loadStore)
  const [extras, setExtras] = useState([])
  const [importMsg, setImportMsg] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [syncOn, setSyncOn] = useState(null) // null = checking, true/false = result
  const isMobile = useMediaQuery('(max-width: 860px)')
  const [navOpen, setNavOpen] = useState(false) // mobile: sidebar drawer
  const [sideHidden, setSideHidden] = useState(false) // desktop: sidebar collapsed
  const fileRef = useRef(null)

  useEffect(() => {
    loadImported().then(v => {
      if (Array.isArray(v) && v.length) setExtras(v)
    })
  }, [])

  // On load, reconcile this device with the cloud copy: whichever side has
  // the newer updatedAt wins whole (per-entry merging would resurrect
  // deletions). Single user, so simultaneous edits are a non-issue.
  useEffect(() => {
    fetchRemote().then(({ ok, data: remote }) => {
      setSyncOn(ok)
      if (!ok) return
      setStore(local => {
        const localAt = local.updatedAt || 0
        const remoteAt = (remote && remote.updatedAt) || 0
        if (remote && remoteAt > localAt) {
          const merged = { favs: {}, read: {}, notes: {}, tags: {}, scraps: [], trash: {}, ...remote }
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(merged))
          } catch {
            /* storage full/unavailable */
          }
          return merged
        }
        if (localAt > remoteAt) pushRemote(local)
        return local
      })
    })
  }, [])

  // Bundled data wins on id collisions (it carries the curated categories and
  // verified local media); imported extras cover everything newer.
  const data = useMemo(() => {
    if (!extras.length) return BASE
    const merged = [...extras.filter(e => !BASE_IDS.has(e.id)).map(enrich), ...BASE]
    merged.sort((a, b) => (a.time < b.time ? 1 : -1))
    return merged
  }, [extras])

  const handleUpload = async file => {
    try {
      const arr = JSON.parse(await file.text())
      if (!Array.isArray(arr)) throw new Error('not an array')
      const next = new Map(extras.map(e => [e.id, e]))
      let added = 0
      let known = 0
      for (const r of arr) {
        if (!r || r.id == null) continue
        const rec = processImported(r)
        if (BASE_IDS.has(rec.id)) {
          known++
          continue
        }
        if (next.has(rec.id)) known++
        else added++
        next.set(rec.id, rec)
      }
      const list = [...next.values()]
      setExtras(list)
      saveImported(list).catch(() => {})
      setImportMsg(`+${added.toLocaleString()} new · ${known.toLocaleString()} already here`)
    } catch {
      setImportMsg('Not a bookmarks JSON file')
    }
  }

  const removeImported = () => {
    if (!window.confirm(`Remove all ${extras.length} imported bookmarks? (Your notes/tags stay.)`)) return
    clearImported().catch(() => {})
    setExtras([])
    setImportMsg('')
  }

  const set = patch => setUi(u => ({ ...u, ...patch }))
  const setFilter = patch => setUi(u => ({ ...u, ...patch, visible: PAGE_SIZE }))
  const save = st => {
    const stamped = { ...st, updatedAt: Date.now() }
    setStore(stamped)
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(stamped))
    } catch {
      /* storage full/unavailable — keep in-memory state */
    }
    if (syncOn) pushRemote(stamped)
  }
  const toggleMap = (key, id) => {
    const m = { ...store[key] }
    if (m[id]) delete m[id]
    else m[id] = 1
    save({ ...store, [key]: m })
  }
  const addTag = name => {
    name = (name || '').trim()
    const id = ui.selectedId
    if (!name || !id) return
    const cur = store.tags[id] || []
    if (!cur.includes(name)) save({ ...store, tags: { ...store.tags, [id]: [...cur, name] } })
    set({ tagInput: '' })
  }
  const selectTweet = id => {
    if (AUTO_READ_ON_OPEN && !store.read[id]) save({ ...store, read: { ...store.read, [id]: 1 } })
    set({ selectedId: id })
  }

  const { query, view, topic, author, dateF, mediaOnly, sort, visible, selectedId, tagF } = ui

  // everything except trashed bookmarks — the working set for all views,
  // counts, topics, insights and exports. Trash keeps the removed ones.
  const trashMap = store.trash || {}
  const live = useMemo(() => data.filter(t => !(store.trash && store.trash[t.id])), [data, store])
  const trashCount = data.length - live.length

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const inTrash = t => !!(store.trash && store.trash[t.id])
    let out = data.filter(t => {
      if (view === 'trash' ? !inTrash(t) : inTrash(t)) return false
      if (view === 'unread' && store.read[t.id]) return false
      if (view === 'favs' && !store.favs[t.id]) return false
      if (view === 'notes' && !(store.notes[t.id] || '').trim()) return false
      if (topic && t.topic !== topic) return false
      if (author && t.handle !== author) return false
      if (tagF && !(store.tags[t.id] || []).includes(tagF)) return false
      if (mediaOnly && !(t.media && t.media.length)) return false
      if (dateF === 'older' ? t.year >= 2024 : dateF !== 'all' && String(t.year) !== dateF) return false
      for (const w of words) if (!t.low.includes(w)) return false
      return true
    })
    if (sort === 'old') out = [...out].reverse()
    return out
  }, [data, query, view, topic, author, dateF, mediaOnly, sort, tagF, store])

  const readCount = useMemo(() => live.filter(t => store.read[t.id]).length, [live, store])
  const counts = {
    all: live.length,
    unread: live.length - readCount,
    favs: live.filter(t => store.favs[t.id]).length,
    notes: live.filter(t => (store.notes[t.id] || '').trim()).length,
  }

  const topicCounts = useMemo(() => {
    const m = {}
    for (const t of live) m[t.topic] = (m[t.topic] || 0) + 1
    return m
  }, [live])
  const allTopics = useMemo(
    () =>
      Object.entries(HUES)
        .filter(([n]) => topicCounts[n])
        .sort((a, b) => topicCounts[b[0]] - topicCounts[a[0]]),
    [topicCounts],
  )

  const authorCounts = useMemo(() => {
    const m = {}
    for (const t of live) m[t.handle] = m[t.handle] ? [m[t.handle][0] + 1, t.name] : [1, t.name]
    return m
  }, [live])

  const years = useMemo(() => {
    const m = {}
    for (const t of live) m[t.year] = (m[t.year] || 0) + 1
    return m
  }, [live])

  const allTags = {}
  for (const [id, arr] of Object.entries(store.tags || {}))
    if (!trashMap[id]) for (const n of arr) allTags[n] = (allTags[n] || 0) + 1
  const tagNames = Object.keys(allTags).sort()

  const sel = selectedId ? data.find(x => x.id === selectedId) : null
  const hasFilters = !!(query || topic || author || tagF || dateF !== 'all' || mediaOnly)
  const isFeed = view !== 'insights' && view !== 'scratch'

  const exportFiltered = fmt => {
    if (fmt === 'json') {
      download(
        'bookmarks-filtered.json',
        'application/json',
        JSON.stringify(
          filtered.map(({ low: _l, hue: _h, initials: _i, rtl: _r, year: _y, dateStr: _d, dateFull: _f, ...t }) => t),
          null,
          2,
        ),
      )
    } else {
      const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'
      const rows = [['id', 'handle', 'name', 'time', 'topic', 'tags', 'text', 'url', 'note'].join(',')]
      for (const t of filtered)
        rows.push(
          [t.id, t.handle, t.name, t.time, t.topic, (store.tags[t.id] || []).join('|'), t.text, t.url, store.notes[t.id] || '']
            .map(esc)
            .join(','),
        )
      download('bookmarks-filtered.csv', 'text/csv', rows.join('\n'))
    }
  }

  const navDefs = [
    ['all', '⌂', 'Browse all', counts.all],
    ['unread', '◉', 'Unread', counts.unread],
    ['favs', '♥', 'Favorites', counts.favs],
    ['notes', '✎', 'My notes', counts.notes],
    ['scratch', '✐', 'Notebook', (store.scraps || []).length],
    ['insights', '◔', 'Insights', ''],
    ['trash', '⌫', 'Trash', trashCount],
  ]

  const toggleTrash = id => {
    toggleMap('trash', id)
    if (selectedId === id) set({ selectedId: null })
  }

  const chipBase = { bg: '#FBF8F1', color: '#5C5546', border: '#E5DCC8' }
  const chipOn = { bg: '#26221C', color: '#FFFDF8', border: '#26221C' }
  const chips = [
    { label: 'Newest', on: sort === 'new', toggle: () => setFilter({ sort: 'new' }) },
    { label: 'Oldest', on: sort === 'old', toggle: () => setFilter({ sort: 'old' }) },
    { label: '▣ Has media', on: mediaOnly, toggle: () => setFilter({ mediaOnly: !mediaOnly }) },
    ...['all', '2026', '2025', '2024', 'older'].map(dfv => ({
      label: dfv === 'all' ? 'Any date' : dfv === 'older' ? '≤ 2023' : dfv,
      on: dateF === dfv,
      toggle: () => setFilter({ dateF: dfv }),
    })),
  ].map(c => ({ label: c.label, toggle: c.toggle, ...(c.on ? chipOn : chipBase) }))
  if (author)
    chips.push({
      label: `by ${author} ✕`,
      toggle: () => setFilter({ author: null }),
      bg: 'oklch(0.93 0.045 65)',
      color: 'oklch(0.45 0.11 65)',
      border: 'oklch(0.85 0.07 65)',
    })

  const clearAll = () => setFilter({ query: '', topic: null, author: null, tagF: null, dateF: 'all', mediaOnly: false })

  const selTags = selectedId ? store.tags[selectedId] || [] : []
  const tagSuggestions = tagNames.filter(n => !selTags.includes(n))

  const yearKeys = Object.keys(years).sort()
  const shownYears = yearKeys.slice(-9)
  const earlier = yearKeys.slice(0, -9).reduce((s, y) => s + years[y], 0)
  const yearRows = (earlier ? [['pre', earlier]] : []).concat(shownYears.map(y => [String(y).slice(2), years[y]]))
  const maxY = Math.max(...yearRows.map(r => r[1]), 1)

  return (
    <div
      className="app-root"
      style={
        isMobile
          ? { display: 'flex', flexDirection: 'column', color: '#26221C', overflow: 'hidden' }
          : {
              display: 'grid',
              gridTemplateColumns: sideHidden ? 'minmax(0, 1fr) 348px' : '240px minmax(0, 1fr) 348px',
              color: '#26221C',
              overflow: 'hidden',
            }
      }
    >
      {/* ===== MOBILE TOP BAR ===== */}
      {isMobile && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            background: '#FFFDF8',
            borderBottom: '1px solid #F0E9DC',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            style={{
              cursor: 'pointer',
              background: 'none',
              border: '1.5px solid #E5DCC8',
              borderRadius: 10,
              width: 36,
              height: 36,
              font: font('600 15px/1'),
              color: '#26221C',
            }}
          >
            ☰
          </button>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: 'oklch(0.72 0.13 65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              font: font('700 13px/1'),
              color: '#fff',
            }}
          >
            ◡
          </span>
          <span style={{ font: font('700 15px/1') }}>Sunroom</span>
          <span style={{ marginLeft: 'auto', font: font('400 11px/1', true), color: '#A79C88' }}>
            {live.length.toLocaleString()}
          </span>
        </div>
      )}

      {/* ===== SIDEBAR (desktop column / mobile drawer) ===== */}
      {isMobile && navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(38,34,28,0.35)' }}
        />
      )}
      {(isMobile ? navOpen : !sideHidden) && (
      <div
        style={
          isMobile
            ? {
                position: 'fixed',
                left: 0,
                top: 0,
                bottom: 0,
                width: 292,
                zIndex: 41,
                boxShadow: '0 0 40px rgba(38,34,28,0.3)',
                background: '#FFFDF8',
                padding: '22px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                overflowY: 'auto',
              }
            : {
                borderRight: '1px solid #F0E9DC',
                background: '#FFFDF8',
                padding: '22px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                overflowY: 'auto',
              }
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: 'oklch(0.72 0.13 65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              font: font('700 16px/1'),
              color: '#fff',
            }}
          >
            ◡
          </span>
          <div>
            <div style={{ font: font('700 17px/1') }}>Sunroom</div>
            <div style={{ font: font('400 11.5px/1.4'), color: '#A79C88' }}>
              {live.length.toLocaleString()} bookmarks
            </div>
          </div>
          <span
            className="hv-ink"
            onClick={() => (isMobile ? setNavOpen(false) : setSideHidden(true))}
            title={isMobile ? 'Close menu' : 'Hide sidebar'}
            style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 17, color: '#B3A78F', padding: '4px 6px' }}
          >
            {isMobile ? '✕' : '«'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {navDefs.map(([id, icon, label, count]) => (
            <div
              key={id}
              className="hv-dim"
              onClick={() => {
                setFilter({ view: id, selectedId: id === 'insights' ? null : selectedId })
                if (isMobile) setNavOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '9px 11px',
                borderRadius: 12,
                cursor: 'pointer',
                background: view === id ? '#26221C' : 'transparent',
                color: view === id ? '#FFFDF8' : '#5C5546',
                font: font('500 13.5px/1'),
              }}
            >
              <span>{icon}</span>
              <span>{label}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.6 }}>
                {count === '' ? '' : count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        <div>
          <div
            style={{ font: font('700 11px/1'), letterSpacing: '0.1em', color: '#B3A78F', marginBottom: 10, padding: '0 4px' }}
          >
            TOPICS · AUTO-TAGGED
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {allTopics.map(([name, hue]) => {
              const h = hues(hue)
              return (
                <span
                  key={name}
                  className="hv-bright"
                  onClick={() => {
                    setFilter({ topic: topic === name ? null : name })
                    if (isMobile) setNavOpen(false)
                  }}
                  style={{
                    cursor: 'pointer',
                    font: font('500 12.5px/1'),
                    background: h.chipBg,
                    color: h.chipColor,
                    borderRadius: 999,
                    padding: '7px 11px',
                    boxShadow: topic === name ? '0 0 0 2px #26221C' : 'none',
                  }}
                >
                  {name} {topicCounts[name].toLocaleString()}
                </span>
              )
            })}
          </div>
        </div>

        {tagNames.length > 0 && (
          <div>
            <div
              style={{ font: font('700 11px/1'), letterSpacing: '0.1em', color: '#B3A78F', marginBottom: 10, padding: '0 4px' }}
            >
              MY TAGS
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {tagNames.map(n => {
                const s = tagStyle(n)
                return (
                  <span
                    key={n}
                    className="hv-bright"
                    onClick={() => {
                      setFilter({ tagF: tagF === n ? null : n })
                      if (isMobile) setNavOpen(false)
                    }}
                    style={{
                      cursor: 'pointer',
                      font: font('500 12.5px/1'),
                      background: s.bg,
                      color: s.color,
                      borderRadius: 999,
                      padding: '7px 11px',
                      boxShadow: tagF === n ? '0 0 0 2px #26221C' : 'none',
                    }}
                  >
                    ⊙ {n} {allTags[n]}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#FBF5E9', borderRadius: 14, padding: '13px 14px' }}>
            <div style={{ font: font('700 12.5px/1') }}>Reading progress</div>
            <div style={{ height: 7, borderRadius: 99, background: '#EFE4CC', marginTop: 9, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 99,
                  background: 'oklch(0.72 0.13 65)',
                  width: (live.length ? Math.round((100 * readCount) / live.length) : 0) + '%',
                }}
              />
            </div>
            <div style={{ font: font('400 11.5px/1.5'), color: '#8A8068', marginTop: 7 }}>
              {readCount.toLocaleString()} read · {(live.length - readCount).toLocaleString()} to go ✦
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button
              className="hv-border-ink"
              onClick={() => exportFiltered('json')}
              style={{
                flex: 1,
                cursor: 'pointer',
                background: 'none',
                border: '1.5px solid #E5DCC8',
                borderRadius: 10,
                padding: '9px 0',
                font: font('600 11.5px/1'),
                color: '#5C5546',
              }}
            >
              ⇩ JSON
            </button>
            <button
              className="hv-border-ink"
              onClick={() => exportFiltered('csv')}
              style={{
                flex: 1,
                cursor: 'pointer',
                background: 'none',
                border: '1.5px solid #E5DCC8',
                borderRadius: 10,
                padding: '9px 0',
                font: font('600 11.5px/1'),
                color: '#5C5546',
              }}
            >
              ⇩ CSV
            </button>
          </div>
          <div style={{ font: font('400 10.5px/1.4', true), color: '#C9BFA9', textAlign: 'center' }}>
            exports current filter
          </div>
          <div style={{ borderTop: '1px solid #F0E9DC', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', gap: 7 }}>
              <button
                className="hv-border-ink"
                onClick={() => fileRef.current && fileRef.current.click()}
                title="Upload a bookmarks_export.json (new tweets are added and auto-categorized)"
                style={{
                  flex: 1,
                  cursor: 'pointer',
                  background: 'none',
                  border: '1.5px solid #E5DCC8',
                  borderRadius: 10,
                  padding: '9px 0',
                  font: font('600 11.5px/1'),
                  color: '#5C5546',
                }}
              >
                ⇪ Import JSON
              </button>
              <button
                className="hv-border-ink"
                onClick={() => {
                  setImportOpen(true)
                  setCopied(false)
                }}
                title="How to grab your latest bookmarks from x.com"
                style={{
                  flex: 1,
                  cursor: 'pointer',
                  background: 'none',
                  border: '1.5px solid #E5DCC8',
                  borderRadius: 10,
                  padding: '9px 0',
                  font: font('600 11.5px/1'),
                  color: '#5C5546',
                }}
              >
                ⌁ From X…
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files && e.target.files[0]
                if (f) handleUpload(f)
                e.target.value = ''
              }}
            />
            {(importMsg || extras.length > 0) && (
              <div style={{ font: font('400 10.5px/1.5', true), color: '#A79C88', textAlign: 'center' }}>
                {importMsg || `${extras.length.toLocaleString()} imported`}
                {extras.length > 0 && (
                  <>
                    {' · '}
                    <span
                      className="hv-ink"
                      onClick={removeImported}
                      style={{ cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      remove
                    </span>
                  </>
                )}
              </div>
            )}
            <div
              title={
                syncOn
                  ? 'Notes, tags, favorites and read-state sync through the cloud to every device you sign in from.'
                  : 'No sync endpoint here — notes live in this browser only. Deployed on Cloudflare Pages, they sync automatically.'
              }
              style={{ font: font('400 10.5px/1.4', true), color: '#C9BFA9', textAlign: 'center' }}
            >
              {syncOn === null ? '· · ·' : syncOn ? '✦ notes synced to cloud' : '⌂ notes stored on this device'}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ===== MAIN ===== */}
      <div
        style={
          isMobile
            ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FBF8F1' }
            : {
                borderRight: '1px solid #F0E9DC',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: '#FBF8F1',
              }
        }
      >
        {isFeed && (
          <>
            <div
              style={{
                padding: isMobile ? '12px 14px 10px' : `18px 24px 12px ${sideHidden ? '70px' : '24px'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 11,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: '#FFFFFF',
                  border: '2px solid #26221C',
                  borderRadius: 14,
                  padding: '0 15px',
                  boxShadow: '3px 3px 0 #E8DFCB',
                }}
              >
                <span style={{ fontSize: 16, color: '#8A8068' }}>⌕</span>
                <input
                  value={query}
                  onChange={e => setFilter({ query: e.target.value })}
                  placeholder="Search text, author, @handle…"
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    background: 'none',
                    font: font('400 14.5px/1'),
                    color: '#26221C',
                    padding: '13px 0',
                  }}
                />
                {query && (
                  <span
                    onClick={() => setFilter({ query: '' })}
                    style={{ cursor: 'pointer', color: '#B3A78F', fontSize: 14 }}
                  >
                    ✕
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
                {chips.map(ch => (
                  <span
                    key={ch.label}
                    className="hv-bright-97"
                    onClick={ch.toggle}
                    style={{
                      cursor: 'pointer',
                      font: font('500 12px/1'),
                      borderRadius: 999,
                      padding: '7px 11px',
                      background: ch.bg,
                      color: ch.color,
                      border: `1px solid ${ch.border}`,
                    }}
                  >
                    {ch.label}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ font: font('400 12px/1', true), color: '#A79C88' }}>
                  {filtered.length.toLocaleString()} of {(view === 'trash' ? trashCount : live.length).toLocaleString()}
                  {view === 'trash' ? ' in trash' : ''} ·{' '}
                  {sort === 'new' ? 'newest first' : 'oldest first'}
                </span>
                {hasFilters && (
                  <span
                    onClick={clearAll}
                    style={{
                      cursor: 'pointer',
                      font: font('500 12px/1'),
                      color: 'oklch(0.55 0.13 65)',
                      textDecoration: 'underline',
                    }}
                  >
                    clear all
                  </span>
                )}
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: isMobile ? '4px 14px 20px' : '4px 24px 26px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {filtered.length === 0 && (
                <div style={{ padding: '70px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: 34 }}>{view === 'trash' && !hasFilters ? '⌫' : '◡̈'}</div>
                  <div style={{ font: font('600 16px/1.4'), marginTop: 10 }}>
                    {view === 'trash' && !hasFilters ? 'Trash is empty' : 'Nothing matches'}
                  </div>
                  <div style={{ font: font('400 13.5px/1.6'), color: '#A79C88', marginTop: 4 }}>
                    {view === 'trash' && !hasFilters ? (
                      <>Bookmarks you remove land here — kept forever, out of the way.</>
                    ) : (
                      <>
                        Try fewer words, or{' '}
                        <span
                          onClick={clearAll}
                          style={{ cursor: 'pointer', color: 'oklch(0.55 0.13 65)', textDecoration: 'underline' }}
                        >
                          clear the filters
                        </span>
                        .
                      </>
                    )}
                  </div>
                </div>
              )}

              {filtered.slice(0, visible).map(t => {
                const h = hues(t.hue)
                const isSel = selectedId === t.id
                const isRead = !!store.read[t.id]
                const isFav = !!store.favs[t.id]
                const note = (store.notes[t.id] || '').trim()
                const myTags = store.tags[t.id] || []
                return (
                  <div
                    key={t.id}
                    className="hv-card"
                    onClick={() => selectTweet(t.id)}
                    style={{
                      background: '#fff',
                      border: `1.5px solid ${isSel ? '#26221C' : '#EAE1CE'}`,
                      borderRadius: 16,
                      padding: '15px 17px',
                      cursor: 'pointer',
                      boxShadow: isSel ? '4px 4px 0 oklch(0.72 0.13 65)' : 'none',
                      opacity: isRead && !isSel ? 0.72 : 1,
                      direction: t.rtl ? 'rtl' : 'ltr',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 12,
                          flexShrink: 0,
                          background: h.avBg,
                          color: h.avColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          font: font('700 13px/1'),
                        }}
                      >
                        {t.initials}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            font: font('600 13.5px/1.2'),
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {t.name || t.handle}{' '}
                          <span style={{ font: font('400 12px/1'), color: '#B3A78F' }}>{isRead ? '' : '●'}</span>
                        </div>
                        <div style={{ font: font('400 12px/1.2'), color: '#B3A78F', marginTop: 2 }}>
                          {t.handle} · {t.dateStr}
                        </div>
                      </div>
                      <span
                        onClick={e => {
                          e.stopPropagation()
                          setFilter({ author: author === t.handle ? null : t.handle, topic: null })
                        }}
                        title="Filter by this author"
                        style={{
                          marginLeft: 'auto',
                          marginRight: 0,
                          cursor: 'pointer',
                          font: font('500 11.5px/1'),
                          background: h.chipBg,
                          color: h.chipColor,
                          borderRadius: 999,
                          padding: '5px 10px',
                          flexShrink: 0,
                        }}
                      >
                        {t.topic}
                      </span>
                    </div>
                    <div
                      style={{ font: font('400 14.5px/1.6'), marginTop: 10, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                    >
                      {t.text || '(no text — media only)'}
                    </div>
                    {myTags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                        {myTags.map(n => {
                          const s = tagStyle(n)
                          return (
                            <span
                              key={n}
                              style={{
                                font: font('500 11px/1'),
                                background: s.bg,
                                color: s.color,
                                borderRadius: 999,
                                padding: '5px 9px',
                              }}
                            >
                              ⊙ {n}
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {t.media && t.media.length > 0 && (
                      <div style={{ position: 'relative', marginTop: 11 }}>
                        <TweetImg
                          media={t.media[0]}
                          style={{
                            width: '100%',
                            maxHeight: 300,
                            objectFit: 'cover',
                            borderRadius: 12,
                            border: '1px solid #EAE1CE',
                            display: 'block',
                          }}
                        />
                        {t.media.length > 1 && (
                          <span
                            style={{
                              position: 'absolute',
                              bottom: 9,
                              right: 9,
                              background: 'rgba(38,34,28,0.82)',
                              color: '#FFFDF8',
                              font: font('500 11px/1', true),
                              borderRadius: 999,
                              padding: '5px 9px',
                            }}
                          >
                            +{t.media.length - 1} more
                          </span>
                        )}
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        gap: 14,
                        marginTop: 12,
                        font: font('500 12px/1'),
                        color: '#8A8068',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        className="hv-ink"
                        onClick={e => {
                          e.stopPropagation()
                          toggleMap('favs', t.id)
                        }}
                        style={{ cursor: 'pointer', color: isFav ? 'oklch(0.55 0.16 25)' : '#8A8068' }}
                      >
                        {isFav ? '♥ favorited' : '♡ favorite'}
                      </span>
                      <span
                        className="hv-ink"
                        onClick={e => {
                          e.stopPropagation()
                          toggleMap('read', t.id)
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {isRead ? '✓ read' : '○ mark read'}
                      </span>
                      <span
                        className="hv-ink"
                        onClick={() => selectTweet(t.id)}
                        style={{ cursor: 'pointer', color: note ? 'oklch(0.55 0.13 65)' : '#8A8068' }}
                      >
                        {note ? '✎ has note' : '✎ add note'}
                      </span>
                      <span
                        className="hv-ink"
                        onClick={e => {
                          e.stopPropagation()
                          toggleTrash(t.id)
                        }}
                        title={trashMap[t.id] ? 'Put back in the library' : 'Move to trash'}
                        style={{ cursor: 'pointer' }}
                      >
                        {trashMap[t.id] ? '↩ restore' : '⌫ remove'}
                      </span>
                      <a
                        href={t.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="hv-ink"
                        style={{ marginLeft: 'auto', marginRight: 0, textDecoration: 'none', color: '#8A8068' }}
                      >
                        ↗ x.com
                      </a>
                    </div>
                  </div>
                )
              })}

              {filtered.length > visible && (
                <button
                  className="hv-press"
                  onClick={() => set({ visible: visible + 120 })}
                  style={{
                    cursor: 'pointer',
                    margin: '8px auto 0',
                    background: '#fff',
                    border: '2px solid #26221C',
                    borderRadius: 999,
                    padding: '11px 26px',
                    font: font('600 13px/1'),
                    boxShadow: '3px 3px 0 #E8DFCB',
                  }}
                >
                  Show more ({(filtered.length - visible).toLocaleString()} left)
                </button>
              )}
            </div>
          </>
        )}

        {/* insights view */}
        {view === 'insights' && (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: isMobile ? '20px 14px' : `26px 30px 26px ${sideHidden ? '76px' : '30px'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 26,
            }}
          >
            <div>
              <div style={{ font: font('700 22px/1.2') }}>Insights</div>
              <div style={{ font: font('400 13px/1.5'), color: '#A79C88', marginTop: 3 }}>
                {live.length.toLocaleString()} bookmarks · {Object.keys(authorCounts).length.toLocaleString()} authors ·{' '}
                {yearKeys[0] || ''}–{yearKeys[yearKeys.length - 1] || ''}
              </div>
            </div>
            <div
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 22, alignItems: 'start' }}
            >
              <div style={{ minWidth: 0, background: '#fff', border: '1px solid #EAE1CE', borderRadius: 16, padding: '18px 20px' }}>
                <div style={{ font: font('700 13px/1'), letterSpacing: '0.04em', marginBottom: 14 }}>TOPICS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {allTopics.map(([name, hue]) => {
                    const h = hues(hue)
                    const pct = Math.round((100 * topicCounts[name]) / topicCounts[allTopics[0][0]])
                    return (
                      <div key={name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', font: font('500 12.5px/1') }}>
                          <span style={{ color: h.chipColor }}>{name}</span>
                          <span style={{ color: '#B3A78F', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
                            {topicCounts[name].toLocaleString()}
                          </span>
                        </div>
                        <div style={{ height: 7, borderRadius: 99, background: '#F4ECDA', marginTop: 5, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 99, background: h.bar, width: pct + '%' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
                <div
                  style={{ minWidth: 0, background: '#fff', border: '1px solid #EAE1CE', borderRadius: 16, padding: '18px 20px' }}
                >
                  <div style={{ font: font('700 13px/1'), letterSpacing: '0.04em', marginBottom: 14 }}>TOP AUTHORS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(authorCounts)
                      .sort((a, b) => b[1][0] - a[1][0])
                      .slice(0, 10)
                      .map(([handle, [count, name]], i) => (
                        <div
                          key={handle}
                          className="hv-bg-cream"
                          onClick={() => setFilter({ view: 'all', author: handle })}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderRadius: 8 }}
                        >
                          <span style={{ font: font('400 11px/1', true), color: '#C9BFA9', width: 18 }}>{i + 1}</span>
                          <span
                            style={{
                              minWidth: 0,
                              font: font('500 13px/1.2'),
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {name || handle}
                          </span>
                          <span
                            style={{
                              minWidth: 0,
                              font: font('400 11.5px/1'),
                              color: '#B3A78F',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {handle}
                          </span>
                          <span style={{ marginLeft: 'auto', font: font('500 11px/1', true), color: '#8A8068' }}>{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #EAE1CE', borderRadius: 16, padding: '18px 20px' }}>
                  <div style={{ font: font('700 13px/1'), letterSpacing: '0.04em', marginBottom: 14 }}>BY YEAR</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90 }}>
                    {yearRows.map(([year, count]) => (
                      <div
                        key={year}
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 5,
                          height: '100%',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <div
                          title={count.toLocaleString() + ' saved'}
                          style={{
                            width: '100%',
                            borderRadius: '6px 6px 3px 3px',
                            background: 'oklch(0.8 0.1 65)',
                            height: Math.max(4, Math.round((100 * count) / maxY)) + '%',
                          }}
                        />
                        <span style={{ font: font('400 9.5px/1', true), color: '#B3A78F' }}>
                          {year === 'pre' ? '…' : "'" + year}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* notebook view */}
        {view === 'scratch' && (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: isMobile ? '20px 14px' : `26px 30px 26px ${sideHidden ? '76px' : '30px'}`,
            }}
          >
            <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div style={{ font: font('700 22px/1.2') }}>Notebook</div>
                <div style={{ font: font('400 13px/1.5'), color: '#A79C88', marginTop: 3 }}>
                  Standalone notes and links — not tied to any tweet.
                </div>
              </div>
              <div
                style={{
                  background: '#fff',
                  border: '2px solid #26221C',
                  borderRadius: 16,
                  padding: '15px 17px',
                  boxShadow: '3px 3px 0 #E8DFCB',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 9,
                }}
              >
                <textarea
                  value={ui.scrapText}
                  onChange={e => set({ scrapText: e.target.value })}
                  placeholder="Write a note…"
                  style={{
                    minHeight: 64,
                    resize: 'vertical',
                    border: 'none',
                    outline: 'none',
                    background: 'none',
                    font: font('400 14px/1.6'),
                    color: '#26221C',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid #F0E9DC', paddingTop: 10 }}>
                  <span style={{ color: '#B3A78F', fontSize: 13 }}>🔗</span>
                  <input
                    value={ui.scrapUrl}
                    onChange={e => set({ scrapUrl: e.target.value })}
                    placeholder="https:// — optional link"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: 'none',
                      outline: 'none',
                      background: 'none',
                      font: font('400 13px/1', true),
                      color: '#5C5546',
                    }}
                  />
                  <button
                    className="hv-dim"
                    onClick={() => {
                      const text = ui.scrapText.trim()
                      const url = ui.scrapUrl.trim()
                      if (!text && !url) return
                      save({
                        ...store,
                        scraps: [
                          { id: String(Date.now()), text, url, time: new Date().toISOString() },
                          ...(store.scraps || []),
                        ],
                      })
                      set({ scrapText: '', scrapUrl: '' })
                    }}
                    style={{
                      cursor: 'pointer',
                      background: '#26221C',
                      color: '#FFFDF8',
                      border: 'none',
                      borderRadius: 999,
                      padding: '10px 16px',
                      font: font('600 12.5px/1'),
                    }}
                  >
                    + Save
                  </button>
                </div>
              </div>
              {(store.scraps || []).length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 0', font: font('400 13.5px/1.6'), color: '#C9BFA9' }}>
                  Nothing here yet — jot an idea or save a link ↑
                </div>
              )}
              {(store.scraps || []).map(sp => (
                <div key={sp.id} style={{ background: '#fff', border: '1px solid #EAE1CE', borderRadius: 16, padding: '14px 17px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <span style={{ font: font('400 10.5px/1', true), color: '#C9BFA9' }}>
                      {new Date(sp.time).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span
                      className="hv-ink"
                      onClick={() => save({ ...store, scraps: store.scraps.filter(x => x.id !== sp.id) })}
                      title="Delete"
                      style={{ marginLeft: 'auto', cursor: 'pointer', color: '#C9BFA9', fontSize: 13 }}
                    >
                      ✕
                    </span>
                  </div>
                  {sp.text && (
                    <div style={{ font: font('400 14px/1.6'), marginTop: 7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {sp.text}
                    </div>
                  )}
                  {sp.url && (
                    <a
                      href={sp.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-block',
                        marginTop: 7,
                        font: font('500 12.5px/1.4', true),
                        color: 'oklch(0.5 0.13 65)',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      🔗 {sp.url}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== DETAIL PANEL (desktop column / mobile full-screen overlay) ===== */}
      {(!isMobile || sel) && (
      <div
        style={
          isMobile
            ? { position: 'fixed', inset: 0, zIndex: 45, background: '#FFFDF8', display: 'flex', flexDirection: 'column', overflowY: 'auto' }
            : { background: '#FFFDF8', display: 'flex', flexDirection: 'column', overflowY: 'auto' }
        }
      >
        {!sel && (
          <div style={{ margin: 'auto', textAlign: 'center', padding: 30, color: '#C9BFA9' }}>
            <div style={{ fontSize: 30 }}>☞</div>
            <div style={{ font: font('500 13.5px/1.6'), marginTop: 8 }}>
              Click a tweet to see details,
              <br />
              add a note, or favorite it.
            </div>
          </div>
        )}
        {sel &&
          (() => {
            const h = hues(sel.hue)
            const isFav = !!store.favs[sel.id]
            const isRead = !!store.read[sel.id]
            const similar = live.filter(x => x.id !== sel.id && x.topic === sel.topic && sel.topic !== UNSORTED).slice(0, 3)
            const myTags = store.tags[sel.id] || []
            return (
              <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 15 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ font: font('700 12px/1'), letterSpacing: '0.08em', color: '#B3A78F' }}>SELECTED</span>
                  <span
                    className="hv-ink"
                    onClick={() => set({ selectedId: null })}
                    style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 16, color: '#B3A78F' }}
                  >
                    ✕
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: h.avBg,
                      color: h.avColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      font: font('700 15px/1'),
                    }}
                  >
                    {sel.initials}
                  </div>
                  <div>
                    <div style={{ font: font('600 15px/1.2') }}>{sel.name || sel.handle}</div>
                    <div style={{ font: font('400 12.5px/1.3'), color: '#B3A78F' }}>
                      {sel.handle} · {sel.dateFull}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    font: font('400 15.5px/1.6'),
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    direction: sel.rtl ? 'rtl' : 'ltr',
                  }}
                >
                  {sel.text || '(no text — media only)'}
                </div>
                {(sel.media || []).map((m, i) => (
                  <TweetImg
                    key={i}
                    media={m}
                    style={{ width: '100%', borderRadius: 12, border: '1px solid #EAE1CE', display: 'block' }}
                  />
                ))}
                {sel.links && sel.links.length > 0 && (
                  <a
                    href={sel.links[0]}
                    target="_blank"
                    rel="noreferrer"
                    style={{ font: font('500 12.5px/1.4'), color: 'oklch(0.5 0.13 65)', overflowWrap: 'anywhere' }}
                  >
                    🔗 {sel.links[0]}
                  </a>
                )}
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span
                    style={{
                      font: font('500 11.5px/1'),
                      background: h.chipBg,
                      color: h.chipColor,
                      borderRadius: 999,
                      padding: '6px 10px',
                    }}
                  >
                    {sel.topic}
                  </span>
                  {myTags.map(n => {
                    const s = tagStyle(n)
                    return (
                      <span
                        key={n}
                        style={{
                          font: font('500 11.5px/1'),
                          background: s.bg,
                          color: s.color,
                          borderRadius: 999,
                          padding: '6px 10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        ⊙ {n}{' '}
                        <span
                          className="hv-opaque"
                          onClick={() => save({ ...store, tags: { ...store.tags, [sel.id]: myTags.filter(x => x !== n) } })}
                          style={{ cursor: 'pointer', opacity: 0.55 }}
                        >
                          ✕
                        </span>
                      </span>
                    )
                  })}
                  <span
                    className="hv-ink hv-border-ink"
                    onClick={() => set({ tagEditorOpen: !ui.tagEditorOpen })}
                    style={{
                      cursor: 'pointer',
                      font: font('500 11.5px/1'),
                      color: '#B3A78F',
                      border: '1px dashed #DDD2BC',
                      borderRadius: 999,
                      padding: '6px 10px',
                    }}
                  >
                    + tag
                  </span>
                </div>
                {ui.tagEditorOpen && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      background: '#FBF8F1',
                      borderRadius: 12,
                      padding: '11px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 7 }}>
                      <input
                        value={ui.tagInput}
                        onChange={e => set({ tagInput: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') addTag(ui.tagInput)
                        }}
                        placeholder="New tag name…"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          border: '1.5px solid #E5DCC8',
                          borderRadius: 10,
                          padding: '9px 11px',
                          font: font('400 13px/1'),
                          outline: 'none',
                          background: '#fff',
                          color: '#26221C',
                        }}
                      />
                      <button
                        onClick={() => addTag(ui.tagInput)}
                        style={{
                          cursor: 'pointer',
                          background: '#26221C',
                          color: '#FFFDF8',
                          border: 'none',
                          borderRadius: 10,
                          padding: '0 14px',
                          font: font('600 12px/1'),
                        }}
                      >
                        Add
                      </button>
                    </div>
                    {tagSuggestions.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {tagSuggestions.map(n => {
                          const s = tagStyle(n)
                          return (
                            <span
                              key={n}
                              className="hv-bright-95"
                              onClick={() => addTag(n)}
                              style={{
                                cursor: 'pointer',
                                font: font('500 11px/1'),
                                background: s.bg,
                                color: s.color,
                                borderRadius: 999,
                                padding: '5px 9px',
                              }}
                            >
                              + {n}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <div style={{ font: font('700 11px/1'), letterSpacing: '0.1em', color: '#B3A78F', marginBottom: 8 }}>
                    MY NOTE
                  </div>
                  <textarea
                    value={store.notes[sel.id] || ''}
                    onChange={e => save({ ...store, notes: { ...store.notes, [sel.id]: e.target.value } })}
                    placeholder="Why did you save this?"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      minHeight: 86,
                      resize: 'vertical',
                      background: '#FBF5E9',
                      border: '1px solid #EFE4CC',
                      borderRadius: 12,
                      padding: '12px 13px',
                      font: font('400 13.5px/1.55'),
                      color: '#5C5546',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    onClick={() => toggleMap('favs', sel.id)}
                    style={{
                      cursor: 'pointer',
                      font: font('600 12.5px/1'),
                      background: isFav ? '#26221C' : 'none',
                      color: isFav ? '#FFFDF8' : '#26221C',
                      border: '1.5px solid #26221C',
                      borderRadius: 12,
                      padding: '12px 0',
                    }}
                  >
                    {isFav ? '♥ Favorited' : '♡ Favorite'}
                  </button>
                  <button
                    onClick={() => toggleMap('read', sel.id)}
                    style={{
                      cursor: 'pointer',
                      font: font('600 12.5px/1'),
                      background: 'none',
                      color: '#26221C',
                      border: '1.5px solid #26221C',
                      borderRadius: 12,
                      padding: '12px 0',
                    }}
                  >
                    {isRead ? '✓ Read — undo' : '○ Mark read'}
                  </button>
                  <a
                    className="hv-border-ink"
                    href={sel.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      gridColumn: '1 / -1',
                      textAlign: 'center',
                      textDecoration: 'none',
                      font: font('600 12.5px/1'),
                      color: '#26221C',
                      border: '1.5px solid #E5DCC8',
                      borderRadius: 12,
                      padding: '12px 0',
                    }}
                  >
                    ↗ Open on x.com
                  </a>
                </div>
                <span
                  className="hv-ink"
                  onClick={() => toggleTrash(sel.id)}
                  style={{ cursor: 'pointer', textAlign: 'center', font: font('500 12px/1'), color: '#B3A78F' }}
                >
                  {trashMap[sel.id] ? '↩ Restore from trash' : '⌫ Move to trash'}
                </span>
                {similar.length > 0 && (
                  <div style={{ borderTop: '1px solid #F0E9DC', paddingTop: 13 }}>
                    <div style={{ font: font('700 11px/1'), letterSpacing: '0.1em', color: '#B3A78F', marginBottom: 9 }}>
                      MORE LIKE THIS
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {similar.map(x => (
                        <div
                          key={x.id}
                          className="hv-bg-sand"
                          onClick={() => selectTweet(x.id)}
                          style={{
                            cursor: 'pointer',
                            font: font('400 12.5px/1.5'),
                            color: '#5C5546',
                            background: '#FBF8F1',
                            borderRadius: 10,
                            padding: '9px 11px',
                          }}
                        >
                          “{(x.text || '(media)').slice(0, 90) + ((x.text || '').length > 90 ? '…' : '')}”{' '}
                          <span style={{ color: '#B3A78F' }}>— {x.handle}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
      </div>
      )}

      {/* desktop: reopen collapsed sidebar */}
      {!isMobile && sideHidden && (
        <button
          onClick={() => setSideHidden(false)}
          title="Show sidebar"
          className="hv-press"
          style={{
            position: 'fixed',
            top: 14,
            left: 14,
            zIndex: 30,
            width: 40,
            height: 40,
            cursor: 'pointer',
            background: '#FFFDF8',
            border: '1.5px solid #26221C',
            borderRadius: 12,
            boxShadow: '2px 2px 0 #E8DFCB',
            font: font('600 15px/1'),
            color: '#26221C',
          }}
        >
          ☰
        </button>
      )}

      {/* ===== IMPORT-FROM-X MODAL ===== */}
      {importOpen && (
        <div
          onClick={() => setImportOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(38,34,28,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(620px, calc(100vw - 48px))',
              maxHeight: '84vh',
              overflowY: 'auto',
              background: '#FFFDF8',
              border: '2px solid #26221C',
              borderRadius: 18,
              boxShadow: '5px 5px 0 oklch(0.72 0.13 65)',
              padding: '22px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ font: font('700 18px/1.2') }}>Get your latest bookmarks</div>
              <span
                className="hv-ink"
                onClick={() => setImportOpen(false)}
                style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 17, color: '#B3A78F' }}
              >
                ✕
              </span>
            </div>
            <div style={{ font: font('400 13px/1.6'), color: '#5C5546' }}>
              X has no public bookmarks export, so Sunroom uses a small script you run on the bookmarks page itself.
              It scrolls, collects everything it passes, and downloads a JSON file you import here.
            </div>
            <ol style={{ margin: 0, paddingLeft: 20, font: font('400 13.5px/1.7'), color: '#26221C', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>
                Open{' '}
                <a href="https://x.com/i/bookmarks" target="_blank" rel="noreferrer">
                  x.com/i/bookmarks
                </a>{' '}
                (logged in) and let it load.
              </li>
              <li>
                Open the browser console — <span style={{ font: font('500 12px/1', true) }}>⌥⌘J</span> on Mac,{' '}
                <span style={{ font: font('500 12px/1', true) }}>F12</span> elsewhere. If Chrome blocks pasting, type{' '}
                <span style={{ font: font('500 12px/1', true) }}>allow pasting</span> first.
              </li>
              <li>
                Paste the script below and press Enter. It stops on its own and downloads{' '}
                <span style={{ font: font('500 12px/1', true) }}>bookmarks_export.json</span>. Only need recent saves?
                Close the tab once it has scrolled past them — everything collected so far still downloads.
              </li>
              <li>
                Come back here and use <b>⇪ Import JSON</b> with that file. New tweets are auto-categorized; ones
                already in your library are skipped.
              </li>
            </ol>
            <pre
              style={{
                margin: 0,
                background: '#FBF8F1',
                border: '1px solid #EAE1CE',
                borderRadius: 12,
                padding: '12px 14px',
                maxHeight: 170,
                overflow: 'auto',
                font: font('400 10.5px/1.55', true),
                color: '#5C5546',
                whiteSpace: 'pre',
              }}
            >
              {scraperSrc}
            </pre>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="hv-dim"
                onClick={() => {
                  navigator.clipboard.writeText(scraperSrc).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  )
                }}
                style={{
                  cursor: 'pointer',
                  background: '#26221C',
                  color: '#FFFDF8',
                  border: 'none',
                  borderRadius: 999,
                  padding: '11px 20px',
                  font: font('600 12.5px/1'),
                }}
              >
                {copied ? '✓ Copied' : '⧉ Copy script'}
              </button>
              <a
                className="hv-border-ink"
                href="https://x.com/i/bookmarks"
                target="_blank"
                rel="noreferrer"
                style={{
                  textDecoration: 'none',
                  border: '1.5px solid #E5DCC8',
                  borderRadius: 999,
                  padding: '11px 20px',
                  font: font('600 12.5px/1'),
                  color: '#26221C',
                }}
              >
                ↗ Open x.com/i/bookmarks
              </a>
            </div>
            <div style={{ font: font('400 11px/1.6', true), color: '#A79C88' }}>
              Imported tweets load images from X directly. For local images and the full curated pipeline, replace
              bookmarks_export.json in the repo, then run: node scripts/categorize.js && node scripts/download_media.js
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
