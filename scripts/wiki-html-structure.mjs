const HTML_SPACE = '[\\t\\n\\f\\r ]';
const RAW_TEXT_ELEMENTS = new Set([
  'iframe',
  'noembed',
  'noframes',
  'noscript',
  'plaintext',
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
]);

const FOREIGN_CONTENT_ROOTS = new Set(['math', 'svg']);

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
]);

const NAMED_ATTRIBUTE_ENTITIES = Object.freeze({
  amp: '&',
  apos: "'",
  bsol: '\\',
  colon: ':',
  gt: '>',
  lt: '<',
  nbsp: ' ',
  newline: '\n',
  quot: '"',
  sol: '/',
  tab: '\t',
});

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findCommentEnd(source, start) {
  const candidates = [];
  const contentStart = start + 4;

  // The HTML tokenizer has abrupt empty-comment close states for `<!-->` and
  // `<!--->`, in addition to accepting `--!>` as a parse-error comment close.
  if (source[contentStart] === '>') candidates.push(contentStart + 1);
  if (source.startsWith('->', contentStart)) candidates.push(contentStart + 2);

  for (const terminator of ['-->', '--!>']) {
    const closeStart = source.indexOf(terminator, contentStart);
    if (closeStart >= 0) candidates.push(closeStart + terminator.length);
  }

  return candidates.length > 0 ? Math.min(...candidates) : source.length;
}

function findBogusDeclarationEnd(source, start) {
  const close = source.indexOf('>', start + 2);
  return close < 0 ? source.length : close + 1;
}

function findDoctypeEnd(source, start) {
  // Quotes are data in most DOCTYPE tokenizer states. They protect `>` only
  // while the browser is reading a quoted PUBLIC or SYSTEM identifier. A
  // generic quote-aware scan lets malformed input such as `<!doctype ">`
  // swallow following live markup even though the browser closes the doctype
  // at that first `>`.
  let cursor = start + '<!doctype'.length;
  let state = 'doctype';
  let quote = '';

  while (cursor < source.length) {
    const character = source[cursor];

    if (state === 'public-identifier' || state === 'system-identifier') {
      if (character === quote) {
        state = state === 'public-identifier'
          ? 'after-public-identifier'
          : 'after-system-identifier';
        quote = '';
      }
      cursor += 1;
      continue;
    }

    if (state === 'bogus') {
      if (character === '>') return cursor + 1;
      cursor += 1;
      continue;
    }

    if (state === 'doctype') {
      if (isHtmlSpace(character)) {
        state = 'before-name';
        cursor += 1;
        continue;
      }
      if (character === '>') return cursor + 1;
      state = 'before-name';
      continue;
    }

    if (state === 'before-name') {
      if (isHtmlSpace(character)) {
        cursor += 1;
        continue;
      }
      if (character === '>') return cursor + 1;
      state = 'name';
      cursor += 1;
      continue;
    }

    if (state === 'name') {
      if (isHtmlSpace(character)) state = 'after-name';
      else if (character === '>') return cursor + 1;
      cursor += 1;
      continue;
    }

    if (state === 'after-name') {
      if (isHtmlSpace(character)) {
        cursor += 1;
        continue;
      }
      if (character === '>') return cursor + 1;
      const keyword = source.slice(cursor, cursor + 6).toLowerCase();
      if (keyword === 'public' || keyword === 'system') {
        state = keyword === 'public' ? 'after-public-keyword' : 'after-system-keyword';
        cursor += 6;
        continue;
      }
      state = 'bogus';
      continue;
    }

    if (state === 'after-public-keyword' || state === 'before-public-identifier') {
      if (isHtmlSpace(character)) {
        state = 'before-public-identifier';
        cursor += 1;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        state = 'public-identifier';
        cursor += 1;
        continue;
      }
      if (character === '>') return cursor + 1;
      state = 'bogus';
      continue;
    }

    if (state === 'after-public-identifier' || state === 'between-public-and-system-identifiers') {
      if (isHtmlSpace(character)) {
        state = 'between-public-and-system-identifiers';
        cursor += 1;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        state = 'system-identifier';
        cursor += 1;
        continue;
      }
      if (character === '>') return cursor + 1;
      state = 'bogus';
      continue;
    }

    if (state === 'after-system-keyword' || state === 'before-system-identifier') {
      if (isHtmlSpace(character)) {
        state = 'before-system-identifier';
        cursor += 1;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        state = 'system-identifier';
        cursor += 1;
        continue;
      }
      if (character === '>') return cursor + 1;
      state = 'bogus';
      continue;
    }

    // after-system-identifier
    if (isHtmlSpace(character)) {
      cursor += 1;
      continue;
    }
    if (character === '>') return cursor + 1;
    state = 'bogus';
  }
  return source.length;
}

