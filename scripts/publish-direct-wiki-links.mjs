import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readHtmlAttribute, readHtmlAttributes, tokenizeActiveHtml } from './wiki-html-structure.mjs';

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
      const href = readHtmlAttributes(token.raw, { includeValueStart: true })
        .find(attribute => attribute.name === 'href');
      const destination = redirects.get(href?.value);
      if (!destination) continue;
      const start = token.start + href.valueStart;
      pieces.push(html.slice(end, start), destination);
      end = start + href.rawValue.length;
    }
    if (pieces.length) await writeFile(path.join(root, route), pieces.join('') + html.slice(end));
  }
}

// Related cards need at most eight titles and excerpts for the current article.
// Keep these files in the Pages artifact so each build follows the current graph.
export async function publishWikiRelatedData(root) {
  const graphText = await readFile(path.join(root, 'js/entity-graph.json'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (graphText === null) return;

  const graph = JSON.parse(graphText);
  const index = JSON.parse(await readFile(path.join(root, 'js/wiki-index.json'), 'utf8'));
  const entries = new Map(index.map(entry => [entry.url, entry]));
  const articleNames = (await readdir(path.join(root, 'wiki'))).filter(name => /^[a-z0-9_-]+\.html$/u.test(name));
  const wikiUrls = new Set(articleNames.map(name => '/wiki/' + name));
  const output = path.join(root, 'js/wiki-related');
  await mkdir(output, { recursive: true });

  for (const filename of articleNames) {
    const sourceUrl = '/wiki/' + filename;
    const links = (graph[sourceUrl]?.related_pages ?? [])
      .filter(({ target_url }) => target_url !== sourceUrl && wikiUrls.has(target_url))
      .slice(0, 8)
      .map(({ target_url }) => {
        const entry = entries.get(target_url);
        const description = entry?.desc || '';
        return {
          target_url,
          title: entry?.title || target_url,
          desc: description.length > 120 ? description.slice(0, 120) + '…' : description,
        };
      });
    await writeFile(path.join(output, filename.replace(/\.html$/u, '.json')), JSON.stringify(links));
  }
}
