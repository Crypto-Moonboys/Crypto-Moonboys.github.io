export function publicDocument(path) {
  return typeof path === 'string' && /^\/(?:[\w.~-]+\/)*(?:[\w.~-]+\.(?:html|md))?$/u.test(path) &&
    !path.split('/').some(part => part === '.' || part === '..' || part.startsWith('_') || part.startsWith('.')) &&
    !/^\/(?:api|admin|auth|account|wallet|telegram|cdn-cgi|workers|server|scripts)(?:[\/.]|$)/i.test(path) &&
    !EDITORIAL_REFERENCE.test(path);
}

function entities(text) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—' };
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (!code.startsWith('#')) return named[code.toLowerCase()] ?? whole;
    const cp = /^#x/i.test(code) ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
    return cp >= 32 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ' ';
  });
}

export const EDITORIAL_REFERENCE = /(?:gk-master-canon|w81-continuity-companion|issue-1458-proposals|reconciliation-decisions)/i;
export const UNPUBLISHED_OUTCOME = /\b(?:physical universe (?:will |shall |does )?surviv(?:e|es)|compulsory convergence (?:is |will be |has been )?defeated|no single sovereign owns humanity[’']s future)\b/iu;

export function publishedLoreText(path, body) {
  if (!publicDocument(path)) return '';
  if (path.endsWith('.md')) {
    if (/^\s*<(?:!doctype|html|head|body)\b/i.test(body)) return '';
    return body.replace(/<!--[\s\S]*?-->/g, '').replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, '$1').replace(/<[^>]*>/g, '');
  }
  const head = body.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  if (/<meta\b(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["'][^"']*noindex)[^>]*>/i.test(head)) return '';
  if (/<meta\b[^>]*http-equiv=["']refresh["']/i.test(head)) return '';
  const content = body.match(/<article\b[^>]*class=["'][^"']*\bwiki-content\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/i)?.[1]
    ?? body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? body.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  if (!content) return '';
  return entities(content
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|nav|aside|template|form|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/(p|h[1-6]|li|div|section|tr|blockquote)\s*>|<br\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' '));
}