function findMarkupDeclarationEnd(source, start) {
  if (source[start + 1] === '?') return findBogusDeclarationEnd(source, start);
  if (
    source[start + 1] === '/' &&
    (source[start + 2] === '!' || source[start + 2] === '?')
  ) return findBogusDeclarationEnd(source, start);
  if (source[start + 1] !== '!') return null;

  const remainder = source.slice(start);
  if (/^<!doctype/i.test(remainder)) {
    return findDoctypeEnd(source, start);
  }
  if (remainder.startsWith('<![CDATA[')) {
    // Conservatively keep CDATA opaque through its terminator. In HTML proper
    // this can be a bogus comment, but treating its apparent tags as active is
    // unsafe for authority and shell classification in SVG/MathML contexts.
    // Supplied article fragments ban CDATA outright at the validation layer.
    const close = source.indexOf(']]>', start + 9);
    return close < 0 ? source.length : close + 3;
  }
  return findBogusDeclarationEnd(source, start);
}

function findTagEnd(source, start, nameEnd) {
  let cursor = nameEnd;
  let state = 'before-attribute';
  let quote = '';

  while (cursor < source.length) {
    const character = source[cursor];

    if (state === 'quoted-value') {
      if (character === quote) state = 'after-quoted-value';
      cursor += 1;
      continue;
    }

    if (state === 'unquoted-value') {
      if (character === '>') return { end: cursor + 1, selfClosing: false };
      if (isHtmlSpace(character)) state = 'before-attribute';
      cursor += 1;
      continue;
    }

    if (state === 'before-value') {
      if (isHtmlSpace(character)) {
        cursor += 1;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        state = 'quoted-value';
        cursor += 1;
        continue;
      }
      if (character === '>') return { end: cursor + 1, selfClosing: false };
      state = 'unquoted-value';
      cursor += 1;
      continue;
    }

    if (state === 'attribute-name') {
      if (character === '>') return { end: cursor + 1, selfClosing: false };
      if (character === '=') state = 'before-value';
      else if (isHtmlSpace(character)) state = 'after-attribute-name';
      else if (character === '/') state = 'self-closing';
      cursor += 1;
      continue;
    }

    if (state === 'after-attribute-name') {
      if (isHtmlSpace(character)) {
        cursor += 1;
        continue;
      }
      if (character === '>') return { end: cursor + 1, selfClosing: false };
      if (character === '=') state = 'before-value';
      else if (character === '/') state = 'self-closing';
      else state = 'attribute-name';
      cursor += 1;
      continue;
    }

    if (state === 'after-quoted-value') {
      if (isHtmlSpace(character)) state = 'before-attribute';
      else if (character === '/') state = 'self-closing';
      else if (character === '>') return { end: cursor + 1, selfClosing: false };
      else {
        state = 'before-attribute';
        continue;
      }
      cursor += 1;
      continue;
    }

    if (state === 'self-closing') {
      if (character === '>') return { end: cursor + 1, selfClosing: true };
      state = 'before-attribute';
      continue;
    }

    // before-attribute
    if (isHtmlSpace(character)) {
      cursor += 1;
      continue;
    }
    if (character === '>') return { end: cursor + 1, selfClosing: false };
    if (character === '/') state = 'self-closing';
    else state = 'attribute-name';
    cursor += 1;
  }

  return { end: -1, selfClosing: false };
}

