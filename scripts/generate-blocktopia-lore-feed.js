import fs from 'fs';
import path from 'path';

const WIKI_DIR = path.resolve('./wiki');
const OUTPUT = path.resolve('./games/data/blocktopia-lore-feed.json');

function extractTextFromHtml(html) {
  // Remove all script and style blocks robustly (handles whitespace in tags)
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  // Strip remaining tags and normalise whitespace
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLoreFeed() {
  const files = fs.readdirSync(WIKI_DIR).filter(f => f.endsWith('.html'));
  const snippets = [];

  for (const file of files) {
    const html = fs.readFileSync(path.join(WIKI_DIR, file), 'utf-8');
    const text = extractTextFromHtml(html).slice(0, 240);
    snippets.push({ source: file, snippet: text });
  }

  const feed = {
    world_title: 'CITY BLOCK TOPIA',
    year: 3008,
    generated_at: new Date().toISOString(),
    lore_snippets: snippets.slice(0, 25)
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(feed, null, 2));
  console.log('Block Topia lore feed generated.');
}

buildLoreFeed();
