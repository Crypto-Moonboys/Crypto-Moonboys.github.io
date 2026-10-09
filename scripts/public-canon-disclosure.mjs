// Editorial records can exist in the public Git repository without being part
// of the reader-facing website. This is a publication boundary, not secrecy.
import path from 'node:path';

export const EDITORIAL_ONLY_PATHS = Object.freeze([
  'brand-canon/story-bibles/gk-master-canon.md',
  'brand-canon/reconciliation-decisions.json',
  'brand-canon/wiki-rewrites/issue-1458-proposals.md',
  'brand-canon/story-bibles/w81-continuity-companion-20261008.md',
]);

export function isEditorialOnlyPath(filename) {
  const normalized = path.posix.normalize(String(filename).replaceAll('\\', '/').replace(/^\/+/, ''));
  return EDITORIAL_ONLY_PATHS.includes(normalized);
}

function linkedEditorialPaths(source, filename) {
  const targets = [];
  for (const match of source.matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu)) targets.push(match[1] ?? match[2] ?? match[3]);
  for (const match of source.matchAll(/\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/gu)) targets.push(match[1] ?? match[2]);
  for (const match of source.matchAll(/^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*(?:<([^>]+)>|(\S+))/gmu)) targets.push(match[1] ?? match[2]);
  const origin = 'https://canon.invalid';
  const base = new URL(String(filename).replaceAll('\\', '/').replace(/^\/+/, ''), `${origin}/`);
  const linked = new Set();
  for (const target of targets) {
    try {
      const url = new URL(target.replaceAll('&amp;', '&'), base);
      const resolved = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (url.origin === origin && isEditorialOnlyPath(resolved)) linked.add(path.posix.normalize(resolved));
    } catch { /* Malformed links are handled by the separate link checks. */ }
  }
  return linked;
}

// Check the whole payload: a hidden element, comment, metadata value or JSON
// field is still published. Old locally attributed serial visions remain in
// the wiki; the newly approved intended ending must never be copied into it.
export function checkPublicDisclosure(source, filename) {
  if (isEditorialOnlyPath(filename)) return [];
  const raw = String(source);
  const text = (raw + '\n' + raw.replace(/<[^>]*>/gu, ' ')).replace(/\s+/gu, ' ');
  const spoilers = [
    /\bphysical universe (?:will |shall |does )?surviv(?:e|es)\b/iu,
    /\bcompulsory convergence (?:is |will be |has been )?defeated\b/iu,
    /\bno single sovereign owns humanity[’']s future\b/iu,
    /\b(?:approved|definitive) (?:intended )?(?:Final Fork )?(?:ending|outcome)\s*:/iu,
  ];
  const errors = [];
  if (spoilers.some(pattern => pattern.test(text))) errors.push(`${filename}: editorial Final Fork outcome disclosed in public payload`);
  const linked = linkedEditorialPaths(raw, filename);
  for (const privatePath of EDITORIAL_ONLY_PATHS) {
    if (raw.includes(`/${privatePath}`) || linked.has(privatePath)) errors.push(`${filename}: public link to editorial-only record ${privatePath}`);
  }
  return errors;
}