function parseTag(source, start) {
  // The HTML tokenizer requires an ASCII letter immediately after `<` (or
  // `</`). Whitespace there is text, not a tag. Treating `< template>` as a
  // template made otherwise-active markup after it look inert to our checks.
  const match = source.slice(start).match(/^<(\/)?([a-z][^\t\n\f\r />]*)/i);
  if (!match) return { type: 'other', start, end: start + 1, raw: '<' };
  const tagEnd = findTagEnd(source, start, start + match[0].length);
  const { end } = tagEnd;
  if (end < 0) return null;
  const raw = source.slice(start, end);
  const name = match[2].toLowerCase();
  return {
    type: 'tag',
    start,
    end,
    raw,
    name,
    closing: Boolean(match[1]),
    selfClosing: VOID_ELEMENTS.has(name) || (!match[1] && tagEnd.selfClosing),
  };
}

function findRawTextClose(source, lowerSource, name, fromIndex) {
  if (name === 'plaintext') return source.length;
  if (name === 'script') return findScriptTextClose(source, lowerSource, fromIndex);
  const expression = new RegExp(`<\\/${escapeRegex(name)}(?=${HTML_SPACE}|/|>)`, 'ig');
  expression.lastIndex = fromIndex;
  const match = expression.exec(lowerSource);
  if (!match) return source.length;
  const { end } = findTagEnd(source, match.index, match.index + match[0].length);
  return end < 0 ? source.length : end;
}

function hasScriptNameBoundary(source, index) {
  const character = source[index];
  return character === '/' || character === '>' || isHtmlSpace(character);
}

/**
 * Find the end of an HTML script-data token without exposing markup that a
 * browser keeps inside escaped or double-escaped script text. This models the
 * state transitions that affect whether an appropriate `</script>` closes the
 * element; JavaScript syntax itself is intentionally irrelevant here.
 */
function findScriptTextClose(source, lowerSource, fromIndex) {
  let cursor = fromIndex;
  let state = 'data';

  while (cursor < source.length) {
    if (state === 'data') {
      if (
        lowerSource.startsWith('</script', cursor) &&
        hasScriptNameBoundary(source, cursor + '</script'.length)
      ) {
        const { end } = findTagEnd(
          source,
          cursor,
          cursor + '</script'.length
        );
        return end < 0 ? source.length : end;
      }
      if (source.startsWith('<!--', cursor)) {
        state = 'escaped';
        cursor += '<!--'.length;
        continue;
      }
      cursor += 1;
      continue;
    }

    if (state === 'escaped') {
      if (source.startsWith('-->', cursor)) {
        state = 'data';
        cursor += '-->'.length;
        continue;
      }
      if (
        lowerSource.startsWith('</script', cursor) &&
        hasScriptNameBoundary(source, cursor + '</script'.length)
      ) {
        const { end } = findTagEnd(
          source,
          cursor,
          cursor + '</script'.length
        );
        return end < 0 ? source.length : end;
      }
      if (
        lowerSource.startsWith('<script', cursor) &&
        hasScriptNameBoundary(source, cursor + '<script'.length)
      ) {
        state = 'double-escaped';
        cursor += '<script'.length;
        continue;
      }
      cursor += 1;
      continue;
    }

    // In the double-escaped state an appropriate-looking end tag only exits
    // back to the escaped state. It takes a later `</script>` to close the
    // element. `-->` returns directly to ordinary script data.
    if (source.startsWith('-->', cursor)) {
      state = 'data';
      cursor += '-->'.length;
      continue;
    }
    if (
      lowerSource.startsWith('</script', cursor) &&
      hasScriptNameBoundary(source, cursor + '</script'.length)
    ) {
      state = 'escaped';
      cursor += '</script'.length;
      continue;
    }
    cursor += 1;
  }

  return source.length;
}

/**
 * Tokenize active page markup while ignoring comments only as markup sources,
 * raw-text element bodies, and inert template contents. Comment tokens remain
 * available so ownership markers can be validated as real HTML comments.
 */
