import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(__dirname, '..', 'bookmarks_export.json');
const mediaDir = path.join(__dirname, '..', 'public', 'media');

const bookmarks = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
fs.mkdirSync(mediaDir, { recursive: true });

// pbs.twimg.com/media/<KEY>?format=jpg&name=small -> <KEY>.jpg
export function localNameFor(url) {
  try {
    const u = new URL(url);
    const key = path.basename(u.pathname);
    const format = u.searchParams.get('format') || 'jpg';
    return `${key}.${format}`;
  } catch {
    return null;
  }
}

const jobs = [];
const seen = new Set();
for (const b of bookmarks) {
  for (const url of b.media || []) {
    const name = localNameFor(url);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    jobs.push({ url, name });
  }
}

let done = 0, skipped = 0, failed = 0;

async function download({ url, name }) {
  const dest = path.join(mediaDir, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { skipped++; return; }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      done++;
      return;
    } catch (e) {
      if (attempt === 1) { failed++; console.error(`FAIL ${url}: ${e.message}`); }
      else await new Promise(r => setTimeout(r, 1000));
    }
  }
}

const CONCURRENCY = 8;
console.log(`Downloading ${jobs.length} unique media files to public/media/ ...`);
let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    await download(job);
    const total = done + skipped + failed;
    if (total % 200 === 0) console.log(`progress: ${total}/${jobs.length} (ok ${done}, cached ${skipped}, failed ${failed})`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`Finished: ${done} downloaded, ${skipped} already present, ${failed} failed, of ${jobs.length} total.`);
