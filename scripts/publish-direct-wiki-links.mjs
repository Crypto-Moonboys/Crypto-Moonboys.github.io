import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readHtmlAttribute, tokenizeActiveHtml } from './wiki-html-structure.mjs';

// Archive source HTML is an editorial record. Resolve ordinary links in the
// published copy using the destinations declared by the site's redirect pages.
function immediateDestination(html) {
  if (!/http-equiv\s*=\s*["']refresh/i.test(html)) return null;
  for (const token of tokenizeActiveHtml(html)) {
    if (token.name !== 'meta' || token.closing || token.foreignContent || token.shadowContent) continue;
    if (readHtmlAttribute(token.raw, 'http-equiv').value?.toLowerCase() !== 'refresh') continue;
    const content = readHtmlAttribute(token.raw, 'content').value || '';
    return /^0\s*;\s*url\s*=\s*(\/[a-z0-9/_-]+\.html(?:#[a-z0-9_-]+)?)\s*$/i.exec(content)?.[1];
  }
}

export async function publishDirectWikiLinks(root) {
  const names = (await readdir(path.join(root, 'wiki'))).filter(name => name.endsWith('.html'));
  const redirects = new Map();
  const pages = [];
  for (const route of ['/about/index.html', ...names.map(name => '/wiki/' + name)]) {
    let html;
    try {
      html = await readFile(path.join(root, route), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT' && route === '/about/index.html') continue;
      throw error;
    }
    const destination = immediateDestination(html);
    if (destination) {
      redirects.set(route, destination);
      if (route.endsWith('/index.html')) redirects.set(route.slice(0, -10), destination);
    } else if (route.startsWith('/wiki/')) {
      pages.push({ route, html });
    }
  }

  for (const { route, html } of pages) {
    let end = 0;
    const pieces = [];
    for (const token of tokenizeActiveHtml(html)) {
      if (token.name !== 'a' || token.closing || token.foreignContent || token.shadowContent) continue;
      const href = readHtmlAttribute(token.raw, 'href').value;
      const destination = redirects.get(href);
      if (!destination) continue;
      // Preserve the original tag and every other attribute byte for byte.
      const tag = token.raw.replace(/(\shref\s*=\s*)(["'])([^"']*)\2/i,
        (match, prefix, quote, value) => value === href ? prefix + quote + destination + quote : match);
      if (tag === token.raw) continue;
      pieces.push(html.slice(end, token.start), tag);
      end = token.end;
    }
    if (pieces.length) await writeFile(path.join(root, route), pieces.join('') + html.slice(end));
  }
}