export function tokenizeActiveHtml(value, {
  includeNoscriptContent = false,
  includeRawTextOpeningTags = false,
} = {}) {
  const source = String(value || '');
  const lowerSource = source.toLowerCase();
  const tokens = [];
  let cursor = 0;
  let templateDepth = 0;
  let declarativeShadowDepth = 0;
  let foreignContentDepth = 0;
  let selectDepth = 0;

  while (cursor < source.length) {
    const nextTag = source.indexOf('<', cursor);
    if (nextTag < 0) break;
    cursor = nextTag;

    if (source.startsWith('<!--', cursor)) {
      const end = findCommentEnd(source, cursor);
      if (templateDepth === 0 && selectDepth === 0) {
        tokens.push({
          type: 'comment',
          start: cursor,
          end,
          raw: source.slice(cursor, end),
          ...(declarativeShadowDepth > 0 ? { shadowContent: true } : {}),
          ...(foreignContentDepth > 0 ? { foreignContent: true } : {}),
        });
      }
      cursor = end;
      continue;
    }

    const declarationEnd = findMarkupDeclarationEnd(source, cursor);
    if (declarationEnd !== null) {
      cursor = declarationEnd;
      continue;
    }

    const token = parseTag(source, cursor);
    if (!token) break;
    if (token.type !== 'tag') {
      // An invalid `<` is emitted as text by browsers. Advance past only that
      // character so a later, valid tag before the next `>` is still seen.
      cursor += 1;
      continue;
    }

    if (templateDepth > 0) {
      if (token.name === 'template') {
        if (token.closing) templateDepth = Math.max(0, templateDepth - 1);
        else templateDepth += 1;
        cursor = token.end;
        continue;
      }
      if (!token.closing && RAW_TEXT_ELEMENTS.has(token.name) && !(includeNoscriptContent && token.name === 'noscript')) {
        cursor = findRawTextClose(source, lowerSource, token.name, token.end);
        continue;
      }
      cursor = token.end;
      continue;
    }

    // Declarative shadow DOM template contents are not inert: the browser
    // attaches them as a live shadow root, where event handlers and other
    // document controls can execute. Keep those tokens visible to security
    // callers, while marking their context so they can never grant document-
    // root authority.
    if (declarativeShadowDepth > 0) {
      tokens.push({ ...token, shadowContent: true });
      if (token.name === 'template') {
        if (token.closing) declarativeShadowDepth = Math.max(0, declarativeShadowDepth - 1);
        else if (!token.selfClosing) declarativeShadowDepth += 1;
      }
      if (
        !token.closing &&
        RAW_TEXT_ELEMENTS.has(token.name) &&
        !(includeNoscriptContent && token.name === 'noscript')
      ) {
        cursor = findRawTextClose(source, lowerSource, token.name, token.end);
        continue;
      }
      cursor = token.end;
      continue;
    }

    // HTML parser-state rules for template and raw-text element names do not
    // apply to same-named SVG/MathML elements. Expose every foreign-content
    // tag to executable-control checks instead of accidentally hiding live
    // descendants. The conservative depth lasts until the textual foreign
    // root closes; tokens are marked so they cannot impersonate the document
    // body or another HTML ownership root.
    if (foreignContentDepth > 0) {
      tokens.push({ ...token, foreignContent: true });
      if (FOREIGN_CONTENT_ROOTS.has(token.name)) {
        if (token.closing) foreignContentDepth = Math.max(0, foreignContentDepth - 1);
        else if (!token.selfClosing) foreignContentDepth += 1;
      }
      cursor = token.end;
      continue;
    }

    // In the "in select" insertion mode, browser parsers ignore ordinary
    // body/article-style start and end tags. Keeping them out of the active
    // token stream prevents markup inside a select from inventing ownership
    // roots. An unclosed select also hides later shell boundaries, which makes
    // the surrounding canonical root fail closed as unbalanced.
    if (selectDepth > 0) {
      if (token.name === 'select' && token.closing) {
        selectDepth = 0;
        tokens.push(token);
      } else if (!token.closing && token.name === 'select') {
        // A nested select start tag closes the current select; the new token is
        // consumed rather than reprocessed as another opening select.
        selectDepth = 0;
      } else if (!token.closing && token.name === 'textarea') {
        // HTML's "in select" mode pops the select then reprocesses textarea in
        // the normal insertion mode, entering RCDATA until its real end tag.
        selectDepth = 0;
        if (includeRawTextOpeningTags) tokens.push(token);
        cursor = findRawTextClose(source, lowerSource, token.name, token.end);
        continue;
      } else if (!token.closing && (token.name === 'input' || token.name === 'keygen')) {
        // These start tags likewise pop the select and are then reprocessed.
        selectDepth = 0;
        tokens.push(token);
      } else if (
        !token.closing &&
        RAW_TEXT_ELEMENTS.has(token.name) &&
        !(includeNoscriptContent && token.name === 'noscript')
      ) {
        // Script-supporting elements remain active in the browser's "in
        // select" insertion mode. Expose their opening tag to security
        // callers while continuing to ignore their raw-text body.
        if (includeRawTextOpeningTags) tokens.push(token);
        cursor = findRawTextClose(source, lowerSource, token.name, token.end);
        continue;
      }
      cursor = token.end;
      continue;
    }

    if (!token.closing && FOREIGN_CONTENT_ROOTS.has(token.name)) {
      tokens.push({ ...token, foreignContent: true });
      if (!token.selfClosing) foreignContentDepth = 1;
      cursor = token.end;
      continue;
    }

    if (!token.closing && token.name === 'template') {
      const shadowRootMode = readHtmlAttribute(token.raw, 'shadowrootmode');
      const legacyShadowRoot = readHtmlAttribute(token.raw, 'shadowroot');
      if (shadowRootMode.present || legacyShadowRoot.present) {
        tokens.push({ ...token, declarativeShadow: true });
        if (!token.selfClosing) declarativeShadowDepth = 1;
        cursor = token.end;
        continue;
      }
      templateDepth = 1;
      cursor = token.end;
      continue;
    }
    if (!token.closing && token.name === 'select') {
      tokens.push(token);
      selectDepth = 1;
      cursor = token.end;
      continue;
    }
    if (!token.closing && RAW_TEXT_ELEMENTS.has(token.name) && !(includeNoscriptContent && token.name === 'noscript')) {
      if (includeRawTextOpeningTags) tokens.push(token);
      cursor = findRawTextClose(source, lowerSource, token.name, token.end);
      continue;
    }

    tokens.push(token);
    cursor = token.end;
  }

  return tokens;
}

