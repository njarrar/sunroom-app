import fs from 'fs';
const data = JSON.parse(fs.readFileSync('src/data/bookmarks.json', 'utf8'));
const overrides = fs.existsSync('scripts/overrides.json') ? JSON.parse(fs.readFileSync('scripts/overrides.json', 'utf8')) : {};
const pending = data.filter(b => b.category === 'Uncategorized' && !overrides[b.id]);
const n = parseInt(process.argv[2] || '90', 10);
console.log(`pending total: ${pending.length}`);
pending.slice(0, n).forEach(b => {
  const text = (b.text || '').replace(/\s+/g, ' ').slice(0, 170);
  const media = b.media?.length ? ` [${b.media.length} img]` : '';
  console.log(`${b.id}|${b.handle}|${(b.name||'').slice(0,25)}${media}|${text}`);
});
