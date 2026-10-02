# Sunroom — Twitter Bookmarks Browser

A local web app to browse, search, annotate, and filter your exported
Twitter/X bookmarks (`bookmarks_export.json`). The UI implements
the "Sunroom" Claude Design project (warm three-pane layout: sidebar · feed ·
detail panel).

## Usage

Your bookmarks never go in git: `bookmarks_export.json`, `src/data/bookmarks.json`,
`scripts/overrides.json` and `public/media/` are all ignored. Without them the app
shows a small made-up sample (`src/data/bookmarks.sample.json`), so a fresh clone runs.

```bash
npm install
# put your bookmarks_export.json in the project folder first (see below)
node scripts/categorize.js   # (re)classify bookmarks -> src/data/bookmarks.json
npm run dev                  # start the app
npm run build                # production build -> dist/
```

## Updating your bookmarks

Two ways, both fed by the same export format:

- **In the app (quick):** sidebar → **⌁ From X…** shows a script
  (`scripts/export_bookmarks.js`) to paste into the browser console on
  [x.com/i/bookmarks](https://x.com/i/bookmarks); it auto-scrolls and
  downloads a fresh `bookmarks_export.json`. Then sidebar → **⇪ Import JSON**
  with that file: new tweets are auto-categorized in the browser (same
  classifier via `src/lib/classify.js`), duplicates are skipped, and the
  import persists in IndexedDB. "remove" clears imported tweets again.
- **Full pipeline (durable):** replace `bookmarks_export.json` in the repo,
  then `node scripts/categorize.js` (applies manual overrides too) and
  `node scripts/download_media.js` (localizes images). Bundled data always
  wins over an in-app import for the same tweet id.

## Features

- **18 categories.** Base pass: a scoring classifier with English *and* Arabic
  keywords, per-account rules, link-domain hints, and cashtag/emoji signals
  (`scripts/categorize.js`). On top of that, `scripts/overrides.json` (yours, not in git) can hold
  hand-reviewed labels by tweet id, which always win. Each category
  gets its own hue throughout the UI (chips, avatars, insight bars).
- **Filters:** topic (sidebar chips), author (click a card's category chip),
  date (2026 / 2025 / 2024 / ≤ 2023), has-media, my tags, plus word search
  across text, author, and @handle. Active filters show a "clear all" reset.
- **Views:** Browse all · Unread · Favorites · My notes · Notebook (standalone
  notes & links) · Insights (topic distribution, top authors, saves by year).
- **Annotations:** favorite, read/unread (auto-marks read on open), per-tweet
  notes, and free-form tags with color-hashed chips. Reading progress is
  tracked in the sidebar. Saved to `localStorage` instantly; when deployed on
  Cloudflare Pages they also **sync across devices** through Workers KV
  (`functions/api/store.js` + `src/lib/sync.js` — see DEPLOY.md). The sidebar
  shows whether sync is live.
- **Trash:** remove a bookmark (⌫ on any card or in the detail panel) and it
  moves to a Trash view — excluded from every view, count, topic, and export,
  but kept forever and restorable with one tap. Trash state syncs across
  devices like the other annotations.
- **Export** the currently filtered list as JSON or CSV (includes your notes
  and tags).
- **Fully local:** tweet images are downloaded to `public/media/`
  (`node scripts/download_media.js`) and served locally, with automatic
  fallback to the remote URL if a file is missing.
- RTL rendering for Arabic tweets, newest/oldest sort, "more like this"
  suggestions in the detail panel.
- **Responsive:** under 860px the sidebar becomes a ☰ drawer, the detail
  panel opens full-screen per tweet, and the feed goes single-column. On
  desktop the sidebar can be collapsed («) for a wider reading area.

## Notes

- Re-running `categorize.js` keeps the manual labels: overrides in
  `scripts/overrides.json` always win over the heuristic score.