export function decodeHtmlAttributeValue(value) {
  return String(value || '')
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (entity, hex, decimal) => {
      const codePoint = Number.parseInt(hex || decimal, hex ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;
      if (codePoint === 0 || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return '\ufffd';
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    })
    .replace(
      /&(amp|apos|bsol|colon|gt|lt|nbsp|newline|quot|sol|tab);?/gi,
      (entity, name) => NAMED_ATTRIBUTE_ENTITIES[name.toLowerCase()] ?? entity
    );
}

function isHtmlSpace(character) {
  return character === '\t' || character === '\n' || character === '\f' ||
    character === '\r' || character === ' ';
}

/**
 * Parse attributes from one start-tag token.
 *
 * This intentionally follows the HTML tokenizer's attribute boundaries rather
 * than using a regular expression. In particular, text such as
 * `title=" id=decoy"` is one title value, and `/` remains valid in an unquoted
 * value such as `href=/wiki/page.html`.
 */
export function readHtmlAttributes(openingTag) {
  const source = String(openingTag || '');
  const startMatch = source.match(/^<([a-z][^\t\n\f\r />]*)/i);
  if (!startMatch) return [];

  const attributes = [];
  let cursor = startMatch[0].length;

  while (cursor < source.length) {
    while (isHtmlSpace(source[cursor])) cursor += 1;
    if (cursor >= source.length || source[cursor] === '>') break;

    // A slash encountered before an attribute name enters the self-closing
    // state. If malformed, browsers discard the slash and resume attribute
    // parsing, so advancing one character is the conservative equivalent.
    if (source[cursor] === '/') {
      cursor += 1;
      continue;
    }

    const nameStart = cursor;
    while (
      cursor < source.length &&
      !isHtmlSpace(source[cursor]) &&
      source[cursor] !== '/' &&
      source[cursor] !== '>' &&
      source[cursor] !== '='
    ) {
      cursor += 1;
    }

    if (cursor === nameStart) {
      cursor += 1;
      continue;
    }

    const name = source.slice(nameStart, cursor).toLowerCase();
    while (isHtmlSpace(source[cursor])) cursor += 1;

    let rawValue = null;
    let quote = '';
    if (source[cursor] === '=') {
      cursor += 1;
      while (isHtmlSpace(source[cursor])) cursor += 1;

      quote = source[cursor] === '"' || source[cursor] === "'"
        ? source[cursor]
        : '';
      if (quote) {
        cursor += 1;
        const valueStart = cursor;
        while (cursor < source.length && source[cursor] !== quote) cursor += 1;
        rawValue = source.slice(valueStart, cursor);
        if (source[cursor] === quote) cursor += 1;
      } else {
        const valueStart = cursor;
        // `/` is data in the unquoted-value state. A self-closing slash is
        // recognized only after whitespace or a quoted value.
        while (
          cursor < source.length &&
          !isHtmlSpace(source[cursor]) &&
          source[cursor] !== '>'
        ) {
          cursor += 1;
        }
        rawValue = source.slice(valueStart, cursor);
      }
    }

    attributes.push({
      name,
      value: rawValue === null ? null : decodeHtmlAttributeValue(rawValue),
      rawValue,
      quote,
    });
  }

  return attributes;
}

export function readHtmlAttribute(openingTag, attributeName) {
  const expectedName = String(attributeName || '').toLowerCase();
  const attribute = readHtmlAttributes(openingTag)
    .find(({ name }) => name === expectedName);
  return attribute
    ? { present: true, value: attribute.value }
    : { present: false, value: null };
}

/**
 * Return syntactically valid tag tokens without treating template/raw-text
 * contents as inert. This is used only for fail-closed validation of supplied
 * markup, where executable-looking controls are rejected even in a template.
 */
export function tokenizeHtmlTagsLexically(value) {
  const source = String(value || '');
  const tokens = [];
  let cursor = 0;

  while (cursor < source.length) {
    const nextTag = source.indexOf('<', cursor);
    if (nextTag < 0) break;
    cursor = nextTag;

    if (source.startsWith('<!--', cursor)) {
      cursor = findCommentEnd(source, cursor);
      continue;
    }

    const declarationEnd = findMarkupDeclarationEnd(source, cursor);
    if (declarationEnd !== null) {
      cursor = declarationEnd;
      continue;
    }

    const token = parseTag(source, cursor);
    if (!token) break;
    if (token.type === 'tag') {
      tokens.push(token);
      cursor = token.end;
    } else {
      cursor += 1;
    }
  }

  return tokens;
}

function classNames(openingTag) {
  const attribute = readHtmlAttribute(openingTag, 'class');
  return attribute.present && attribute.value !== null
    ? attribute.value.split(/[\t\n\f\r ]+/).filter(Boolean)
    : [];
}

export function findFirstActiveOpeningTag(value, tagName) {
  const source = String(value || '');
  const expectedName = String(tagName || '').toLowerCase();
  const tokens = tokenizeActiveHtml(source);
  const opening = tokens.find((token) =>
    token.type === 'tag' &&
    !token.closing &&
    token.name === expectedName &&
    token.foreignContent !== true &&
    token.shadowContent !== true
  ) || null;
  const prefix = opening ? source.slice(0, opening.start) : '';
  if (
    opening &&
    expectedName === 'body' &&
    tokens.some((token) =>
      token.type === 'tag' &&
      !token.closing &&
      (token.name === 'frame' || token.name === 'frameset') &&
      token.foreignContent !== true &&
      token.shadowContent !== true &&
      token.start < opening.start
    )
  ) {
    // A frameset document's root body is the frameset element. A later body
    // token is ignored by the browser and must not confer stub authority.
    return null;
  }
  if (
    opening &&
    expectedName === 'body' &&
    /<script(?=[\t\n\f\r />])[^>]*>[\s\S]*?<!--[\s\S]*?<script(?=[\t\n\f\r />])/i.test(prefix)
  ) {
    // Script data's escaped/double-escaped substates cannot be reduced to a
    // first-`</script>` search safely. Root authority callers must fail closed
    // instead of accepting a body-looking token exposed by an ambiguous head
    // script double-escaped state. Ordinary JSON-LD/inline head scripts remain
    // valid; only the ambiguity-producing `<!-- ... <script` shape fails shut.
    return null;
  }
  return opening;
}

function findMatchingClose(tokens, openingIndex) {
  const opening = tokens[openingIndex];
  if (!opening || opening.type !== 'tag' || opening.closing || opening.selfClosing) return null;
  let depth = 1;
  for (let index = openingIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.foreignContent === true || token.shadowContent === true) continue;
    if (token.type !== 'tag' || token.name !== opening.name) continue;
    if (!token.closing && !token.selfClosing) depth += 1;
    if (token.closing) depth -= 1;
    if (depth === 0) return { token, index };
  }
  return null;
}

