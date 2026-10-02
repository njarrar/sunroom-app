// Grab your latest X/Twitter bookmarks straight from the bookmarks page.
//
// How to use:
//   1. Open https://x.com/i/bookmarks (logged in) and let it load.
//   2. Open the browser DevTools console (Cmd+Opt+J / F12). If Chrome blocks
//      pasting, type "allow pasting" first.
//   3. Paste this whole file and press Enter. It auto-scrolls, collects every
//      bookmark it passes, and downloads bookmarks_export.json when the page
//      stops producing new ones. To stop early, just scroll no further and
//      wait — it finishes after ~8s without new tweets.
//   4. Import that file in Sunroom (sidebar → "⇪ Import JSON"), or replace
//      bookmarks_export.json in this repo and run node scripts/categorize.js.
//
// Output format matches bookmarks_export.json:
//   { id, url, name, handle, time, text, media: [urls], links: [urls] }
//
// Note: X's DOM changes now and then; if collection stays at 0, the
// data-testid selectors below likely need updating.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = new Map();

  const collect = () => {
    for (const art of document.querySelectorAll('article[data-testid="tweet"]')) {
      try {
        const statusHref = [...art.querySelectorAll('a[href*="/status/"]')]
          .map(a => a.getAttribute('href'))
          .find(h => /^\/[^/]+\/status\/\d+$/.test(h || ''));
        if (!statusHref) continue;
        const [, user, id] = statusHref.match(/^\/([^/]+)\/status\/(\d+)$/);
        if (out.has(id)) continue;

        const textEl = art.querySelector('[data-testid="tweetText"]');
        const media = [...art.querySelectorAll('[data-testid="tweetPhoto"] img')]
          .map(img => img.src)
          .filter(src => src.includes('pbs.twimg.com/media'));
        const links = [...art.querySelectorAll('a[href^="http"]')]
          .map(a => a.href)
          .filter(h => !h.includes('x.com') && !h.includes('twitter.com') && !h.includes('t.co/'));

        out.set(id, {
          id,
          url: `https://x.com/${user}/status/${id}`,
          name: (art.querySelector('[data-testid="User-Name"]')?.innerText || user).split('\n')[0],
          handle: '@' + user,
          time: art.querySelector('time')?.dateTime || new Date().toISOString(),
          text: textEl ? textEl.innerText : '',
          media,
          links: [...new Set(links)],
        });
      } catch (e) {
        console.warn('skipped one tweet:', e);
      }
    }
  };

  console.log('Sunroom bookmark grabber: scrolling…');
  let idleRounds = 0;
  while (idleRounds < 6) {
    const before = out.size;
    collect();
    window.scrollTo(0, document.documentElement.scrollHeight);
    await sleep(1400);
    idleRounds = out.size === before ? idleRounds + 1 : 0;
    if (out.size !== before) console.log(`collected ${out.size} bookmarks…`);
  }

  const data = [...out.values()];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'bookmarks_export.json';
  a.click();
  URL.revokeObjectURL(a.href);
  console.log(`done — downloaded ${data.length} bookmarks as bookmarks_export.json`);
})();
