import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scoreCategory, detectLanguage, extractTopics, localNameFor } from '../src/lib/classify.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(__dirname, '..', 'bookmarks_export.json');
const outputDir = path.join(__dirname, '..', 'src', 'data');
const outputPath = path.join(outputDir, 'bookmarks.json');

const rawData = fs.readFileSync(inputPath, 'utf8');
const bookmarks = JSON.parse(rawData);

// Manual per-bookmark labels (id -> category) from content analysis.
// These always win over heuristic scoring.
const overridesPath = path.join(__dirname, 'overrides.json');
const overrides = fs.existsSync(overridesPath)
  ? JSON.parse(fs.readFileSync(overridesPath, 'utf8'))
  : {};

const mediaDir = path.join(__dirname, '..', 'public', 'media');

const categorizedBookmarks = bookmarks.map(bookmark => {
  const text = bookmark.text || '';
  const language = detectLanguage(text);
  const media = (bookmark.media || []).map(url => {
    const name = localNameFor(url);
    const local = name && fs.existsSync(path.join(mediaDir, name)) ? `/media/${name}` : null;
    return { url, local };
  });
  return {
    ...bookmark,
    media,
    category: overrides[bookmark.id] || scoreCategory(bookmark),
    language,
    topics: extractTopics(text, language),
  };
});

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(categorizedBookmarks, null, 2));

const counts = {};
categorizedBookmarks.forEach(b => { counts[b.category] = (counts[b.category] || 0) + 1; });
console.log(`Categorized ${categorizedBookmarks.length} bookmarks (with language + topics):`);
Object.entries(counts).sort((a, b) => b[1] - a[1])
  .forEach(([cat, n]) => console.log(`  ${cat}: ${n} (${(n / categorizedBookmarks.length * 100).toFixed(1)}%)`));