const CANONICAL_CONTENT_ROOT_ELEMENTS = new Set(['article', 'div']);

function isCanonicalContentRootToken(token) {
  if (
    token.type !== 'tag' ||
    token.closing ||
    token.foreignContent === true ||
    token.shadowContent === true ||
    !CANONICAL_CONTENT_ROOT_ELEMENTS.has(token.name)
  ) return false;
  return token.name === 'article' || classNames(token.raw).includes('wiki-content');
}

function unsafeCanonicalRootIndices(tokens) {
  const unsafe = new Set();
  const stack = [];
  let framesetSeen = false;

  for (const [index, token] of tokens.entries()) {
    if (
      token.type !== 'tag' ||
      token.foreignContent === true ||
      token.shadowContent === true
    ) continue;

    if (!token.closing && isCanonicalContentRootToken(token)) {
      const tableIndex = stack.map(({ name }) => name).lastIndexOf('table');
      // Even a root initially created in a cell/caption can be implicitly
      // popped by a later row/cell/caption boundary before its textual end
      // tag. Canonical page roots never need to live inside a table, so reject
      // every such context while continuing to allow tables inside the root.
      if (framesetSeen || tableIndex >= 0) unsafe.add(index);
    }

    if (!token.closing) {
      if (token.name === 'frame' || token.name === 'frameset') framesetSeen = true;
      // A self-closing flag on a non-void HTML element is ignored by browsers.
      // Keep such table/cell contexts on the source stack for fail-closed root
      // classification even if parseTag recorded the syntactic slash.
      if (!VOID_ELEMENTS.has(token.name)) stack.push(token);
      continue;
    }

    const openingIndex = stack.map(({ name }) => name).lastIndexOf(token.name);
    if (openingIndex >= 0) stack.splice(openingIndex);
  }

  return unsafe;
}

