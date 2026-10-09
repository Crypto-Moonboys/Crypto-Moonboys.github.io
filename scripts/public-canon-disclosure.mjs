// Editorial records can exist in the public Git repository without being part
// of the reader-facing website. This is a publication boundary, not secrecy.
export const EDITORIAL_ONLY_PATHS = Object.freeze([
  'brand-canon/story-bibles/gk-master-canon.md',
  'brand-canon/reconciliation-decisions.json',
  'brand-canon/wiki-rewrites/issue-1458-proposals.md',
  'brand-canon/story-bibles/w81-continuity-companion-20261008.md',
]);

export function isEditorialOnlyPath(filename) {
  const normalized = String(filename).replaceAll('\\', '/').replace(/^\/+/, '');
  return EDITORIAL_ONLY_PATHS.includes(normalized);
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
  for (const privatePath of EDITORIAL_ONLY_PATHS) {
    if (String(source).includes(`/${privatePath}`)) errors.push(`${filename}: public link to editorial-only record ${privatePath}`);
  }
  return errors;
}