/** Select the canonical outer content root and preserve nested article cards. */
export function selectCanonicalContentRoot(value) {
  const source = String(value || '');
  const tokens = tokenizeActiveHtml(source);
  const unsafeRootIndices = unsafeCanonicalRootIndices(tokens);
  const openingIndex = tokens.findIndex((token, index) =>
    isCanonicalContentRootToken(token) && !unsafeRootIndices.has(index)
  );
  if (openingIndex < 0) return { source, tokens, root: null, siblingRoots: [] };

  const opening = tokens[openingIndex];
  const closing = findMatchingClose(tokens, openingIndex);
  const root = closing ? {
    opening,
    closing: closing.token,
    openingIndex,
    closingIndex: closing.index,
    start: opening.start,
    end: closing.token.end,
    contentStart: opening.end,
    contentEnd: closing.token.start,
  } : null;

  const siblingRoots = [];
  if (root) {
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (
        !isCanonicalContentRootToken(token) ||
        unsafeRootIndices.has(index) ||
        token.start === opening.start
      ) continue;
      if (token.start < root.contentStart || token.start >= root.contentEnd) siblingRoots.push(token);
    }
  }
  return { source, tokens, root, siblingRoots, unclosedRoot: opening && !closing ? opening : null };
}

export function extractCanonicalContentHtml(value) {
  const selected = selectCanonicalContentRoot(value);
  return selected.root
    ? selected.source.slice(selected.root.contentStart, selected.root.contentEnd)
    : '';
}

function literalCount(source, marker) {
  return (String(source || '').match(new RegExp(escapeRegex(marker), 'gi')) || []).length;
}

/**
 * Validate ownership-marker placement against real, balanced content roots.
 * Definitions are objects with label/begin/end and optional maxBlocks.
 */
export function inspectOwnershipTopology(value, definitions) {
  const selected = selectCanonicalContentRoot(value);
  const errors = [];
  const blocks = [];

  if (selected.unclosedRoot) errors.push('canonical article/wiki-content container is unclosed');
  if (selected.siblingRoots.length > 0) {
    errors.push(`multiple sibling article/wiki-content roots (${selected.siblingRoots.length + 1})`);
  }
  if (selected.root) {
    const escapingBoundary = selected.tokens.find((token) =>
      token.type === 'tag' &&
      token.closing &&
      ['body', 'html', 'main'].includes(token.name) &&
      token.start >= selected.root.contentStart &&
      token.start < selected.root.contentEnd
    );
    if (escapingBoundary) {
      errors.push(`canonical article/wiki-content container contains escaping </${escapingBoundary.name}> boundary`);
    }
  }

  for (const definition of definitions) {
    const beginRawCount = literalCount(selected.source, definition.begin);
    const endRawCount = literalCount(selected.source, definition.end);
    const events = selected.tokens
      .filter((token) =>
        token.type === 'comment' &&
        token.foreignContent !== true &&
        token.shadowContent !== true
      )
      .flatMap((token) => {
        if (token.raw.toLowerCase() === definition.begin.toLowerCase()) return [{ kind: 'begin', token }];
        if (token.raw.toLowerCase() === definition.end.toLowerCase()) return [{ kind: 'end', token }];
        return [];
      });
    const activeBeginCount = events.filter((event) => event.kind === 'begin').length;
    const activeEndCount = events.filter((event) => event.kind === 'end').length;
    if (beginRawCount !== activeBeginCount || endRawCount !== activeEndCount) {
      errors.push(`${definition.label} markers must be active standalone HTML comments`);
    }

    let open = null;
    let blockCount = 0;
    for (const event of events) {
      if (event.kind === 'begin') {
        if (open) errors.push(`${definition.label} blocks must not nest or overlap`);
        else open = event.token;
        continue;
      }
      if (!open) {
        errors.push(`${definition.label} end marker appears before its begin marker`);
        continue;
      }
      const block = {
        label: definition.label,
        start: open.start,
        end: event.token.end,
        contentStart: open.end,
        contentEnd: event.token.start,
      };
      blocks.push(block);
      blockCount += 1;
      open = null;
    }
    if (open) errors.push(`${definition.label} begin marker has no matching end marker`);
    if (definition.maxBlocks !== undefined && blockCount > definition.maxBlocks) {
      errors.push(`${definition.label} has ${blockCount} blocks; maximum is ${definition.maxBlocks}`);
    }
  }

  const sortedBlocks = [...blocks].sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < sortedBlocks.length; index += 1) {
    const previous = sortedBlocks[index - 1];
    const current = sortedBlocks[index];
    if (current.start < previous.end) {
      errors.push(`${previous.label} and ${current.label} ownership blocks overlap`);
    }
  }

  if (blocks.length > 0 && !selected.root) {
    errors.push('ownership blocks require a canonical article/wiki-content container');
  } else if (selected.root) {
    for (const block of blocks) {
      if (block.start < selected.root.contentStart || block.end > selected.root.contentEnd) {
        errors.push(`${block.label} block must be wholly inside the canonical article/wiki-content container`);
      }
      if (block.label === 'SAM_CONTENT') {
        const wrapsArticle = selected.tokens.some((token) =>
          token.type === 'tag' && !token.closing && token.name === 'article' &&
          token.start >= block.contentStart && token.start < block.contentEnd
        );
        if (wrapsArticle) errors.push('SAM_CONTENT block must not wrap an article element');
      }
    }
  }

  return { ...selected, blocks, errors: [...new Set(errors)] };
}
