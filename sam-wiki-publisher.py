#!/usr/bin/env python3
"""
sam-wiki-publisher.py
=====================
Preservation-first wiki publisher for Crypto Moonboys Wiki.

Supports either:
- direct export JSON with {"items": [...]}
- SAM memory JSON with {"facts": {...}}
- SAM entity-map JSON with {"entities": {...}}

Preservation rules:
- NEVER mass-deletes wiki/*.html files
- Repository content state, not SAM memory, decides whether a page can be changed
- Existing SAM-owned prose is replaced in place, never appended as a second block
- Manual, canonical, legacy-unmarked, and locked prose is never overwritten
- A new stub page is generated ONLY when the manifest explicitly allows it and no
  real article file exists for the entity
- Stub pages are clearly marked with data-wiki-stub="true" and a visible stub notice

Requirements:
    pip install python-slugify

Usage:
    python3 sam-wiki-publisher.py
    python3 sam-wiki-publisher.py path/to/data.json
"""

import argparse
import errno
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from html import escape, unescape
from html.parser import HTMLParser
from typing import Any, Callable
from urllib.parse import urljoin, urlparse

try:
    from slugify import slugify
except ImportError:  # pragma: no cover - exercised only in minimal environments
    def slugify(value: str) -> str:
        """Small dependency-free fallback for the repository's ASCII slugs."""
        normalized = unicodedata.normalize("NFKD", str(value or ""))
        ascii_value = normalized.encode("ascii", "ignore").decode("ascii").lower()
        return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", ascii_value))

BASE_URL = "https://cryptomoonboys.com/wiki/"
SEARCH_HUB_URL = "https://cryptomoonboys.com/search.html"
WIKI_DIR = "wiki"
SITEMAP_PATH = "sitemap.xml"
DEFAULT_INPUT = "main-brain-export.json"
CONTENT_STATE_MANIFEST = "brand-canon/wiki-content-state.json"
CONTENT_STATE_REPORT = "brand-canon/wiki-rewrite-audit.md"
CONTENT_STATE_GENERATOR = "scripts/generate-wiki-content-state.mjs"
ABSENT_STUB_REGISTRY = "brand-canon/wiki-absent-stubs.json"
PUBLISH_TRANSACTION_LOCK = ".wiki-content-publish.lock"

MANUAL_CONTENT_BEGIN = "<!-- MANUAL_CONTENT:BEGIN -->"
MANUAL_CONTENT_END = "<!-- MANUAL_CONTENT:END -->"
SAM_CONTENT_BEGIN = "<!-- SAM_CONTENT:BEGIN -->"
SAM_CONTENT_END = "<!-- SAM_CONTENT:END -->"
CANONICAL_CONTENT_BEGIN = "<!-- CANONICAL_CONTENT:BEGIN -->"
CANONICAL_CONTENT_END = "<!-- CANONICAL_CONTENT:END -->"

AUTOMATION_POLICIES = {
    "metadata-only",
    "replace-sam-block",
    "canon-locked",
    "stub-allowed",
}

PROSE_FIELDS = ("article_html", "sam_content_html")
UNSUPPORTED_PROSE_FIELDS = ("article_body", "body_html", "prose_html")
EXPECTED_HASH_FIELDS = ("expected_content_hash", "base_content_hash")
EXPECTED_BLOB_FIELDS = (
    "expected_git_blob_oid",
    "base_git_blob_oid",
    "expected_blob_id",
    "base_blob_id",
)
EXPECTED_REVISION_FIELDS = ("expected_revision", "base_revision")

# Retained for compatibility with callers that import this constant. Word count
# is no longer an ownership signal: only an explicit data-wiki-stub marker and
# the repository manifest can authorize a stub refresh.
STUB_WORD_THRESHOLD = 400
MAX_STUB_SUMMARY_WORDS = 250
DANGEROUS_URL_ATTRIBUTES = frozenset({
    "action", "archive", "background", "cite", "classid", "codebase",
    "data", "dynsrc", "formaction", "href", "longdesc", "lowsrc",
    "manifest", "ping", "poster", "profile", "src", "srcset", "usemap",
})


class PublisherSafetyError(RuntimeError):
    """Raised when a publish request cannot prove it is safe and current."""


@dataclass(frozen=True)
class OwnershipState:
    manual_blocks: int
    sam_blocks: int
    canonical_blocks: int
    legacy_unmarked: bool
    explicit_stub: bool


@dataclass(frozen=True)
class PublishPlan:
    action: str
    out_path: str
    html: str | None = None
    message: str = ""
    creates_page: bool = False
    base_content_hash: str | None = None
    authorization_manifest_identity: "ContentStateManifestIdentity | None" = None


@dataclass(frozen=True)
class ContentStateManifestIdentity:
    """Exact repository manifest bytes used to authorize a publish plan."""

    content_bytes: bytes
    content_hash: str
    byte_length: int


class ContentStateRecord(dict):
    """Immutable manifest record carrying its non-serialised source identity."""

    def __init__(
        self,
        record: dict,
        manifest_identity: ContentStateManifestIdentity,
    ) -> None:
        super().__init__(record)
        self.manifest_identity = manifest_identity

    @staticmethod
    def _reject_mutation(*_args, **_kwargs):
        raise TypeError(
            "loaded content-state records are immutable authorization evidence"
        )

    __setitem__ = _reject_mutation
    __delitem__ = _reject_mutation
    __ior__ = _reject_mutation
    clear = _reject_mutation
    pop = _reject_mutation
    popitem = _reject_mutation
    setdefault = _reject_mutation
    update = _reject_mutation


class ContentStateManifest(dict):
    """Indexed content state bound to the exact bytes it was parsed from."""

    def __init__(
        self,
        records: dict[str, ContentStateRecord],
        identity: ContentStateManifestIdentity,
    ) -> None:
        super().__init__(records)
        self.identity = identity


@dataclass(frozen=True)
class FileSnapshot:
    existed: bool
    content: bytes = b""
    mode: int | None = None
    device: int | None = None
    inode: int | None = None


@dataclass(frozen=True)
class AnchoredFile:
    path: str
    parent_path: str
    name: str
    parent_fd: int
    parent_device: int
    parent_inode: int


@dataclass
class AppliedFileMutation:
    target: AnchoredFile
    before: FileSnapshot
    quarantine_name: str | None
    installed_content: bytes
    installed_mode: int
    installed_device: int
    installed_inode: int
    install_complete: bool = False


@dataclass
class RepositoryPublishLock:
    repo_root: str
    path: str
    name: str
    root_fd: int
    lock_fd: int
    device: int
    inode: int
    active: bool = True


@dataclass
class ParsedHtmlElement:
    tag: str
    attrs: tuple[tuple[str, str | None], ...]
    start: int
    open_end: int
    parent: int | None
    close_start: int | None = None
    end: int | None = None
    explicit_close: bool = False


@dataclass(frozen=True)
class OwnershipInterval:
    label: str
    start: int
    content_start: int
    content_end: int
    end: int


def esc(value: str) -> str:
    return escape(str(value or ""), quote=True)


def first_non_empty(*values: Any) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def clean_title(value: str) -> str:
    value = first_non_empty(value)
    return value.replace(" — Crypto Moonboys Wiki", "").strip()


def extract_first_source_url(data: dict) -> str:
    for key in ("sources", "source_urls"):
        sources = data.get(key, [])
        if isinstance(sources, list):
            for source in sources:
                if isinstance(source, str) and source.strip():
                    return source.strip()
    canonical_url = data.get("canonical_url")
    if isinstance(canonical_url, str) and canonical_url.strip():
        return canonical_url.strip()
    return "#"


def infer_summary(data: dict) -> str:
    aliases = data.get("alias_candidates", [])
    tags = data.get("tags", [])
    category = first_non_empty(data.get("category"))

    alias_text = ", ".join(a for a in aliases if isinstance(a, str) and a.strip())
    tag_text = ", ".join(t for t in tags if isinstance(t, str) and t.strip())

    fallback = ""
    if category or alias_text or tag_text:
        parts = []
        if category:
            parts.append(f"Category: {category}.")
        if alias_text:
            parts.append(f"Aliases: {alias_text}.")
        if tag_text:
            parts.append(f"Tags: {tag_text}.")
        fallback = " ".join(parts)

    return first_non_empty(
        data.get("summary"),
        data.get("description"),
        data.get("bio"),
        data.get("overview"),
        data.get("lore"),
        data.get("text"),
        fallback,
        "",
    )


def infer_mention_count(data: dict) -> int:
    for key in ("mention_count", "mentions"):
        raw_value = data.get(key, 0)
        try:
            return int(raw_value)
        except (TypeError, ValueError):
            continue
    return 0


def copy_publish_control_fields(source: dict, target: dict) -> None:
    """Preserve repository concurrency fields carried by SAM exports.

    These fields are evidence supplied by the caller, not memory-based ownership
    decisions. The publisher still checks every value against the repository
    manifest and the bytes on disk before it writes anything.
    """
    for key in (*PROSE_FIELDS, *UNSUPPORTED_PROSE_FIELDS, *EXPECTED_HASH_FIELDS,
                *EXPECTED_BLOB_FIELDS, *EXPECTED_REVISION_FIELDS,
                "content_hash", "article_content_hash", "slug"):
        if key in source:
            target[key] = source[key]


def sam_facts_to_items(raw: dict) -> list[dict]:
    facts = raw.get("facts", {})
    if not isinstance(facts, dict):
        return []

    items: list[dict] = []

    for category, entities in facts.items():
        if not isinstance(entities, dict):
            continue

        for entity_name, data in entities.items():
            if not isinstance(entity_name, str) or not entity_name.strip():
                continue
            if not isinstance(data, dict):
                data = {}

            item = {
                "entity_name": entity_name.strip(),
                "summary": infer_summary(data),
                "source_url": extract_first_source_url(data),
                "source_name": "SAM Memory",
                "category": str(category).strip(),
                "mention_count": infer_mention_count(data),
            }
            copy_publish_control_fields(data, item)
            items.append(item)

    return items


def sam_entities_to_items(raw: dict) -> list[dict]:
    entities = raw.get("entities", {})
    if not isinstance(entities, dict):
        return []

    items: list[dict] = []

    for entity_key, data in entities.items():
        if not isinstance(data, dict):
            continue

        entity_name = clean_title(
            data.get("canonical_title") or data.get("title") or str(entity_key)
        )

        if not entity_name:
            continue

        source_url = extract_first_source_url(data)
        item = {
            "entity_name": entity_name,
            "summary": infer_summary(data),
            "source_url": source_url,
            "source_name": "SAM Entity Memory",
            "category": first_non_empty(data.get("category"), "entities"),
            "mention_count": infer_mention_count(data),
        }
        copy_publish_control_fields(data, item)
        items.append(item)

    return items


VOID_HTML_ELEMENTS = frozenset({
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
})
INERT_HTML_ELEMENTS = frozenset({
    "iframe", "noembed", "noframes", "noscript", "plaintext", "script",
    "style", "template", "textarea", "title", "xmp",
})
PROSE_PARSER_BOUNDARY_ELEMENTS = INERT_HTML_ELEMENTS | frozenset({
    "optgroup", "option", "select",
})
FOREIGN_ACTIVE_CONTENT_ELEMENTS = frozenset({
    "animate", "animatemotion", "animatetransform", "discard",
    "foreignobject", "math", "mpath", "set", "svg",
})
OWNERSHIP_MARKERS = (
    ("MANUAL_CONTENT", MANUAL_CONTENT_BEGIN, MANUAL_CONTENT_END),
    ("SAM_CONTENT", SAM_CONTENT_BEGIN, SAM_CONTENT_END),
    ("CANONICAL_CONTENT", CANONICAL_CONTENT_BEGIN, CANONICAL_CONTENT_END),
)


class _DocumentStructureParser(HTMLParser):
    """Collect security-sensitive HTML structure without trusting regex roots.

    HTMLParser handles comments and raw-text elements for us. Template and the
    remaining inert/raw-text containers are tracked explicitly so markup-looking
    strings inside them can never grant repository ownership.
    """

    def __init__(self, source: str):
        super().__init__(convert_charrefs=True)
        self.source = source
        self.line_starts = [0]
        self.line_starts.extend(match.end() for match in re.finditer(r"\n", source))
        self.elements: list[ParsedHtmlElement] = []
        self.control_elements: list[ParsedHtmlElement] = []
        self.attribute_elements: list[ParsedHtmlElement] = []
        self.open_elements: list[int] = []
        self.inert_elements: list[str] = []
        self.active_comment_starts: set[int] = set()
        self.unmatched_end_tags: list[str] = []
        self.declarations: list[str] = []

    def _offset(self) -> int:
        line, column = self.getpos()
        return self.line_starts[line - 1] + column

    def _opening_end(self, start: int) -> int:
        opening = self.get_starttag_text() or ""
        return min(len(self.source), start + len(opening))

    def _closing_end(self, start: int) -> int:
        closing = self.source.find(">", start)
        return len(self.source) if closing < 0 else closing + 1

    def _start_element(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        tag = tag.lower()
        attribute_start = self._offset()
        self.attribute_elements.append(ParsedHtmlElement(
            tag=tag,
            attrs=tuple((name.lower(), value) for name, value in attrs),
            start=attribute_start,
            open_end=self._opening_end(attribute_start),
            parent=self.open_elements[-1] if self.open_elements else None,
        ))
        if self.inert_elements:
            if tag in INERT_HTML_ELEMENTS:
                self.inert_elements.append(tag)
            return
        if tag in INERT_HTML_ELEMENTS:
            start = self._offset()
            self.control_elements.append(ParsedHtmlElement(
                tag=tag,
                attrs=tuple((name.lower(), value) for name, value in attrs),
                start=start,
                open_end=self._opening_end(start),
                parent=self.open_elements[-1] if self.open_elements else None,
            ))
            self.inert_elements.append(tag)
            return

        start = self._offset()
        open_end = self._opening_end(start)
        element = ParsedHtmlElement(
            tag=tag,
            attrs=tuple((name.lower(), value) for name, value in attrs),
            start=start,
            open_end=open_end,
            parent=self.open_elements[-1] if self.open_elements else None,
        )
        element_index = len(self.elements)
        self.elements.append(element)

        # In HTML, a slash on a non-void start tag is ignored. Model browser
        # behaviour rather than allowing <article/> to create a fake empty root.
        is_void = tag in VOID_HTML_ELEMENTS
        if is_void:
            element.close_start = open_end
            element.end = open_end
            element.explicit_close = True
        else:
            self.open_elements.append(element_index)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._start_element(tag, attrs)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._start_element(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self.inert_elements:
            # <plaintext> has no HTML end tag; once entered, all remaining bytes
            # are text and cannot contain an ownership root.
            if self.inert_elements[-1] == "plaintext":
                return
            if tag in self.inert_elements:
                match_index = len(self.inert_elements) - 1 - self.inert_elements[::-1].index(tag)
                del self.inert_elements[match_index:]
            return

        matching_stack_index = next(
            (
                index for index in range(len(self.open_elements) - 1, -1, -1)
                if self.elements[self.open_elements[index]].tag == tag
            ),
            None,
        )
        if matching_stack_index is None:
            self.unmatched_end_tags.append(tag)
            return

        start = self._offset()
        end = self._closing_end(start)
        # Elements above the matching close are only implicitly closed. A
        # security-sensitive content/canonical root must have its own balanced
        # closing tag and will be rejected later if it is one of these.
        for element_index in self.open_elements[matching_stack_index + 1:]:
            element = self.elements[element_index]
            element.close_start = start
            element.end = start
            element.explicit_close = False
        element = self.elements[self.open_elements[matching_stack_index]]
        element.close_start = start
        element.end = end
        element.explicit_close = True
        del self.open_elements[matching_stack_index:]

    def handle_comment(self, _data: str) -> None:
        if not self.inert_elements:
            self.active_comment_starts.add(self._offset())

    def handle_decl(self, declaration: str) -> None:
        if not self.inert_elements:
            self.declarations.append(declaration)


def _parse_html_document(html: str) -> _DocumentStructureParser:
    source = str(html or "")
    parser = _DocumentStructureParser(source)
    try:
        parser.feed(source)
        parser.close()
    except Exception as exc:
        raise PublisherSafetyError(f"cannot safely parse HTML structure: {exc}") from exc
    return parser


def _element_attr_values(element: ParsedHtmlElement, name: str) -> list[str | None]:
    expected = name.casefold()
    return [value for attr_name, value in element.attrs if attr_name.casefold() == expected]


def _element_has_class(element: ParsedHtmlElement, class_name: str) -> bool:
    expected = class_name.casefold()
    return any(
        expected in {token.casefold() for token in str(value or "").split()}
        for value in _element_attr_values(element, "class")
    )


def _is_descendant(
    parser: _DocumentStructureParser,
    child_index: int,
    ancestor_indexes: set[int],
) -> bool:
    parent = parser.elements[child_index].parent
    while parent is not None:
        if parent in ancestor_indexes:
            return True
        parent = parser.elements[parent].parent
    return False


def _has_ancestor_tag(
    parser: _DocumentStructureParser,
    element_index: int,
    tag_names: set[str],
) -> bool:
    parent = parser.elements[element_index].parent
    while parent is not None:
        if parser.elements[parent].tag in tag_names:
            return True
        parent = parser.elements[parent].parent
    return False


def _select_content_root(
    parser: _DocumentStructureParser,
    *,
    required: bool = False,
) -> ParsedHtmlElement | None:
    candidate_indexes = [
        index for index, element in enumerate(parser.elements)
        if element.tag == "article" or _element_has_class(element, "wiki-content")
    ]
    if any(
        _has_ancestor_tag(parser, index, {"select"})
        for index in candidate_indexes
    ):
        raise PublisherSafetyError(
            "article/wiki-content roots inside select are not active browser content roots"
        )
    candidate_set = set(candidate_indexes)
    outer_indexes = [
        index for index in candidate_indexes
        if not _is_descendant(parser, index, candidate_set)
    ]
    if len(outer_indexes) > 1:
        raise PublisherSafetyError(
            f"multiple sibling article/wiki-content roots are invalid ({len(outer_indexes)})"
        )
    if not outer_indexes:
        if required:
            raise PublisherSafetyError("ownership blocks require one article/wiki-content root")
        return None
    root = parser.elements[outer_indexes[0]]
    if not root.explicit_close or root.close_start is None or root.end is None:
        raise PublisherSafetyError("article/wiki-content root must have a balanced closing tag")
    return root


def _root_declares_stub(source: str, element: ParsedHtmlElement) -> bool:
    values = _element_attr_values(element, "data-wiki-stub")
    if len(values) != 1 or str(values[0] or "").casefold() != "true":
        return False
    # Preserve the explicit byte-level ownership contract. Attribute values are
    # decoded for control-ID validation, but an ownership grant must literally
    # spell data-wiki-stub="true" on the selected root.
    opening = source[element.start:element.open_end]
    return bool(re.search(
        r'(?:^|[\t\n\f\r ])data-wiki-stub[\t\n\f\r ]*=[\t\n\f\r ]*'
        r'["\']true["\'](?=[\t\n\f\r />])',
        opening,
        re.I,
    ))


def _document_is_explicit_stub(
    source: str,
    parser: _DocumentStructureParser,
) -> bool:
    body_indexes = [
        index for index, element in enumerate(parser.elements) if element.tag == "body"
    ]
    article_indexes = [
        index for index, element in enumerate(parser.elements) if element.tag == "article"
    ]
    if any(
        _has_ancestor_tag(parser, index, {"select"})
        for index in [*body_indexes, *article_indexes]
    ):
        raise PublisherSafetyError(
            "body/article roots inside select are not active browser content roots"
        )
    if len(body_indexes) > 1:
        return False
    if body_indexes:
        body_parent = parser.elements[body_indexes[0]].parent
        if (
            body_parent is not None
            and parser.elements[body_parent].tag != "html"
        ):
            return False
    return bool(
        body_indexes
        and _root_declares_stub(source, parser.elements[body_indexes[0]])
    )


def mask_html_comments(html: str) -> str:
    """Mask ordinary comments without moving offsets in the original HTML."""
    return re.sub(r"<!--[\s\S]*?(?:-->|--!>)", lambda match: " " * len(match.group(0)), str(html or ""))


def is_explicit_stub_html(html: str) -> bool:
    """Return whether the one actual body root grants whole-page stub ownership."""
    source = str(html or "")
    try:
        parser = _parse_html_document(source)
        _select_content_root(parser)
    except PublisherSafetyError:
        return False
    return _document_is_explicit_stub(source, parser)


def _raw_inert_element_inner(source: str, element: ParsedHtmlElement) -> str:
    closing = re.search(
        rf"</[\t\n\f\r ]*{re.escape(element.tag)}(?=[\t\n\f\r />])[^>]*>",
        source[element.open_end:],
        re.I,
    )
    content_end = (
        element.open_end + closing.start() if closing is not None else len(source)
    )
    return source[element.open_end:content_end]


def _url_origin(value: str) -> tuple[str, str, int | None] | None:
    try:
        parsed = urlparse(value)
        scheme = parsed.scheme.casefold()
        hostname = (parsed.hostname or "").casefold()
        if not scheme or not hostname:
            return None
        port = parsed.port
    except ValueError:
        return None
    if port is None:
        port = 443 if scheme == "https" else 80 if scheme == "http" else None
    return scheme, hostname, port


def redirects_to_other_wiki_page(html: str, slug: str) -> bool:
    source = str(html or "")
    parser = _parse_html_document(source)
    for element in parser.elements:
        if element.tag == "meta" and any(
            str(value or "").strip().rstrip("/").casefold() == "refresh"
            for value in _element_attr_values(element, "http-equiv")
        ):
            return True

    for element in parser.control_elements:
        if element.tag == "noscript" and re.search(
            r"<[\t\n\f\r ]*(?:link|meta)(?=[\t\n\f\r />])",
            _raw_inert_element_inner(source, element),
            re.I,
        ):
            return True

    # Match the JavaScript publisher's legacy-script guard as well as its
    # structural meta/link checks. Existing generated stubs that redirect are
    # aliases, not disposable pages.
    script_redirect = re.compile(
        r"\b(?:window\s*\.\s*)?location\s*"
        r"(?:=|\.\s*href\s*=|\.\s*(?:assign|replace)\s*\()",
        re.I,
    )
    for element in parser.control_elements:
        if element.tag != "script":
            continue
        if script_redirect.search(_raw_inert_element_inner(source, element)):
            return True

    expected_url = f"{BASE_URL}{slug}.html"
    expected_parts = urlparse(expected_url)
    expected_identity = (
        _url_origin(expected_url),
        expected_parts.path,
        expected_parts.query,
    )
    for element in parser.elements:
        if element.tag != "link" or not any(
            "canonical" in {
                token.rstrip("/").casefold()
                for token in str(value or "").split()
            }
            for value in _element_attr_values(element, "rel")
        ):
            continue
        href_values = _element_attr_values(element, "href")
        href = str(href_values[0] or "").strip() if href_values else ""
        if not href:
            return True
        resolved = urljoin(expected_url, href)
        resolved_parts = urlparse(resolved)
        resolved_identity = (
            _url_origin(resolved),
            resolved_parts.path,
            resolved_parts.query,
        )
        if resolved_identity != expected_identity:
            return True
    return False


def is_stub_file(path: str) -> bool:
    """Return whether *path* is absent or explicitly marked as a generated stub.

    Short real articles are content, not disposable stubs. An unreadable file is
    treated as real so an I/O problem can never authorize an overwrite.
    """
    if not os.path.exists(path):
        return True
    try:
        with open(path, encoding="utf-8") as fh:
            content = fh.read()
        return is_explicit_stub_html(content)
    except OSError:
        return False


def sha256_bytes(content: bytes) -> str:
    return f"sha256:{hashlib.sha256(content).hexdigest()}"


def git_blob_id(content: bytes, algorithm: str = "sha1") -> str:
    header = f"blob {len(content)}\0".encode("ascii")
    if algorithm == "sha256":
        return hashlib.sha256(header + content).hexdigest()
    return hashlib.sha1(header + content).hexdigest()


def normalize_hash(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if re.fullmatch(r"[0-9a-f]{64}", raw):
        return f"sha256:{raw}"
    return raw


def _decode_audit_entities(value: str) -> str:
    """Decode the fixed entity set used by article-text-v1."""
    named = {
        "amp": "&",
        "lt": "<",
        "gt": ">",
        "quot": '"',
        "apos": "'",
        "nbsp": "\u00a0",
    }

    def numeric(match: re.Match[str]) -> str:
        token = match.group(1)
        try:
            codepoint = int(token[1:], 16) if token.lower().startswith("x") else int(token)
            return chr(codepoint) if 0 <= codepoint <= 0x10FFFF else "\ufffd"
        except (ValueError, OverflowError):
            return "\ufffd"

    value = re.sub(r"&#(x[0-9a-f]+|[0-9]+);", numeric, value, flags=re.I)
    return re.sub(
        r"&(amp|lt|gt|quot|apos|nbsp);",
        lambda match: named[match.group(1).lower()],
        value,
        flags=re.I,
    )


def normalize_visible_text(html: str) -> str:
    """Normalize an HTML fragment using the manifest's article-text-v1 rules."""
    value = str(html or "")
    value = re.sub(r"<script\b[^>]*>[\s\S]*?</script\s*>", " ", value, flags=re.I)
    value = re.sub(r"<style\b[^>]*>[\s\S]*?</style\s*>", " ", value, flags=re.I)
    value = re.sub(r"<!--[\s\S]*?-->", " ", value)
    value = re.sub(r"<[^>]+>", " ", value)
    value = _decode_audit_entities(value)
    return re.sub(r"\s+", " ", value, flags=re.UNICODE).strip()


def extract_article_fragment(html: str) -> str:
    source = str(html or "")
    parser = _parse_html_document(source)
    root = _select_content_root(parser)
    if root is None:
        return ""
    assert root.close_start is not None
    return source[root.open_end:root.close_start]


def article_text_v1(html: str) -> str:
    fragment = extract_article_fragment(html)
    fragment = re.sub(
        r"<!--\s*RELATED_WIKI_PATHS:BEGIN\s*-->[\s\S]*?"
        r"<!--\s*RELATED_WIKI_PATHS:END\s*-->",
        " ",
        fragment,
        flags=re.I,
    )
    return normalize_visible_text(fragment)


def semantic_hash(html: str, *, article: bool = False) -> str:
    normalized = article_text_v1(html) if article else normalize_visible_text(html)
    return sha256_bytes(normalized.encode("utf-8"))


def sam_content_hash(html: str) -> str:
    """Hash SAM-owned middle HTML using the cross-publisher payload contract."""
    normalized = str(html or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    return sha256_bytes(normalized.encode("utf-8"))


def marker_count(html: str, marker: str) -> int:
    return len(re.findall(re.escape(marker), str(html or ""), re.I))


def marker_pattern(begin: str, end: str, *, capture: bool = False) -> re.Pattern[str]:
    middle = r"([\s\S]*?)" if capture else r"[\s\S]*?"
    return re.compile(f"{re.escape(begin)}{middle}{re.escape(end)}", re.I)


def extract_marker_inner(html: str, begin: str, end: str) -> str:
    source = str(html or "")
    label = next(
        (
            marker_label for marker_label, marker_begin, marker_end in OWNERSHIP_MARKERS
            if marker_begin.casefold() == begin.casefold()
            and marker_end.casefold() == end.casefold()
        ),
        None,
    )
    if label is None:
        match = marker_pattern(begin, end, capture=True).search(source)
        return match.group(1).strip() if match else ""
    _parser, _root, markers, _canonical_attributes = _ownership_document(source)
    intervals = markers[label]
    if len(intervals) != 1:
        return ""
    interval = intervals[0]
    return source[interval.content_start:interval.content_end].strip()


def _marker_intervals(
    source: str,
    parser: _DocumentStructureParser,
) -> dict[str, list[OwnershipInterval]]:
    intervals: dict[str, list[OwnershipInterval]] = {}
    for label, begin, end in OWNERSHIP_MARKERS:
        token_pattern = re.compile(
            f"(?P<begin>{re.escape(begin)})|(?P<end>{re.escape(end)})",
            re.I,
        )
        tokens = [
            match for match in token_pattern.finditer(source)
            if match.start() in parser.active_comment_starts
        ]
        label_intervals: list[OwnershipInterval] = []
        opening: re.Match[str] | None = None
        for token in tokens:
            if token.lastgroup == "begin":
                if opening is not None:
                    raise PublisherSafetyError(
                        f"malformed or nested {label} markers"
                    )
                opening = token
                continue
            if opening is None:
                raise PublisherSafetyError(
                    f"malformed or out-of-order {label} markers"
                )
            label_intervals.append(OwnershipInterval(
                label=label,
                start=opening.start(),
                content_start=opening.end(),
                content_end=token.start(),
                end=token.end(),
            ))
            opening = None
        if opening is not None:
            raise PublisherSafetyError(
                f"unbalanced {label} markers (1 unmatched begin)"
            )
        intervals[label] = label_intervals
    return intervals


def _canonical_attribute_intervals(
    parser: _DocumentStructureParser,
) -> list[OwnershipInterval]:
    intervals: list[OwnershipInterval] = []
    for element in parser.elements:
        values = _element_attr_values(element, "data-canonical-content")
        if not values:
            continue
        if len(values) != 1:
            raise PublisherSafetyError("duplicate data-canonical-content attributes are invalid")
        if not element.explicit_close or element.close_start is None or element.end is None:
            raise PublisherSafetyError(
                "data-canonical-content container must have a balanced closing tag"
            )
        intervals.append(OwnershipInterval(
            label="CANONICAL_CONTENT_ATTRIBUTE",
            start=element.start,
            content_start=element.open_end,
            content_end=element.close_start,
            end=element.end,
        ))
    return intervals


def _validate_ownership_topology(
    parser: _DocumentStructureParser,
    root: ParsedHtmlElement | None,
    intervals: list[OwnershipInterval],
) -> None:
    if intervals and root is None:
        raise PublisherSafetyError("ownership blocks require one article/wiki-content root")
    if root is None:
        return
    assert root.close_start is not None
    for interval in intervals:
        if interval.start < root.open_end or interval.end > root.close_start:
            raise PublisherSafetyError(
                f"{interval.label} ownership block must be wholly inside the article/wiki-content root"
            )
        if interval.label == "SAM_CONTENT" and any(
            element.tag == "article"
            and interval.start < element.start < interval.end
            for element in parser.elements
        ):
            raise PublisherSafetyError(
                "SAM_CONTENT must not contain an article element"
            )
    ordered = sorted(intervals, key=lambda interval: (interval.start, interval.end))
    for index, first in enumerate(ordered):
        for second in ordered[index + 1:]:
            if second.start >= first.end:
                break
            raise PublisherSafetyError(
                f"overlapping ownership blocks are invalid ({first.label}, {second.label})"
            )


def _ownership_document(
    html: str,
) -> tuple[
    _DocumentStructureParser,
    ParsedHtmlElement | None,
    dict[str, list[OwnershipInterval]],
    list[OwnershipInterval],
]:
    source = str(html or "")
    parser = _parse_html_document(source)
    root = _select_content_root(parser)
    marker_intervals = _marker_intervals(source, parser)
    canonical_attributes = _canonical_attribute_intervals(parser)
    all_intervals = [
        *marker_intervals["MANUAL_CONTENT"],
        *marker_intervals["SAM_CONTENT"],
        *marker_intervals["CANONICAL_CONTENT"],
        *canonical_attributes,
    ]
    _validate_ownership_topology(parser, root, all_intervals)
    return parser, root, marker_intervals, canonical_attributes


def _protected_content_blocks(html: str) -> tuple[str, ...]:
    source = str(html or "")
    _parser, _root, markers, canonical_attributes = _ownership_document(source)
    protected = [
        *markers["MANUAL_CONTENT"],
        *markers["CANONICAL_CONTENT"],
        *canonical_attributes,
    ]
    return tuple(source[item.start:item.end] for item in sorted(protected, key=lambda item: item.start))


def analyze_ownership(html: str) -> OwnershipState:
    source = str(html or "")
    parser, root, markers, canonical_attributes = _ownership_document(source)
    manual_blocks = len(markers["MANUAL_CONTENT"])
    sam_blocks = len(markers["SAM_CONTENT"])
    canonical_blocks = len(markers["CANONICAL_CONTENT"]) + len(canonical_attributes)

    if sam_blocks > 1:
        raise PublisherSafetyError(f"multiple SAM content blocks are invalid ({sam_blocks})")
    if canonical_blocks > 1:
        raise PublisherSafetyError(
            f"multiple canonical content blocks are invalid ({canonical_blocks})"
        )

    explicit_stub = _document_is_explicit_stub(source, parser)
    if root is None:
        unowned_article = ""
    else:
        assert root.close_start is not None
        unowned_article = source[root.open_end:root.close_start]
        owned_intervals = [
            *markers["MANUAL_CONTENT"],
            *markers["SAM_CONTENT"],
            *markers["CANONICAL_CONTENT"],
            *canonical_attributes,
        ]
        for interval in sorted(owned_intervals, key=lambda item: item.start, reverse=True):
            relative_start = interval.start - root.open_end
            relative_end = interval.end - root.open_end
            unowned_article = (
                unowned_article[:relative_start]
                + " " * (relative_end - relative_start)
                + unowned_article[relative_end:]
            )
    unowned_article = re.sub(
        r"<!--\s*RELATED_WIKI_PATHS:BEGIN\s*-->[\s\S]*?"
        r"<!--\s*RELATED_WIKI_PATHS:END\s*-->",
        " ",
        unowned_article,
        flags=re.I,
    )
    unowned_article = re.sub(
        r"<div\b[^>]*\bid\s*=\s*[\"']bible-content[\"'][^>]*>\s*</div\s*>",
        " ",
        unowned_article,
        flags=re.I,
    )
    legacy_unmarked = bool(normalize_visible_text(unowned_article)) and not explicit_stub
    return OwnershipState(
        manual_blocks=manual_blocks,
        sam_blocks=sam_blocks,
        canonical_blocks=canonical_blocks,
        legacy_unmarked=legacy_unmarked,
        explicit_stub=explicit_stub,
    )


def normalize_legacy_paths(html: str) -> str:
    """Rewrite fragile relative nav/asset paths to root-relative equivalents.

    This function must be called on any HTML content sourced from git history
    or copied from an older commit before it is written to disk.  Older commits
    used paths like ``../css/``, ``../js/``, ``../img/``, and ``../index.html``
    which break when the page is served from a sub-directory such as ``/wiki/``.
    Applying these replacements ensures legacy files cannot reintroduce fragile
    relative paths into the repository.
    """
    replacements = [
        ("../index.html",    "/index.html"),
        ("../search.html",   "/search.html"),
        ("../articles.html", "/articles.html"),
        ("../about.html",    "/about.html"),
        ("../categories/",   "/categories/"),
        ("../css/",          "/css/"),
        ("../js/",           "/js/"),
        ("../img/",          "/img/"),
    ]
    for old, new in replacements:
        html = html.replace(old, new)
    return html


# ---------------------------------------------------------------------------
# Repository-backed ownership and optimistic concurrency
# ---------------------------------------------------------------------------

def _index_content_state_manifest(raw: Any) -> dict[str, dict]:
    pages: Any
    if isinstance(raw, list):
        pages = raw
    elif isinstance(raw, dict):
        pages = raw.get("pages")
    else:
        pages = None

    if isinstance(pages, dict):
        normalized_pages = []
        for key, value in pages.items():
            if not isinstance(value, dict):
                raise PublisherSafetyError(f"invalid manifest page record for {key!r}")
            declared_slug = str(value.get("slug") or key)
            if declared_slug != key:
                raise PublisherSafetyError(
                    f"manifest page-map key {key!r} disagrees with slug {declared_slug!r}"
                )
            normalized_pages.append({**value, "slug": declared_slug})
        pages = normalized_pages

    if not isinstance(pages, list):
        raise PublisherSafetyError("content-state manifest must contain a pages array or object")

    indexed: dict[str, dict] = {}
    for index, page in enumerate(pages):
        if not isinstance(page, dict):
            raise PublisherSafetyError(f"manifest pages[{index}] must be an object")
        slug = str(page.get("slug") or "").strip()
        if not slug or slugify(slug) != slug:
            raise PublisherSafetyError(f"manifest pages[{index}] has invalid slug {slug!r}")
        if slug in indexed:
            raise PublisherSafetyError(f"duplicate manifest page record: {slug}")
        policy = str(page.get("automation_policy") or "").strip()
        if policy not in AUTOMATION_POLICIES:
            raise PublisherSafetyError(
                f"manifest page {slug} has invalid automation_policy {policy!r}"
            )
        expected_path = f"wiki/{slug}.html"
        record_path = str(page.get("path") or expected_path).replace("\\", "/")
        if record_path != expected_path:
            raise PublisherSafetyError(
                f"manifest page {slug} path must be {expected_path}, got {record_path!r}"
            )
        page_exists = page.get("page_exists")
        if not isinstance(page_exists, bool):
            raise PublisherSafetyError(
                f"manifest page {slug} must declare boolean page_exists"
            )
        identity_fields = (
            "content_hash", "article_content_hash", "article_markup_hash", "git_blob_oid"
        )
        if page_exists:
            for field in ("content_hash", "article_content_hash", "article_markup_hash"):
                if not re.fullmatch(r"sha256:[0-9a-f]{64}", str(page.get(field) or "")):
                    raise PublisherSafetyError(
                        f"manifest page {slug} existing {field} must be sha256:<64 lowercase hex>"
                    )
            if not re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", str(page.get("git_blob_oid") or "")):
                raise PublisherSafetyError(
                    f"manifest page {slug} existing git_blob_oid is invalid"
                )
        else:
            if policy != "stub-allowed":
                raise PublisherSafetyError(
                    f"manifest page {slug} page_exists:false requires stub-allowed policy"
                )
            for field in identity_fields:
                if field not in page or page[field] is not None:
                    raise PublisherSafetyError(
                        f"manifest page {slug} absent {field} must be explicitly null"
                    )
        if page.get("wiki_stub_marker_scope") not in (None, "body"):
            raise PublisherSafetyError(
                f"manifest page {slug} wiki_stub_marker_scope must be null or 'body'"
            )
        indexed[slug] = page

    if not indexed:
        raise PublisherSafetyError("content-state manifest contains no page records")
    return indexed


def _load_content_state_manifest_bytes(
    content: bytes,
    manifest_path: str,
) -> ContentStateManifest:
    try:
        raw = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PublisherSafetyError(
            f"cannot read content-state manifest {manifest_path}: {exc}"
        ) from exc
    indexed = _index_content_state_manifest(raw)
    identity = ContentStateManifestIdentity(
        content_bytes=content,
        content_hash=sha256_bytes(content),
        byte_length=len(content),
    )
    return ContentStateManifest(
        {
            slug: ContentStateRecord(record, identity)
            for slug, record in indexed.items()
        },
        identity,
    )


def load_content_state_manifest(
    manifest_path: str = CONTENT_STATE_MANIFEST,
) -> ContentStateManifest:
    """Load and index the repository-owned wiki content-state manifest.

    The canonical shape uses a ``pages`` array. Object maps and a top-level
    array are accepted so old audit tooling can migrate without weakening the
    per-page checks.
    """
    try:
        with open(manifest_path, "rb") as fh:
            content = fh.read()
    except FileNotFoundError as exc:
        raise PublisherSafetyError(
            f"content-state manifest is required before publishing: {manifest_path}"
        ) from exc
    except OSError as exc:
        raise PublisherSafetyError(
            f"cannot read content-state manifest {manifest_path}: {exc}"
        ) from exc
    return _load_content_state_manifest_bytes(content, manifest_path)


def item_slug(item: dict) -> str:
    explicit = str(item.get("slug") or "").strip()
    entity_name = first_non_empty(item.get("entity_name"), item.get("title"))
    slug = explicit or slugify(entity_name)
    if not slug or slugify(slug) != slug:
        raise PublisherSafetyError(f"invalid publish slug {slug!r}")
    return slug


def is_first_witness_slug(slug: str) -> bool:
    return slug == "the-first-witness" or slug.startswith("first-witness-")


def requested_prose(item: dict) -> str | None:
    unsupported = [key for key in UNSUPPORTED_PROSE_FIELDS if key in item and item[key] not in (None, "")]
    if unsupported:
        raise PublisherSafetyError(
            "unsupported prose field(s) " + ", ".join(unsupported) +
            "; use article_html or sam_content_html"
        )

    supplied = [key for key in PROSE_FIELDS if key in item and item[key] not in (None, "")]
    if len(supplied) > 1:
        raise PublisherSafetyError(
            f"ambiguous prose fields supplied: {', '.join(supplied)}"
        )
    if not supplied:
        return None
    value = item[supplied[0]]
    if not isinstance(value, str) or not value.strip():
        raise PublisherSafetyError(f"{supplied[0]} must be a non-empty string")
    return value.strip()


def _has_dangerous_url_scheme(value: str | None) -> bool:
    raw = unescape(str(value or ""))
    candidates = [raw, *re.split(r"[\t\n\f\r ,]+", raw)]
    return any(
        re.match(
            r"^(?:javascript|vbscript|data):",
            re.sub(r"[\x00-\x20\x7f]+", "", candidate).casefold(),
        )
        for candidate in candidates
        if candidate
    )


def validate_middle_content(prose: str) -> None:
    if re.search(
        r"<!--\s*(?:MANUAL_CONTENT|SAM_CONTENT|CANONICAL_CONTENT|RELATED_WIKI_PATHS)"
        r"\s*:\s*(?:BEGIN|END)\s*-->",
        prose,
        re.I,
    ):
        raise PublisherSafetyError(
            "incoming prose must not contain ownership or generated-content markers"
        )
    if re.search(r"\bdata-(?:canonical-content|wiki-stub)\b", prose, re.I):
        raise PublisherSafetyError(
            "incoming prose must not contain reserved ownership attributes"
        )
    if re.search(
        r"</?(?:base|link|meta)(?=[\t\n\f\r />])",
        prose,
        re.I,
    ):
        # Deliberately lexical: controls in noscript become active when
        # scripting is disabled, and publisher parity rejects these boundaries
        # even when they appear in another inert container.
        raise PublisherSafetyError(
            "incoming prose must not contain base, link, or meta page controls"
        )
    parser = _parse_html_document(prose)
    security_elements = parser.attribute_elements
    if any(
        str(value or "").casefold() == "bible-content"
        for element in security_elements
        for value in _element_attr_values(element, "id")
    ):
        raise PublisherSafetyError(
            "incoming prose must not contain the reserved bible-content container"
        )
    for element in security_elements:
        for attribute_name, attribute_value in element.attrs:
            local_name = attribute_name.rsplit(":", 1)[-1].casefold()
            if local_name.startswith("on") and len(local_name) > 2:
                raise PublisherSafetyError(
                    "incoming prose must not contain event-handler attributes"
                )
            if local_name == "srcdoc":
                raise PublisherSafetyError(
                    "incoming prose must not contain iframe srcdoc content"
                )
            if (
                local_name in DANGEROUS_URL_ATTRIBUTES
                and _has_dangerous_url_scheme(attribute_value)
            ):
                raise PublisherSafetyError(
                    "incoming prose must not contain executable or data URL attributes"
                )
    if any(
        element.tag in PROSE_PARSER_BOUNDARY_ELEMENTS
        for element in security_elements
    ):
        raise PublisherSafetyError(
            "incoming prose must not contain raw-text or parser-state boundary elements"
        )
    if any(
        element.tag in FOREIGN_ACTIVE_CONTENT_ELEMENTS
        for element in security_elements
    ):
        raise PublisherSafetyError(
            "incoming prose must not contain SVG, MathML, or SMIL elements"
        )
    if parser.unmatched_end_tags:
        raise PublisherSafetyError(
            "incoming prose must not contain unmatched closing tags: "
            + ", ".join(parser.unmatched_end_tags)
        )
    if any(
        declaration.lstrip().casefold().startswith("doctype")
        for declaration in parser.declarations
    ) or any(
        element.tag in {"html", "head", "body", "main", "article", "script", "style"}
        for element in security_elements
    ):
        raise PublisherSafetyError("incoming prose must be article middle content only")


def manifest_content_hash(entry: dict) -> str:
    return normalize_hash(entry.get("content_hash"))


def expected_content_hash(item: dict) -> tuple[bool, str]:
    provided = [(key, normalize_hash(item.get(key))) for key in EXPECTED_HASH_FIELDS if key in item]
    if not provided:
        return False, ""
    distinct = {value for _, value in provided}
    if len(distinct) > 1:
        raise PublisherSafetyError(
            "expected_content_hash and base_content_hash disagree"
        )
    return True, provided[0][1]


def verify_manifest_freshness(entry: dict, path: str, content: bytes | None) -> None:
    slug = str(entry.get("slug") or os.path.basename(path).removesuffix(".html"))
    recorded_hash = manifest_content_hash(entry)

    if content is None:
        if entry.get("page_exists") is not False:
            raise PublisherSafetyError(
                f"{slug}: a missing page requires an explicit page_exists:false manifest record"
            )
        if recorded_hash:
            raise PublisherSafetyError(
                f"{slug}: manifest describes content but {path} is missing (stale revision)"
            )
        for key in (
            "article_content_hash",
            "git_blob_id",
            "git_blob_oid",
            "git_head_blob_id",
            "git_head_blob_oid",
        ):
            if entry.get(key):
                raise PublisherSafetyError(
                    f"{slug}: manifest {key} exists but page is missing (stale revision)"
                )
        return

    if entry.get("page_exists") is not True:
        raise PublisherSafetyError(
            f"{slug}: manifest does not declare page_exists:true but {path} exists (stale revision)"
        )

    actual_hash = sha256_bytes(content)
    if not recorded_hash:
        raise PublisherSafetyError(f"{slug}: manifest is missing content_hash")
    if actual_hash != recorded_hash:
        raise PublisherSafetyError(
            f"{slug}: page bytes do not match manifest content_hash (stale revision)"
        )

    for key in ("git_blob_id", "git_blob_oid"):
        recorded_blob = str(entry.get(key) or "").strip().lower()
        if not recorded_blob:
            continue
        algorithm = "sha256" if len(recorded_blob) == 64 else "sha1"
        if git_blob_id(content, algorithm) != recorded_blob:
            raise PublisherSafetyError(
                f"{slug}: page bytes do not match manifest {key} (stale revision)"
            )

    recorded_article_hash = normalize_hash(entry.get("article_content_hash"))
    if recorded_article_hash:
        html = content.decode("utf-8")
        if semantic_hash(html, article=True) != recorded_article_hash:
            raise PublisherSafetyError(
                f"{slug}: article text does not match manifest article_content_hash"
            )


def verify_expected_revision(item: dict, entry: dict, *, required: bool) -> None:
    supplied, requested_hash = expected_content_hash(item)
    recorded_hash = manifest_content_hash(entry)
    slug = str(entry.get("slug") or item_slug(item))
    if required and not supplied:
        raise PublisherSafetyError(
            f"{slug}: expected_content_hash is required for an automated article-body write"
        )
    if supplied and requested_hash != recorded_hash:
        raise PublisherSafetyError(
            f"{slug}: expected_content_hash is stale; refresh from {CONTENT_STATE_MANIFEST}"
        )

    supplied_blobs = [
        (key, str(item.get(key) or "").strip().lower())
        for key in EXPECTED_BLOB_FIELDS
        if key in item
    ]
    if len({value for _, value in supplied_blobs}) > 1:
        raise PublisherSafetyError(f"{slug}: supplied base blob identities disagree")
    if supplied_blobs:
        recorded_blob = str(entry.get("git_blob_oid") or entry.get("git_blob_id") or "").strip().lower()
        if supplied_blobs[0][1] != recorded_blob:
            raise PublisherSafetyError(
                f"{slug}: supplied git blob identity is stale; refresh from {CONTENT_STATE_MANIFEST}"
            )

    recorded_identities = {
        value for value in (
            recorded_hash,
            str(entry.get("git_blob_oid") or entry.get("git_blob_id") or "").strip().lower(),
            str(entry.get("git_head_blob_oid") or entry.get("git_head_blob_id") or "").strip().lower(),
        ) if value
    }
    for key in EXPECTED_REVISION_FIELDS:
        if key not in item:
            continue
        revision = str(item.get(key) or "").strip().lower()
        if not ({revision, normalize_hash(revision)} & recorded_identities):
            raise PublisherSafetyError(
                f"{slug}: {key} is stale; refresh from {CONTENT_STATE_MANIFEST}"
            )


def verify_incoming_content_hash(item: dict, prose: str) -> str:
    incoming_hash = sam_content_hash(prose)
    claimed_hash = normalize_hash(item.get("content_hash"))
    if claimed_hash and claimed_hash != incoming_hash:
        raise PublisherSafetyError(
            f"{item_slug(item)}: incoming content_hash does not match the supplied prose"
        )
    claimed_article_hash = normalize_hash(item.get("article_content_hash"))
    if claimed_article_hash and claimed_article_hash != semantic_hash(prose):
        raise PublisherSafetyError(
            f"{item_slug(item)}: incoming article_content_hash does not match the supplied prose"
        )
    return incoming_hash


def replace_sam_block(html: str, prose: str, state: OwnershipState) -> str:
    block = f"{SAM_CONTENT_BEGIN}\n{prose}\n{SAM_CONTENT_END}"
    if state.sam_blocks != 1:
        raise PublisherSafetyError(
            "replace-sam-block requires exactly one existing SAM content block"
        )
    source = str(html or "")
    _parser, _root, markers, _canonical_attributes = _ownership_document(source)
    intervals = markers["SAM_CONTENT"]
    if len(intervals) != 1:
        raise PublisherSafetyError(
            "replace-sam-block requires exactly one actual SAM content block"
        )
    interval = intervals[0]
    return source[:interval.start] + block + source[interval.end:]


# ---------------------------------------------------------------------------
# HTML rendering
# ---------------------------------------------------------------------------

def render_html(
    entity_name: str,
    slug: str,
    summary: str,
    source_url: str,
    source_name: str,
    category: str,
    mention_count: int,
) -> str:
    """Return a valid HTML5 stub page for the given entity with root-relative paths.

    This function is ONLY called when no real article file exists. The rendered
    page is clearly marked as a stub so it is never confused with real content.
    """
    title_safe = esc(entity_name)
    summary_safe = esc(summary)
    source_href = source_url if source_url else "#"
    if _has_dangerous_url_scheme(source_href):
        raise PublisherSafetyError(
            "stub source_url must not use a javascript, vbscript, or data scheme"
        )
    source_url_safe = esc(source_href)
    source_name_safe = esc(source_name if source_name else source_url if source_url else "Source")
    category_safe = esc(category)
    page_url = f"{BASE_URL}{slug}.html"
    if _has_dangerous_url_scheme(page_url):  # defensive for direct render_html callers
        raise PublisherSafetyError("rendered canonical URL uses a dangerous scheme")
    page_url_safe = esc(page_url)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{title_safe} — Crypto Moonboys Wiki">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="{title_safe} — Crypto Moonboys Wiki">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{page_url_safe}">
  <meta property="og:image" content="https://cryptomoonboys.com/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png">
  <title>{title_safe} — Crypto Moonboys Wiki</title>
  <link rel="canonical" href="{page_url_safe}">
  <link rel="stylesheet" href="/css/wiki.css">
  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
</head>
<body data-wiki-stub="true">
<header id="site-header" role="banner">
  <button class="hamburger" id="hamburger" aria-label="Toggle navigation" aria-expanded="false" aria-controls="sidebar">&#9776;</button>
  <a href="/index.html" class="site-logo" aria-label="The Crypto Moonboys GK Wiki home">
    <img src="/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png" alt="" aria-hidden="true">
    <span>
      <span class="logo-text">🌙 The Crypto Moonboys GK Wiki</span>
      <span class="logo-sub">Living Web3 Wiki</span>
    </span>
  </a>
  <div id="header-search" role="search">
    <input type="search" id="search-input" placeholder="Search the wiki…" aria-label="Search" autocomplete="off">
    <button id="search-btn" aria-label="Search">🔍</button>
    <div id="search-results" role="listbox"></div>
  </div>
  <nav class="header-nav" aria-label="Main navigation">
    <a href="/index.html">Home</a>
    <a href="/categories/index.html">Categories</a>
    <a href="/search.html">All Articles</a>
    <a href="/timeline.html">📅 Timeline</a>
    <a href="/graph.html">🌐 Graph</a>
    <a href="/dashboard.html">📊 Dashboard</a>
    <a href="/sam.html">🧠 SAM</a>
  </nav>
</header>

<div id="sidebar-overlay" aria-hidden="true"></div>

<div id="layout">
    <nav id="sidebar" aria-label="Wiki navigation">
    <div class="sidebar-section">
      <div class="sidebar-heading">Navigation</div>
      <div class="sidebar-nav">
        <a href="/index.html"><span class="nav-icon">🏠</span> Main Page</a>
        <a href="/categories/index.html"><span class="nav-icon">📂</span> All Categories</a>
        <a href="/search.html"><span class="nav-icon">🔍</span> All Articles</a>
        <a href="/timeline.html"><span class="nav-icon">📅</span> Timeline</a>
        <a href="/graph.html"><span class="nav-icon">🌐</span> Entity Graph</a>
        <a href="/dashboard.html"><span class="nav-icon">📊</span> Dashboard</a>
      </div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-heading">⚔️ HODL WARS LORE$ ⚡️⚡️⚡️</div>
      <div class="sidebar-nav">
        <a href="/wiki/hodl-wars.html"><span class="nav-icon">⚔️</span> HODL WAR$</a>
        <a href="/wiki/hodl-warriors.html"><span class="nav-icon">💎</span> HODL WARRIORS</a>
        <a href="/wiki/diamond-hands.html"><span class="nav-icon">💎</span> Diamond Hands</a>
        <a href="/wiki/paper-hands.html"><span class="nav-icon">🧻</span> Paper Hands</a>
        <a href="/wiki/whale-lords.html"><span class="nav-icon">🐳</span> The Whale Lords</a>
        <a href="/wiki/moon-mission.html"><span class="nav-icon">🚀</span> Moon Mission</a>
        <a href="/wiki/the-great-dip.html"><span class="nav-icon">📉</span> The Great Dip</a>
        <a href="/wiki/bear-market-siege.html"><span class="nav-icon">🐻</span> Bear Market Siege</a>
        <a href="/wiki/rug-pull-wars.html"><span class="nav-icon">🪤</span> Rug Pull Wars</a>
        <a href="/wiki/satoshi-scroll.html"><span class="nav-icon">📜</span> The Satoshi Scroll</a>
        <a href="/wiki/fomo-plague.html"><span class="nav-icon">😱</span> The FOMO Plague</a>
        <a href="/wiki/ngmi-chronicles.html"><span class="nav-icon">💀</span> NGMI Chronicles</a>
        <a href="/wiki/wagmi-prophecy.html"><span class="nav-icon">🌙</span> The WAGMI Prophecy</a>
      </div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-heading">GK Wiki Info</div>
      <div class="sidebar-nav">
        <a href="/about.html"><span class="nav-icon">ℹ️</span> About</a>
        <a href="/about.html#citation"><span class="nav-icon">📋</span> Citation Policy</a>
        <a href="/about.html#sources"><span class="nav-icon">��</span> Source Types</a>
      </div>
    </div>
  </nav>

  <div id="main-wrapper">
    <main id="wiki-content" role="main">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/index.html">Home</a>
        <span class="sep" aria-hidden="true">›</span>
        <a href="/search.html">All Articles</a>
        <span class="sep" aria-hidden="true">›</span>
        <span aria-current="page">{title_safe}</span>
      </nav>

      <article data-entity-slug="{slug}" data-wiki-stub="true">
        <header class="wiki-header">
          <h1>{title_safe}</h1>
          <p class="wiki-meta">Category: {category_safe} &nbsp;|&nbsp; Mentions: {mention_count}</p>
        </header>

        <div class="stub-notice" role="note">
          <strong>⚠️ Stub article</strong> — This page was auto-generated from metadata.
          A full article has not yet been written for this topic.
        </div>

        <section class="wiki-section">
          <h2 id="summary">Summary</h2>
          <p>{summary_safe}</p>
        </section>

        <section class="wiki-section">
          <h2 id="source">Source</h2>
          <p><a href="{source_url_safe}" target="_blank" rel="noopener noreferrer">{source_name_safe}</a></p>
        </section>

        <div id="bible-content"></div>
      </article>
    </main>

    <footer id="site-footer" role="contentinfo">
      <div class="footer-inner">
        <div class="footer-col">
          <h4>🌙 The Crypto Moonboys GK Wiki</h4>
          <p>Crypto Moonboys is a living Web3 wiki.</p>
        </div>
        <div class="footer-col">
          <h4>Explore</h4>
          <ul>
            <li><a href="/index.html">Main Page</a></li>
            <li><a href="/categories/index.html">Categories</a></li>
            <li><a href="/search.html">All Articles</a></li>
            <li><a href="/about.html">About</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 Crypto Moonboys Wiki · Not financial advice.</p>
      </div>
    </footer>
  </div>
</div>

<button id="back-to-top" aria-label="Back to top">↑</button>
<script src="/js/wiki.js"></script>
<script src="/js/bible-loader.js"></script>
</body>
</html>
"""


def plan_item_publish(
    item: dict,
    entry: dict,
    *,
    wiki_dir: str = WIKI_DIR,
) -> PublishPlan:
    """Preflight one item and return an immutable write/preserve/no-op plan."""
    slug = item_slug(item)
    policy = str(entry.get("automation_policy") or "").strip()
    out_path = os.path.join(wiki_dir, f"{slug}.html")
    prose = requested_prose(item)
    authorization_manifest_identity = getattr(entry, "manifest_identity", None)

    def publish_plan(
        action: str,
        html: str | None = None,
        message: str = "",
        creates_page: bool = False,
        base_content_hash: str | None = None,
    ) -> PublishPlan:
        return PublishPlan(
            action=action,
            out_path=out_path,
            html=html,
            message=message,
            creates_page=creates_page,
            base_content_hash=base_content_hash,
            authorization_manifest_identity=authorization_manifest_identity,
        )

    try:
        if os.path.exists(out_path):
            with open(out_path, "rb") as fh:
                content = fh.read()
        else:
            content = None
    except OSError as exc:
        raise PublisherSafetyError(f"{slug}: cannot read existing page: {exc}") from exc

    verify_manifest_freshness(entry, out_path, content)
    try:
        html = content.decode("utf-8") if content is not None else ""
        state = analyze_ownership(html) if content is not None else OwnershipState(0, 0, 0, False, False)
    except (UnicodeDecodeError, PublisherSafetyError) as exc:
        raise PublisherSafetyError(f"{slug}: {exc}") from exc

    for manifest_key, actual in (
        ("manual_content_block_count", state.manual_blocks),
        ("sam_content_block_count", state.sam_blocks),
        ("canonical_content_block_count", state.canonical_blocks),
    ):
        if manifest_key in entry and entry[manifest_key] != actual:
            raise PublisherSafetyError(
                f"{slug}: manifest {manifest_key}={entry[manifest_key]!r} but page has {actual}"
            )

    manifest_legacy = bool(entry.get("legacy_unmarked_content"))
    # ``legacy_unmarked_content`` is a semantic audit classification, not just
    # marker absence: known First Witness canon and generated templates can be
    # intentionally unmarked without being legacy. For write-capable policies
    # below, both the manifest classification and literal marker state are used
    # fail-closed; metadata-only/locked reads need not pretend the exception is
    # manifest drift.

    # First Witness is protected even if a malformed manifest assigns a weaker
    # policy. Changing its prose requires an explicit later canon PR.
    if is_first_witness_slug(slug):
        if prose is not None:
            raise PublisherSafetyError(
                f"{slug}: automated article-body writes are forbidden for First Witness canon"
            )
        if policy != "canon-locked":
            raise PublisherSafetyError(
                f"{slug}: First Witness pages must use automation_policy canon-locked"
            )
        return publish_plan("locked", message=f"[LOCKED] {out_path}")

    if policy in {"metadata-only", "canon-locked"}:
        if prose is not None:
            raise PublisherSafetyError(
                f"{slug}: automated article-body writes are forbidden by {policy} policy"
            )
        label = "LOCKED" if policy == "canon-locked" else "METADATA"
        return publish_plan(policy, message=f"[{label}] {out_path}")

    if policy == "replace-sam-block":
        if prose is None:
            return publish_plan("preserve", message=f"[PRESERVE] {out_path}")
        if content is None:
            raise PublisherSafetyError(
                f"{slug}: replace-sam-block cannot create a missing page"
            )
        validate_middle_content(prose)
        incoming_hash = verify_incoming_content_hash(item, prose)

        if manifest_legacy or state.legacy_unmarked:
            raise PublisherSafetyError(
                f"{slug}: unmarked legacy article is review-only and cannot enter automated rewrite"
            )
        if state.sam_blocks == 0:
            raise PublisherSafetyError(
                f"{slug}: replace-sam-block requires one existing SAM block; refusing to append"
            )

        existing_sam = extract_marker_inner(html, SAM_CONTENT_BEGIN, SAM_CONTENT_END)
        if state.sam_blocks == 1 and sam_content_hash(existing_sam) == incoming_hash:
            return publish_plan(
                "noop",
                message=f"[NO-OP] {out_path} (same content hash)",
                base_content_hash=manifest_content_hash(entry),
            )

        verify_expected_revision(item, entry, required=True)
        protected_before = _protected_content_blocks(html)
        updated = replace_sam_block(html, prose, state)
        updated_state = analyze_ownership(updated)
        if updated_state.sam_blocks != 1:
            raise PublisherSafetyError(
                f"{slug}: planned result must contain exactly one SAM content block"
            )
        if _protected_content_blocks(updated) != protected_before:
            raise PublisherSafetyError(
                f"{slug}: planned SAM replacement changed protected manual/canonical bytes"
            )
        return publish_plan(
            "replace-sam-block",
            updated,
            f"[SAM] {out_path}",
            base_content_hash=manifest_content_hash(entry),
        )

    if policy == "stub-allowed":
        if prose is not None:
            raise PublisherSafetyError(
                f"{slug}: stub-allowed accepts metadata stubs, not article_html"
            )
        if content is not None and redirects_to_other_wiki_page(html, slug):
            raise PublisherSafetyError(
                f"{slug}: redirect/canonical alias cannot be refreshed as a stub"
            )
        # An existing non-stub page is always real, regardless of word count.
        if content is not None and not state.explicit_stub:
            return publish_plan("preserve", message=f"[PRESERVE] {out_path}")
        if state.manual_blocks or state.sam_blocks or state.canonical_blocks or manifest_legacy:
            raise PublisherSafetyError(
                f"{slug}: owned or legacy content cannot be treated as a generated stub"
            )

        entity_name = first_non_empty(item.get("entity_name"), item.get("title"), slug)
        summary = str(item.get("summary") or "").strip()
        summary_word_count = len(re.findall(r"\b[\w'-]+\b", summary, re.UNICODE))
        if summary_word_count > MAX_STUB_SUMMARY_WORDS:
            raise PublisherSafetyError(
                f"{slug}: stub summary has {summary_word_count} words; maximum is "
                f"{MAX_STUB_SUMMARY_WORDS} (full article prose is not allowed through stub-allowed)"
            )
        source_url = str(item.get("source_url") or "#").strip()
        source_name = str(item.get("source_name") or source_url).strip()
        category = str(item.get("category") or "").strip()
        try:
            mention_count = int(item.get("mention_count", 0))
        except (TypeError, ValueError) as exc:
            raise PublisherSafetyError(f"{slug}: mention_count must be an integer") from exc

        rendered = render_html(
            entity_name=entity_name,
            slug=slug,
            summary=summary,
            source_url=source_url,
            source_name=source_name,
            category=category,
            mention_count=mention_count,
        )
        if content is not None and content.decode("utf-8") == rendered:
            return publish_plan(
                "noop",
                message=f"[NO-OP] {out_path} (same stub bytes)",
                base_content_hash=manifest_content_hash(entry),
            )
        verify_expected_revision(item, entry, required=content is not None)
        return publish_plan(
            "stub",
            rendered,
            f"[STUB] {out_path}",
            creates_page=content is None,
            base_content_hash=manifest_content_hash(entry) or None,
        )

    # load_content_state_manifest rejects this already; retain a local guard for
    # callers that construct entries directly in tests or integrations.
    raise PublisherSafetyError(f"{slug}: unsupported automation_policy {policy!r}")


# ---------------------------------------------------------------------------
# Sitemap builder
# ---------------------------------------------------------------------------

def _build_sitemap_from_bytes(html_files: list[str], existing: bytes | None) -> str:
    today = date.today().isoformat()

    non_wiki_blocks: list[str] = []
    if existing is not None:
        try:
            root = ET.fromstring(existing)
            ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

            for url_el in root.findall("sm:url", ns):
                loc_el = url_el.find("sm:loc", ns)
                if loc_el is None or not loc_el.text:
                    continue

                if not loc_el.text.startswith(BASE_URL):
                    parts = ["  <url>"]
                    for child in url_el:
                        tag = child.tag.split("}")[-1]
                        text = child.text or ""
                        parts.append(f"    <{tag}>{text}</{tag}>")
                    parts.append("  </url>")
                    non_wiki_blocks.append("\n".join(parts))
        except ET.ParseError:
            pass

    wiki_entries: list[str] = []
    for fpath in sorted(html_files):
        fname = os.path.basename(fpath)
        if fname == "index.html":
            continue

        loc = f"{BASE_URL}{fname}"
        wiki_entries.append(
            f"  <url><loc>{loc}</loc><lastmod>{today}</lastmod>"
            f"<changefreq>weekly</changefreq><priority>0.8</priority></url>"
        )

    body = "\n".join(non_wiki_blocks + wiki_entries)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n"
        "</urlset>\n"
    )


def build_sitemap(html_files: list[str], sitemap_path: str) -> str:
    """
    Preserve non-wiki URLs from the existing sitemap.
    Rebuild wiki article URLs only.
    Excludes any legacy wiki/index.html entry.
    """
    existing: bytes | None = None
    try:
        with open(sitemap_path, "rb") as fh:
            existing = fh.read()
    except FileNotFoundError:
        pass
    except OSError as exc:
        raise PublisherSafetyError(f"cannot read sitemap {sitemap_path}: {exc}") from exc
    return _build_sitemap_from_bytes(html_files, existing)


# ---------------------------------------------------------------------------
# Transactional writes and content-state refresh
# ---------------------------------------------------------------------------

def _canonical_fs_path(path: str) -> str:
    return os.path.realpath(os.path.abspath(path))


def _path_is_within(path: str, root: str) -> bool:
    try:
        return os.path.commonpath([_canonical_fs_path(path), root]) == root
    except ValueError:
        return False


def _validate_transaction_path_scope(
    plans: list[PublishPlan],
    *,
    repo_root: str,
    wiki_dir: str,
    sitemap_path: str,
    manifest_path: str,
    report_path: str,
    absent_stubs_path: str,
) -> None:
    """Bind every mutable target to the one repository lock namespace."""
    root = _canonical_fs_path(repo_root)
    expected_wiki_path = os.path.join(root, WIKI_DIR)
    if os.path.islink(expected_wiki_path) or os.path.islink(wiki_dir):
        raise PublisherSafetyError(
            f"transaction wiki directory must not be a symbolic link: {wiki_dir}"
        )
    expected_wiki_dir = _canonical_fs_path(expected_wiki_path)
    actual_wiki_dir = _canonical_fs_path(wiki_dir)
    if (
        actual_wiki_dir != expected_wiki_dir
        or not _path_is_within(actual_wiki_dir, root)
    ):
        raise PublisherSafetyError(
            f"transaction wiki directory must be {expected_wiki_dir}, got {actual_wiki_dir}"
        )
    for plan in plans:
        target = _canonical_fs_path(plan.out_path)
        if os.path.islink(plan.out_path):
            raise PublisherSafetyError(
                f"publish target must not be a symbolic link: {plan.out_path}"
            )
        if os.path.dirname(target) != expected_wiki_dir:
            raise PublisherSafetyError(
                f"publish target escapes the locked repository wiki directory: {plan.out_path}"
            )
    artifact_paths: list[tuple[str, str]] = []
    if any(plan.html is not None for plan in plans):
        artifact_paths.extend([
            ("sitemap", sitemap_path),
            ("content-state manifest", manifest_path),
            ("rewrite report", report_path),
        ])
        if any(plan.creates_page for plan in plans):
            artifact_paths.append(("absent-stub registry", absent_stubs_path))
    for label, path in artifact_paths:
        if os.path.islink(path):
            raise PublisherSafetyError(f"{label} path must not be a symbolic link: {path}")
        if not _path_is_within(path, root):
            raise PublisherSafetyError(
                f"{label} path escapes the locked repository: {path}"
            )


@contextmanager
def repository_publish_lock(repo_root: str | None = None):
    """Acquire the shared cross-publisher atomic lock directory.

    Every repository writer uses the same empty directory contract. A stale or
    active directory is deliberately fail-closed and must never be stolen.
    """
    root = _canonical_fs_path(repo_root or os.path.dirname(__file__))
    lock_path = os.path.join(root, PUBLISH_TRANSACTION_LOCK)
    _require_safe_transaction_primitives()
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    try:
        root_fd = os.open(root, flags)
        root_stat = os.fstat(root_fd)
        named_root = os.stat(root, follow_symlinks=False)
        if (root_stat.st_dev, root_stat.st_ino) != (
            named_root.st_dev,
            named_root.st_ino,
        ):
            raise PublisherSafetyError(
                f"repository root identity changed while acquiring lock: {root}"
            )
    except BaseException as exc:
        if "root_fd" in locals():
            os.close(root_fd)
        if isinstance(exc, PublisherSafetyError):
            raise
        raise PublisherSafetyError(
            f"cannot anchor repository publish lock root {root}: {exc}"
        ) from exc

    try:
        os.mkdir(PUBLISH_TRANSACTION_LOCK, 0o700, dir_fd=root_fd)
    except FileExistsError as exc:
        os.close(root_fd)
        raise PublisherSafetyError(
            f"PUBLISH_TRANSACTION_LOCKED: repository publish lock already exists: {lock_path}"
        ) from exc
    except OSError as exc:
        os.close(root_fd)
        raise PublisherSafetyError(
            f"cannot acquire repository publish lock {lock_path}: {exc}"
        ) from exc
    except BaseException as exc:
        # The syscall may have created the directory immediately before an
        # asynchronous BaseException was delivered. Cleanup remains anchored
        # to the repository inode even if its pathname is swapped meanwhile.
        try:
            os.rmdir(PUBLISH_TRANSACTION_LOCK, dir_fd=root_fd)
        except FileNotFoundError:
            pass
        except BaseException as cleanup_exc:
            if hasattr(exc, "add_note"):
                exc.add_note(
                    f"interrupted lock acquisition cleanup failed for {lock_path}: "
                    f"{cleanup_exc}"
                )
        os.close(root_fd)
        raise

    try:
        created_lock = os.stat(
            PUBLISH_TRANSACTION_LOCK,
            dir_fd=root_fd,
            follow_symlinks=False,
        )
    except BaseException:
        try:
            os.rmdir(PUBLISH_TRANSACTION_LOCK, dir_fd=root_fd)
        finally:
            os.close(root_fd)
        raise

    lock: RepositoryPublishLock | None = None
    lock_fd: int | None = None
    active_error: BaseException | None = None
    try:
        lock_fd = os.open(PUBLISH_TRANSACTION_LOCK, flags, dir_fd=root_fd)
        lock_stat = os.fstat(lock_fd)
        named_lock = os.stat(
            PUBLISH_TRANSACTION_LOCK,
            dir_fd=root_fd,
            follow_symlinks=False,
        )
        if (
            not stat.S_ISDIR(lock_stat.st_mode)
            or (lock_stat.st_dev, lock_stat.st_ino)
            != (named_lock.st_dev, named_lock.st_ino)
        ):
            raise PublisherSafetyError(
                f"repository publish lock identity changed during acquisition: {lock_path}"
            )
        lock = RepositoryPublishLock(
            repo_root=root,
            path=lock_path,
            name=PUBLISH_TRANSACTION_LOCK,
            root_fd=root_fd,
            lock_fd=lock_fd,
            device=lock_stat.st_dev,
            inode=lock_stat.st_ino,
        )
        yield lock
    except BaseException as exc:
        active_error = exc
        raise
    finally:
        if lock is not None:
            lock.active = False
        try:
            current = os.stat(
                PUBLISH_TRANSACTION_LOCK,
                dir_fd=root_fd,
                follow_symlinks=False,
            )
            expected_lock_id = (
                (lock.device, lock.inode)
                if lock is not None
                else (created_lock.st_dev, created_lock.st_ino)
            )
            if (current.st_dev, current.st_ino) != expected_lock_id:
                raise PublisherSafetyError(
                    f"repository publish lock identity changed while held: {lock_path}"
                )
            os.rmdir(PUBLISH_TRANSACTION_LOCK, dir_fd=root_fd)
            os.fsync(root_fd)
        except BaseException as cleanup_exc:
            cleanup_error = PublisherSafetyError(
                f"cannot release repository publish lock {lock_path}: {cleanup_exc}"
            )
            if active_error is not None:
                if hasattr(active_error, "add_note"):
                    active_error.add_note(str(cleanup_error))
            else:
                raise cleanup_error from cleanup_exc
        finally:
            if lock_fd is not None:
                os.close(lock_fd)
            os.close(root_fd)


def _require_publish_lock(
    lock: RepositoryPublishLock,
    repo_root: str,
) -> None:
    expected_root = _canonical_fs_path(repo_root)
    expected_path = os.path.join(expected_root, PUBLISH_TRANSACTION_LOCK)
    if (
        not isinstance(lock, RepositoryPublishLock)
        or not lock.active
        or lock.repo_root != expected_root
        or lock.path != expected_path
    ):
        raise PublisherSafetyError("an active repository publish lock is required")
    try:
        root_current = os.fstat(lock.root_fd)
        lock_current = os.fstat(lock.lock_fd)
        current = os.stat(
            lock.name,
            dir_fd=lock.root_fd,
            follow_symlinks=False,
        )
    except OSError as exc:
        raise PublisherSafetyError(f"repository publish lock was lost: {lock.path}") from exc
    if (
        not stat.S_ISDIR(root_current.st_mode)
        or (lock_current.st_dev, lock_current.st_ino) != (lock.device, lock.inode)
        or (current.st_dev, current.st_ino) != (lock.device, lock.inode)
    ):
        raise PublisherSafetyError(f"repository publish lock identity changed: {lock.path}")


def _require_safe_transaction_primitives() -> None:
    required_flags = ("O_DIRECTORY", "O_NOFOLLOW", "O_CLOEXEC")
    missing_flags = [name for name in required_flags if not hasattr(os, name)]
    required_dir_fd = (
        ("open", os.open),
        ("stat", os.stat),
        ("rename", os.rename),
        ("unlink", os.unlink),
        ("link", os.link),
        ("mkdir", os.mkdir),
        ("rmdir", os.rmdir),
    )
    missing_dir_fd = [
        name for name, function in required_dir_fd
        if function not in os.supports_dir_fd
    ]
    if os.stat not in os.supports_follow_symlinks:
        missing_dir_fd.append("stat(follow_symlinks=False)")
    if os.link not in os.supports_follow_symlinks:
        missing_dir_fd.append("link(follow_symlinks=False)")
    if missing_flags or missing_dir_fd or not hasattr(os, "fchmod"):
        detail = ", ".join(missing_flags + missing_dir_fd)
        raise PublisherSafetyError(
            "safe repository transaction primitives are unavailable"
            + (f": {detail}" if detail else "")
        )


def _transaction_absolute_path(path: str, repo_root: str) -> str:
    candidate = path if os.path.isabs(path) else os.path.join(repo_root, path)
    return os.path.normpath(os.path.abspath(candidate))


class _AnchoredRepository:
    """Hold no-follow directory descriptors for every transaction target."""

    def __init__(
        self,
        repo_root: str,
        *,
        expected_root_identity: tuple[int, int] | None = None,
    ):
        _require_safe_transaction_primitives()
        self.repo_root = _canonical_fs_path(repo_root)
        self._directory_fds: dict[tuple[str, ...], int] = {}
        self._directory_ids: dict[tuple[str, ...], tuple[int, int]] = {}
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
        try:
            root_fd = os.open(self.repo_root, flags)
        except OSError as exc:
            raise PublisherSafetyError(
                f"cannot anchor repository root {self.repo_root}: {exc}"
            ) from exc
        try:
            root_stat = os.fstat(root_fd)
            named_root = os.stat(self.repo_root, follow_symlinks=False)
            if not stat.S_ISDIR(root_stat.st_mode) or (
                root_stat.st_dev,
                root_stat.st_ino,
            ) != (named_root.st_dev, named_root.st_ino):
                raise PublisherSafetyError(
                    f"repository root identity changed while anchoring: {self.repo_root}"
                )
            if expected_root_identity is not None and (
                root_stat.st_dev,
                root_stat.st_ino,
            ) != expected_root_identity:
                raise PublisherSafetyError(
                    "repository root does not match the held publish lock: "
                    f"{self.repo_root}"
                )
        except BaseException:
            os.close(root_fd)
            raise
        self._directory_fds[()] = root_fd
        self._directory_ids[()] = (root_stat.st_dev, root_stat.st_ino)

    def close(self) -> None:
        failures: list[str] = []
        for components, fd in sorted(
            self._directory_fds.items(), key=lambda item: len(item[0]), reverse=True
        ):
            try:
                os.close(fd)
            except OSError as exc:
                failures.append(f"{'/'.join(components) or '.'}: {exc}")
        self._directory_fds.clear()
        self._directory_ids.clear()
        if failures:
            raise PublisherSafetyError(
                "could not close transaction directory anchors: " + "; ".join(failures)
            )

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        try:
            self.close()
        except BaseException as close_exc:
            if exc is not None:
                if hasattr(exc, "add_note"):
                    exc.add_note(str(close_exc))
                return False
            raise
        return False

    def _open_directory(self, components: tuple[str, ...]) -> int:
        cached = self._directory_fds.get(components)
        if cached is not None:
            return cached
        parent_components = components[:-1]
        parent_fd = self._open_directory(parent_components)
        leaf = components[-1]
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
        try:
            fd = os.open(leaf, flags, dir_fd=parent_fd)
        except OSError as exc:
            display = os.path.join(self.repo_root, *components)
            raise PublisherSafetyError(
                f"cannot anchor transaction directory {display}: {exc}"
            ) from exc
        opened = os.fstat(fd)
        if not stat.S_ISDIR(opened.st_mode):
            os.close(fd)
            raise PublisherSafetyError(
                f"transaction path component is not a directory: "
                f"{os.path.join(self.repo_root, *components)}"
            )
        self._directory_fds[components] = fd
        self._directory_ids[components] = (opened.st_dev, opened.st_ino)
        return fd

    def bind(self, path: str) -> AnchoredFile:
        absolute = _transaction_absolute_path(path, self.repo_root)
        try:
            if os.path.commonpath([absolute, self.repo_root]) != self.repo_root:
                raise ValueError
        except ValueError as exc:
            raise PublisherSafetyError(
                f"transaction path escapes repository root: {path}"
            ) from exc
        relative = os.path.relpath(absolute, self.repo_root)
        parts = tuple(relative.split(os.sep))
        if (
            not parts
            or parts[-1] in ("", ".", "..")
            or any(part in ("", ".", "..") for part in parts)
            or os.sep in parts[-1]
        ):
            raise PublisherSafetyError(f"invalid transaction file path: {path}")
        parent_components = parts[:-1]
        parent_fd = self._open_directory(parent_components)
        parent_device, parent_inode = self._directory_ids[parent_components]
        return AnchoredFile(
            path=absolute,
            parent_path=os.path.dirname(absolute),
            name=parts[-1],
            parent_fd=parent_fd,
            parent_device=parent_device,
            parent_inode=parent_inode,
        )

    def verify_bindings(self) -> None:
        try:
            named_root = os.stat(self.repo_root, follow_symlinks=False)
        except OSError as exc:
            raise PublisherSafetyError(
                f"repository root is no longer reachable: {self.repo_root}"
            ) from exc
        if (named_root.st_dev, named_root.st_ino) != self._directory_ids[()]:
            raise PublisherSafetyError(
                f"repository root identity changed during publish: {self.repo_root}"
            )
        for components in sorted(self._directory_fds, key=len):
            if not components:
                continue
            parent_fd = self._directory_fds[components[:-1]]
            try:
                current = os.stat(
                    components[-1], dir_fd=parent_fd, follow_symlinks=False
                )
            except OSError as exc:
                raise PublisherSafetyError(
                    "transaction directory was moved or replaced: "
                    + os.path.join(self.repo_root, *components)
                ) from exc
            if (
                not stat.S_ISDIR(current.st_mode)
                or (current.st_dev, current.st_ino) != self._directory_ids[components]
            ):
                raise PublisherSafetyError(
                    "transaction directory identity changed: "
                    + os.path.join(self.repo_root, *components)
                )


def _snapshot_at(parent_fd: int, name: str, display_path: str) -> FileSnapshot:
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC
    if hasattr(os, "O_NONBLOCK"):
        flags |= os.O_NONBLOCK
    try:
        entry_before = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        fd = os.open(name, flags, dir_fd=parent_fd)
    except FileNotFoundError:
        return FileSnapshot(False)
    except OSError as exc:
        raise PublisherSafetyError(f"cannot snapshot {display_path}: {exc}") from exc
    try:
        opened_before = os.fstat(fd)
        if not stat.S_ISREG(opened_before.st_mode):
            raise PublisherSafetyError(
                f"transaction target must be a regular file: {display_path}"
            )
        if (entry_before.st_dev, entry_before.st_ino) != (
            opened_before.st_dev,
            opened_before.st_ino,
        ):
            raise PublisherSafetyError(
                f"transaction target identity changed while opening: {display_path}"
            )
        chunks: list[bytes] = []
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        opened_after = os.fstat(fd)
        entry_after = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        stable_fields_before = (
            opened_before.st_dev,
            opened_before.st_ino,
            opened_before.st_size,
            opened_before.st_mtime_ns,
            opened_before.st_ctime_ns,
            stat.S_IMODE(opened_before.st_mode),
        )
        stable_fields_after = (
            opened_after.st_dev,
            opened_after.st_ino,
            opened_after.st_size,
            opened_after.st_mtime_ns,
            opened_after.st_ctime_ns,
            stat.S_IMODE(opened_after.st_mode),
        )
        if stable_fields_before != stable_fields_after or (
            entry_after.st_dev,
            entry_after.st_ino,
        ) != (opened_after.st_dev, opened_after.st_ino):
            raise PublisherSafetyError(
                f"transaction target changed while being read: {display_path}"
            )
        return FileSnapshot(
            True,
            b"".join(chunks),
            stat.S_IMODE(opened_after.st_mode),
            opened_after.st_dev,
            opened_after.st_ino,
        )
    except FileNotFoundError as exc:
        raise PublisherSafetyError(
            f"transaction target disappeared while being read: {display_path}"
        ) from exc
    finally:
        os.close(fd)


def _snapshot_anchored(target: AnchoredFile) -> FileSnapshot:
    return _snapshot_at(target.parent_fd, target.name, target.path)


def _snapshots_equal(
    actual: FileSnapshot,
    expected: FileSnapshot,
    *,
    identity: bool = True,
) -> bool:
    if actual.existed != expected.existed:
        return False
    if not actual.existed:
        return True
    if actual.content != expected.content or actual.mode != expected.mode:
        return False
    return not identity or (
        actual.device == expected.device and actual.inode == expected.inode
    )


def _unique_internal_name(parent_fd: int, prefix: str) -> str:
    for _attempt in range(100):
        name = f"{prefix}{uuid.uuid4().hex}"
        try:
            os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            return name
        except OSError as exc:
            raise PublisherSafetyError(
                f"cannot reserve transaction recovery name: {exc}"
            ) from exc
    raise PublisherSafetyError("cannot allocate a unique transaction recovery name")


def _stage_anchored_content(
    target: AnchoredFile,
    content: bytes,
    mode: int,
) -> tuple[str, FileSnapshot]:
    temp_name = _unique_internal_name(target.parent_fd, ".sam-publish-")
    fd: int | None = None
    active_error: BaseException | None = None
    try:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC
        fd = os.open(temp_name, flags, 0o600, dir_fd=target.parent_fd)
        offset = 0
        while offset < len(content):
            written = os.write(fd, content[offset:])
            if written <= 0:
                raise OSError("short write while staging publish content")
            offset += written
        os.fchmod(fd, mode)
        os.fsync(fd)
        staged_stat = os.fstat(fd)
        staged = FileSnapshot(
            True,
            content,
            stat.S_IMODE(staged_stat.st_mode),
            staged_stat.st_dev,
            staged_stat.st_ino,
        )
        os.close(fd)
        fd = None
        named_staged = _snapshot_at(
            target.parent_fd,
            temp_name,
            os.path.join(target.parent_path, temp_name),
        )
        if not _snapshots_equal(named_staged, staged):
            raise PublisherSafetyError(
                f"staged publish file identity changed for {target.path}"
            )
        return temp_name, staged
    except BaseException as exc:
        active_error = exc
        raise
    finally:
        cleanup_failures: list[str] = []
        if fd is not None:
            try:
                os.close(fd)
            except BaseException as cleanup_exc:
                cleanup_failures.append(f"could not close staged file: {cleanup_exc}")
        if active_error is not None:
            try:
                os.unlink(temp_name, dir_fd=target.parent_fd)
            except FileNotFoundError:
                pass
            except BaseException as cleanup_exc:
                cleanup_failures.append(
                    f"could not remove staged file {temp_name}: {cleanup_exc}"
                )
        if cleanup_failures:
            detail = "; ".join(cleanup_failures)
            if active_error is not None and hasattr(active_error, "add_note"):
                active_error.add_note(detail)
            elif active_error is None:
                raise PublisherSafetyError(detail)


def _link_no_replace(parent_fd: int, source: str, destination: str) -> None:
    os.link(
        source,
        destination,
        src_dir_fd=parent_fd,
        dst_dir_fd=parent_fd,
        follow_symlinks=False,
    )


def _apply_anchored_write(
    target: AnchoredFile,
    content: bytes,
    mode: int,
    before: FileSnapshot,
    journal: list[AppliedFileMutation],
) -> AppliedFileMutation:
    temp_name = ""
    active_error: BaseException | None = None
    try:
        temp_name, staged = _stage_anchored_content(target, content, mode)
        quarantine_name = (
            _unique_internal_name(target.parent_fd, ".sam-original-")
            if before.existed
            else None
        )
        mutation = AppliedFileMutation(
            target=target,
            before=before,
            quarantine_name=quarantine_name,
            installed_content=content,
            installed_mode=mode,
            installed_device=int(staged.device),
            installed_inode=int(staged.inode),
        )
        # Journal before the first namespace mutation so an asynchronous
        # BaseException delivered after rename/link still has a recovery record.
        journal.append(mutation)
        if quarantine_name is not None:
            os.rename(
                target.name,
                quarantine_name,
                src_dir_fd=target.parent_fd,
                dst_dir_fd=target.parent_fd,
            )
            detached = _snapshot_at(
                target.parent_fd,
                quarantine_name,
                os.path.join(target.parent_path, quarantine_name),
            )
            if not _snapshots_equal(detached, before):
                # Preserve the actual bytes atomically detached at the commit
                # boundary. Rollback will restore those, not a stale snapshot.
                mutation.before = detached
                raise PublisherSafetyError(
                    f"{target.path}: target changed before commit (stale revision)"
                )
        try:
            _link_no_replace(target.parent_fd, temp_name, target.name)
        except FileExistsError as exc:
            raise PublisherSafetyError(
                f"{target.path}: target appeared during commit (stale revision)"
            ) from exc
        mutation.install_complete = True
        installed = _snapshot_anchored(target)
        if not _snapshots_equal(installed, staged):
            raise PublisherSafetyError(
                f"installed publish file identity changed for {target.path}"
            )
        os.unlink(temp_name, dir_fd=target.parent_fd)
        temp_name = ""
        os.fsync(target.parent_fd)
        return mutation
    except BaseException as exc:
        active_error = exc
        raise
    finally:
        if temp_name:
            try:
                os.unlink(temp_name, dir_fd=target.parent_fd)
            except FileNotFoundError:
                pass
            except BaseException as cleanup_exc:
                if active_error is not None and hasattr(active_error, "add_note"):
                    active_error.add_note(
                        f"could not remove staged file {temp_name}: {cleanup_exc}"
                    )
                elif active_error is None:
                    raise PublisherSafetyError(
                        f"could not remove staged file {temp_name}: {cleanup_exc}"
                    ) from cleanup_exc


def _mutation_owns_snapshot(
    mutation: AppliedFileMutation,
    snapshot: FileSnapshot,
) -> bool:
    if not snapshot.existed or (
        snapshot.device,
        snapshot.inode,
    ) != (mutation.installed_device, mutation.installed_inode):
        return False
    return (
        snapshot.content == mutation.installed_content
        and snapshot.mode == mutation.installed_mode
    )


def _restore_quarantine(
    mutation: AppliedFileMutation,
    quarantine_snapshot: FileSnapshot,
) -> None:
    target = mutation.target
    assert mutation.quarantine_name is not None
    _link_no_replace(target.parent_fd, mutation.quarantine_name, target.name)
    restored = _snapshot_anchored(target)
    if not _snapshots_equal(restored, quarantine_snapshot):
        raise PublisherSafetyError(
            f"restored file identity changed for {target.path}"
        )
    os.unlink(mutation.quarantine_name, dir_fd=target.parent_fd)
    os.fsync(target.parent_fd)


def _rollback_one_mutation(mutation: AppliedFileMutation) -> list[str]:
    target = mutation.target
    conflicts: list[str] = []
    quarantine = FileSnapshot(False)
    if mutation.quarantine_name is not None:
        quarantine = _snapshot_at(
            target.parent_fd,
            mutation.quarantine_name,
            os.path.join(target.parent_path, mutation.quarantine_name),
        )
        if quarantine.existed and not _snapshots_equal(quarantine, mutation.before):
            conflicts.append(
                f"{target.path}: original quarantine changed; recovery copy retained as "
                f"{mutation.quarantine_name}"
            )
            return conflicts

    current = _snapshot_anchored(target)
    if not current.existed:
        if mutation.install_complete:
            if quarantine.existed:
                conflicts.append(
                    f"{target.path}: concurrent deletion preserved; original retained as "
                    f"{mutation.quarantine_name}"
                )
            else:
                conflicts.append(f"{target.path}: concurrent deletion preserved")
            return conflicts
        if quarantine.existed:
            try:
                _restore_quarantine(mutation, quarantine)
            except FileExistsError:
                conflicts.append(
                    f"{target.path}: destination reappeared during rollback; original "
                    f"retained as {mutation.quarantine_name}"
                )
        elif mutation.before.existed:
            conflicts.append(f"{target.path}: original quarantine is missing")
        return conflicts

    if not _mutation_owns_snapshot(mutation, current):
        if quarantine.existed:
            conflicts.append(
                f"{target.path}: concurrent bytes preserved; original retained as "
                f"{mutation.quarantine_name}"
            )
        elif not _snapshots_equal(current, mutation.before):
            conflicts.append(f"{target.path}: concurrent bytes preserved")
        return conflicts

    detached_name = _unique_internal_name(target.parent_fd, ".sam-rollback-")
    os.rename(
        target.name,
        detached_name,
        src_dir_fd=target.parent_fd,
        dst_dir_fd=target.parent_fd,
    )
    detached = _snapshot_at(
        target.parent_fd,
        detached_name,
        os.path.join(target.parent_path, detached_name),
    )
    if not _mutation_owns_snapshot(mutation, detached):
        # It changed after the comparison but before atomic detachment. Put it
        # back only if the live name is still absent; never overwrite a racer.
        try:
            _link_no_replace(target.parent_fd, detached_name, target.name)
            os.unlink(detached_name, dir_fd=target.parent_fd)
        except FileExistsError:
            conflicts.append(
                f"{target.path}: rollback race preserved as {detached_name}"
            )
        else:
            conflicts.append(f"{target.path}: concurrent bytes preserved")
        return conflicts

    try:
        if quarantine.existed:
            _restore_quarantine(mutation, quarantine)
        elif mutation.before.existed:
            conflicts.append(f"{target.path}: original quarantine is missing")
    except FileExistsError:
        conflicts.append(
            f"{target.path}: destination reappeared during rollback; original retained as "
            f"{mutation.quarantine_name}"
        )
    if conflicts:
        # Preserve the detached transaction postimage for diagnosis if the
        # original could not be restored without overwriting another writer.
        return conflicts
    os.unlink(detached_name, dir_fd=target.parent_fd)
    os.fsync(target.parent_fd)
    return conflicts


def _rollback_mutations(journal: list[AppliedFileMutation]) -> None:
    failures: list[str] = []
    for mutation in reversed(journal):
        try:
            failures.extend(_rollback_one_mutation(mutation))
        except BaseException as exc:
            failures.append(f"{mutation.target.path}: {exc}")
    if failures:
        raise PublisherSafetyError(
            "PUBLISH_TRANSACTION_ROLLBACK_CONFLICT: " + "; ".join(failures)
        )


def _validate_mutations_for_commit(journal: list[AppliedFileMutation]) -> None:
    for mutation in journal:
        current = _snapshot_anchored(mutation.target)
        if not _mutation_owns_snapshot(mutation, current):
            raise PublisherSafetyError(
                f"transaction output changed before commit: {mutation.target.path}"
            )
        if mutation.quarantine_name is None:
            continue
        original = _snapshot_at(
            mutation.target.parent_fd,
            mutation.quarantine_name,
            os.path.join(mutation.target.parent_path, mutation.quarantine_name),
        )
        if not _snapshots_equal(original, mutation.before):
            raise PublisherSafetyError(
                f"original quarantine identity changed for {mutation.target.path}"
            )


def _cleanup_mutation_quarantines(
    journal: list[AppliedFileMutation],
) -> list[str]:
    cleanup_failures: list[str] = []
    for mutation in journal:
        if mutation.quarantine_name is None:
            continue
        try:
            os.unlink(mutation.quarantine_name, dir_fd=mutation.target.parent_fd)
            os.fsync(mutation.target.parent_fd)
        except BaseException as exc:
            cleanup_failures.append(f"{mutation.target.path}: {exc}")
    return cleanup_failures


def snapshot_file(path: str) -> FileSnapshot:
    """Compatibility snapshot using a no-follow descriptor for the parent."""
    _require_safe_transaction_primitives()
    absolute = os.path.abspath(path)
    parent = os.path.dirname(absolute)
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    try:
        parent_fd = os.open(parent, flags)
    except OSError as exc:
        raise PublisherSafetyError(f"cannot anchor parent for {path}: {exc}") from exc
    try:
        return _snapshot_at(parent_fd, os.path.basename(absolute), absolute)
    finally:
        os.close(parent_fd)


def atomic_write_bytes(path: str, content: bytes, mode: int | None = None) -> None:
    """Compatibility single-file transaction with anchored CAS rollback."""
    absolute = os.path.abspath(path)
    parent = os.path.dirname(absolute)
    if not os.path.isdir(parent):
        raise PublisherSafetyError(f"publish parent directory does not exist: {parent}")
    with _AnchoredRepository(parent) as anchors:
        target = anchors.bind(os.path.basename(absolute))
        before = _snapshot_anchored(target)
        journal: list[AppliedFileMutation] = []
        try:
            _apply_anchored_write(
                target,
                content,
                mode if mode is not None else (before.mode if before.existed else 0o644),
                before,
                journal,
            )
        except BaseException:
            _rollback_mutations(journal)
            raise
        _validate_mutations_for_commit(journal)
        cleanup_failures = _cleanup_mutation_quarantines(journal)
        if cleanup_failures:
            raise PublisherSafetyError(
                "publish committed but could not remove recovery copies: "
                + "; ".join(cleanup_failures)
            )


def _consume_absent_stub_authorizations_bytes(
    slugs: list[str],
    content: bytes,
    registry_path: str,
) -> bytes:
    try:
        registry = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PublisherSafetyError(
            f"cannot read absent-stub registry {registry_path}: {exc}"
        ) from exc
    if not isinstance(registry, dict) or registry.get("schema_version") != 1:
        raise PublisherSafetyError("absent-stub registry must be a schema_version 1 object")
    declared = registry.get("absent_stub_slugs")
    if not isinstance(declared, list) or any(
        not isinstance(slug, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug)
        for slug in declared
    ):
        raise PublisherSafetyError("absent-stub registry contains invalid absent_stub_slugs")
    if len(set(declared)) != len(declared):
        raise PublisherSafetyError("absent-stub registry contains duplicate slugs")

    requested = set(slugs)
    missing = sorted(requested - set(declared))
    if missing:
        raise PublisherSafetyError(
            "missing one-shot absent-stub authorization for: " + ", ".join(missing)
        )
    registry["absent_stub_slugs"] = sorted(set(declared) - requested)
    return (json.dumps(registry, indent=2) + "\n").encode("utf-8")


def consume_absent_stub_authorizations(slugs: list[str], registry_path: str) -> None:
    """Consume one-shot repository authorization after creating missing stubs."""
    if not slugs:
        return
    snapshot = snapshot_file(registry_path)
    if not snapshot.existed:
        raise PublisherSafetyError(
            f"cannot read absent-stub registry {registry_path}: file does not exist"
        )
    updated = _consume_absent_stub_authorizations_bytes(
        slugs, snapshot.content, registry_path
    )
    atomic_write_bytes(registry_path, updated, snapshot.mode)


@contextmanager
def _anchored_staging_directory(prefix: str):
    _require_safe_transaction_primitives()
    if sys.platform != "linux" or not os.path.isdir("/proc/self/fd"):
        raise PublisherSafetyError(
            "safe staged refresh requires Linux /proc/self/fd directory anchoring"
        )
    staging_base = os.path.realpath(tempfile.gettempdir())
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    base_fd = os.open(staging_base, flags)
    parent_name = ""
    parent_fd: int | None = None
    output_fd: int | None = None
    active_error: BaseException | None = None
    cleanup_failures: list[str] = []
    try:
        for _attempt in range(100):
            parent_name = f"{prefix}{uuid.uuid4().hex}"
            try:
                os.mkdir(parent_name, 0o700, dir_fd=base_fd)
                break
            except FileExistsError:
                parent_name = ""
        else:  # pragma: no cover - cryptographically improbable exhaustion
            raise PublisherSafetyError("cannot allocate private staging directory")

        parent_fd = os.open(parent_name, flags, dir_fd=base_fd)
        parent_stat = os.fstat(parent_fd)
        named_parent = os.stat(parent_name, dir_fd=base_fd, follow_symlinks=False)
        if (parent_stat.st_dev, parent_stat.st_ino) != (
            named_parent.st_dev,
            named_parent.st_ino,
        ):
            raise PublisherSafetyError(
                "staging parent changed identity during acquisition"
            )

        os.mkdir("output", 0o700, dir_fd=parent_fd)
        output_fd = os.open("output", flags, dir_fd=parent_fd)
        output_stat = os.fstat(output_fd)
        named_output = os.stat("output", dir_fd=parent_fd, follow_symlinks=False)
        if (
            output_fd < 3
            or not stat.S_ISDIR(output_stat.st_mode)
            or (output_stat.st_dev, output_stat.st_ino)
            != (named_output.st_dev, named_output.st_ino)
        ):
            raise PublisherSafetyError(
                "staged refresh directory could not be safely anchored"
            )
        yield output_fd, f"/proc/self/fd/{output_fd}"
    except BaseException as exc:
        active_error = exc
        raise
    finally:
        if output_fd is not None:
            try:
                for entry_name in os.listdir(output_fd):
                    entry = os.stat(
                        entry_name,
                        dir_fd=output_fd,
                        follow_symlinks=False,
                    )
                    if stat.S_ISDIR(entry.st_mode):
                        cleanup_failures.append(
                            f"unexpected staging subdirectory retained: {entry_name}"
                        )
                    else:
                        os.unlink(entry_name, dir_fd=output_fd)
                output_identity = (
                    os.fstat(output_fd).st_dev,
                    os.fstat(output_fd).st_ino,
                )
                matching_names: list[str] = []
                if parent_fd is not None:
                    for entry_name in os.listdir(parent_fd):
                        entry = os.stat(
                            entry_name,
                            dir_fd=parent_fd,
                            follow_symlinks=False,
                        )
                        if (entry.st_dev, entry.st_ino) == output_identity:
                            matching_names.append(entry_name)
                    if len(matching_names) == 1 and not os.listdir(output_fd):
                        os.rmdir(matching_names[0], dir_fd=parent_fd)
                    elif len(matching_names) != 1:
                        cleanup_failures.append(
                            "anchored staging output was moved outside its private parent; "
                            "original residue retained"
                        )
            except BaseException as cleanup_exc:
                cleanup_failures.append(
                    f"could not clean anchored staging output: {cleanup_exc}"
                )
            finally:
                try:
                    os.close(output_fd)
                except BaseException as cleanup_exc:
                    cleanup_failures.append(
                        f"could not close staging output anchor: {cleanup_exc}"
                    )

        if parent_fd is not None:
            try:
                current_parent = os.stat(
                    parent_name,
                    dir_fd=base_fd,
                    follow_symlinks=False,
                )
                held_parent = os.fstat(parent_fd)
                if (current_parent.st_dev, current_parent.st_ino) != (
                    held_parent.st_dev,
                    held_parent.st_ino,
                ):
                    cleanup_failures.append(
                        "staging parent identity changed; replacement preserved and "
                        f"original residue retained (dev={held_parent.st_dev}, "
                        f"ino={held_parent.st_ino})"
                    )
                elif os.listdir(parent_fd):
                    cleanup_failures.append(
                        "staging parent contains replacement entries; residue retained"
                    )
                else:
                    os.rmdir(parent_name, dir_fd=base_fd)
            except FileNotFoundError:
                try:
                    held_parent = os.fstat(parent_fd)
                    cleanup_failures.append(
                        "staging parent was moved; original residue retained "
                        f"(dev={held_parent.st_dev}, ino={held_parent.st_ino})"
                    )
                except BaseException as cleanup_exc:
                    cleanup_failures.append(
                        f"staging parent was moved and could not be identified: {cleanup_exc}"
                    )
            except BaseException as cleanup_exc:
                cleanup_failures.append(
                    f"could not clean anchored staging parent: {cleanup_exc}"
                )
            finally:
                try:
                    os.close(parent_fd)
                except BaseException as cleanup_exc:
                    cleanup_failures.append(
                        f"could not close staging parent anchor: {cleanup_exc}"
                    )
        elif parent_name:
            # Without an opened identity, even an empty pathname could be a
            # same-user replacement. Preserve it rather than deleting unknown
            # bytes after a failed acquisition.
            cleanup_failures.append(
                f"unanchored staging parent retained for recovery: {parent_name}"
            )
        try:
            os.close(base_fd)
        except BaseException as cleanup_exc:
            cleanup_failures.append(
                f"could not close staging base anchor: {cleanup_exc}"
            )

        if cleanup_failures:
            cleanup_error = PublisherSafetyError(
                "staged refresh cleanup conflict: " + "; ".join(cleanup_failures)
            )
            if active_error is not None:
                if hasattr(active_error, "add_note"):
                    active_error.add_note(str(cleanup_error))
            else:
                raise cleanup_error


def _read_staged_content_state_outputs(
    output_fd: int,
    producer_label: str,
) -> tuple[bytes, bytes]:
    manifest_name = os.path.basename(CONTENT_STATE_MANIFEST)
    report_name = os.path.basename(CONTENT_STATE_REPORT)
    manifest_snapshot = _snapshot_at(
        output_fd,
        manifest_name,
        f"/proc/self/fd/{output_fd}/{manifest_name}",
    )
    report_snapshot = _snapshot_at(
        output_fd,
        report_name,
        f"/proc/self/fd/{output_fd}/{report_name}",
    )
    if not manifest_snapshot.existed:
        raise PublisherSafetyError(
            f"{producer_label} did not produce required manifest"
        )
    if not report_snapshot.existed:
        raise PublisherSafetyError(
            f"{producer_label} did not produce required report"
        )
    return manifest_snapshot.content, report_snapshot.content


def refresh_content_state_artifacts(
    *,
    repo_root: str | None = None,
    generator_path: str = CONTENT_STATE_GENERATOR,
) -> tuple[bytes, bytes]:
    """Generate manifest/report into an isolated directory and return bytes.

    The caller installs these bytes through its held repository dirfds. The
    generator never receives a live repository artifact path, so swapping the
    ``brand-canon`` pathname while it runs cannot redirect its writes.
    """
    root = os.path.abspath(repo_root or os.path.dirname(__file__))
    generator = generator_path if os.path.isabs(generator_path) else os.path.join(root, generator_path)
    with _anchored_staging_directory("sam-content-state-") as (
        output_fd,
        _output_anchor,
    ):
        completed = subprocess.run(
            ["node", generator, "--write", "--output-fd", str(output_fd)],
            cwd=root,
            text=True,
            capture_output=True,
            check=False,
            pass_fds=(output_fd,),
        )
        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or "unknown generator failure").strip()
            raise PublisherSafetyError(
                f"content-state generator failed with exit {completed.returncode}: {detail}"
            )
        return _read_staged_content_state_outputs(
            output_fd, "content-state generator"
        )


def _run_staged_refresh_callback(
    refresh_content_state_fn: Callable[[str], None],
) -> tuple[bytes, bytes]:
    """Run a custom producer with only an isolated output directory.

    The former zero-argument callback contract invited callers to mutate the
    canonical manifest/report paths. Requiring a staging-directory argument
    makes those legacy callbacks fail before their bodies execute; only bytes
    read back from the isolated directory are eligible for anchored commit.
    """
    with _anchored_staging_directory("sam-content-state-callback-") as (
        output_fd,
        output_anchor,
    ):
        refresh_content_state_fn(output_anchor)
        return _read_staged_content_state_outputs(
            output_fd, "custom content-state refresh"
        )


def _execute_publish_transaction_locked(
    plans: list[PublishPlan],
    *,
    wiki_dir: str = WIKI_DIR,
    sitemap_path: str = SITEMAP_PATH,
    manifest_path: str = CONTENT_STATE_MANIFEST,
    report_path: str = CONTENT_STATE_REPORT,
    absent_stubs_path: str = ABSENT_STUB_REGISTRY,
    refresh_content_state_fn: Callable[[str], None] | None = None,
    repo_root: str,
    transaction_lock: RepositoryPublishLock,
) -> dict[str, int]:
    """Apply preflighted plans and atomically refresh repository ownership state.

    Page, sitemap, manifest, and report bytes are restored if any write,
    generator, or post-generation verification step fails.
    """
    _require_publish_lock(transaction_lock, repo_root)
    _validate_transaction_path_scope(
        plans,
        repo_root=repo_root,
        wiki_dir=wiki_dir,
        sitemap_path=sitemap_path,
        manifest_path=manifest_path,
        report_path=report_path,
        absent_stubs_path=absent_stubs_path,
    )
    write_plans = [plan for plan in plans if plan.html is not None]
    guarded_plans = [
        plan for plan in plans if plan.html is not None or plan.action == "noop"
    ]
    counts = {
        "written": len(write_plans),
        "preserved": sum(plan.html is None and plan.action != "noop" for plan in plans),
        "noops": sum(plan.action == "noop" for plan in plans),
    }
    if not guarded_plans:
        return counts

    created_stub_slugs = sorted(
        os.path.basename(plan.out_path).removesuffix(".html")
        for plan in write_plans
        if plan.action == "stub" and plan.creates_page
    )

    if refresh_content_state_fn is None:
        canonical_repo_root = os.path.abspath(os.path.dirname(__file__))
        if os.path.abspath(repo_root) != canonical_repo_root:
            raise PublisherSafetyError(
                "default content-state refresh requires the canonical repository root"
            )
        canonical_manifest = os.path.join(canonical_repo_root, CONTENT_STATE_MANIFEST)
        canonical_report = os.path.join(canonical_repo_root, CONTENT_STATE_REPORT)
        canonical_absent_stubs = os.path.join(canonical_repo_root, ABSENT_STUB_REGISTRY)
        if os.path.abspath(manifest_path) != canonical_manifest:
            raise PublisherSafetyError(
                "controlled writes require the canonical repository content-state manifest"
            )
        if os.path.abspath(report_path) != canonical_report:
            raise PublisherSafetyError(
                "controlled writes require the canonical repository rewrite audit report"
            )
        if created_stub_slugs and os.path.abspath(absent_stubs_path) != canonical_absent_stubs:
            raise PublisherSafetyError(
                "new stubs require the canonical repository absent-stub registry"
            )

    created_stub = bool(created_stub_slugs)
    guarded_plan_paths = [
        _transaction_absolute_path(plan.out_path, repo_root)
        for plan in guarded_plans
    ]
    if len(guarded_plan_paths) != len(set(guarded_plan_paths)):
        raise PublisherSafetyError("duplicate guarded publish target in transaction plans")
    touched_paths = {
        *guarded_plan_paths,
    }
    if write_plans:
        touched_paths.update({
            _transaction_absolute_path(sitemap_path, repo_root),
            _transaction_absolute_path(manifest_path, repo_root),
            _transaction_absolute_path(report_path, repo_root),
        })
    if created_stub:
        touched_paths.add(_transaction_absolute_path(absent_stubs_path, repo_root))

    try:
        locked_root_stat = os.fstat(transaction_lock.root_fd)
    except OSError as exc:
        raise PublisherSafetyError(
            f"held repository root descriptor was lost: {repo_root}"
        ) from exc
    locked_root_identity = (locked_root_stat.st_dev, locked_root_stat.st_ino)

    with _AnchoredRepository(
        repo_root,
        expected_root_identity=locked_root_identity,
    ) as anchors:
        targets = {path: anchors.bind(path) for path in sorted(touched_paths)}
        target_keys: set[tuple[int, int, str]] = set()
        for target in targets.values():
            key = (target.parent_device, target.parent_inode, target.name)
            if key in target_keys:
                raise PublisherSafetyError(
                    f"duplicate transaction target resolves to {target.path}"
                )
            target_keys.add(key)
        anchors.verify_bindings()
        snapshots = {
            path: _snapshot_anchored(target) for path, target in targets.items()
        }

        if write_plans:
            authorization_identities = {
                plan.authorization_manifest_identity for plan in write_plans
            }
            if None in authorization_identities:
                raise PublisherSafetyError(
                    "article writes require plans authorized by "
                    "load_content_state_manifest()"
                )
            if len(authorization_identities) != 1:
                raise PublisherSafetyError(
                    "publish plans were authorized by different content-state manifests"
                )
            authorization_identity = next(iter(authorization_identities))
            assert authorization_identity is not None
            manifest_key = _transaction_absolute_path(manifest_path, repo_root)

            def manifest_snapshot_identity(
                manifest_snapshot: FileSnapshot,
            ) -> ContentStateManifestIdentity | None:
                return (
                    ContentStateManifestIdentity(
                        content_bytes=manifest_snapshot.content,
                        content_hash=sha256_bytes(manifest_snapshot.content),
                        byte_length=len(manifest_snapshot.content),
                    )
                    if manifest_snapshot.existed
                    else None
                )

            def assert_manifest_snapshot_authorized(
                manifest_snapshot: FileSnapshot,
            ) -> None:
                if manifest_snapshot_identity(manifest_snapshot) != authorization_identity:
                    raise PublisherSafetyError(
                        "content-state manifest changed after planning; "
                        "article-write authorization is stale"
                    )

            def assert_manifest_authorization_current() -> None:
                assert_manifest_snapshot_authorized(
                    _snapshot_anchored(targets[manifest_key])
                )

            # The rollback/CAS base itself must be the authorizing manifest,
            # never a newer manifest observed during transaction setup. Then
            # re-check the live anchored file before every page mutation. The
            # shared lock excludes cooperating publishers; live re-snapshots
            # also catch uncoordinated revocations before writes.
            assert_manifest_snapshot_authorized(snapshots[manifest_key])
            assert_manifest_authorization_current()

        # Validate exactly the descriptor-anchored bytes captured for rollback.
        for plan in guarded_plans:
            plan_path = _transaction_absolute_path(plan.out_path, repo_root)
            page_snapshot = snapshots[plan_path]
            if plan.creates_page:
                if page_snapshot.existed:
                    raise PublisherSafetyError(
                        f"{plan.out_path}: page appeared after preflight (stale revision)"
                    )
                continue
            if not page_snapshot.existed:
                raise PublisherSafetyError(
                    f"{plan.out_path}: page disappeared after preflight (stale revision)"
                )
            snapshot_hash = sha256_bytes(page_snapshot.content)
            if not plan.base_content_hash or snapshot_hash != plan.base_content_hash:
                raise PublisherSafetyError(
                    f"{plan.out_path}: page changed after preflight (stale revision)"
                )

        anchors.verify_bindings()
        if not write_plans:
            return counts

        journal: list[AppliedFileMutation] = []
        page_mutations: dict[str, AppliedFileMutation] = {}
        committed = False
        cleanup_failures: list[str] = []
        try:
            for plan in write_plans:
                assert_manifest_authorization_current()
                plan_path = _transaction_absolute_path(plan.out_path, repo_root)
                previous = snapshots[plan_path]
                page_mutations[plan_path] = _apply_anchored_write(
                    targets[plan_path],
                    str(plan.html).encode("utf-8"),
                    int(previous.mode) if previous.existed else 0o644,
                    previous,
                    journal,
                )

            if created_stub:
                wiki_target = targets[
                    _transaction_absolute_path(write_plans[0].out_path, repo_root)
                ]
                html_files: list[str] = []
                try:
                    wiki_names = os.listdir(wiki_target.parent_fd)
                except OSError as exc:
                    raise PublisherSafetyError(
                        f"cannot list anchored wiki directory {wiki_dir}: {exc}"
                    ) from exc
                for name in wiki_names:
                    if not name.endswith(".html"):
                        continue
                    try:
                        candidate = os.stat(
                            name,
                            dir_fd=wiki_target.parent_fd,
                            follow_symlinks=False,
                        )
                    except OSError as exc:
                        raise PublisherSafetyError(
                            f"cannot inspect wiki sitemap candidate {name}: {exc}"
                        ) from exc
                    if not stat.S_ISREG(candidate.st_mode):
                        raise PublisherSafetyError(
                            f"wiki sitemap candidate must be a regular file: {name}"
                        )
                    html_files.append(name)

                sitemap_key = _transaction_absolute_path(sitemap_path, repo_root)
                sitemap_snapshot = snapshots[sitemap_key]
                sitemap_content = _build_sitemap_from_bytes(
                    html_files,
                    sitemap_snapshot.content if sitemap_snapshot.existed else None,
                ).encode("utf-8")
                _apply_anchored_write(
                    targets[sitemap_key],
                    sitemap_content,
                    int(sitemap_snapshot.mode) if sitemap_snapshot.existed else 0o644,
                    sitemap_snapshot,
                    journal,
                )

                registry_key = _transaction_absolute_path(absent_stubs_path, repo_root)
                registry_snapshot = snapshots[registry_key]
                if not registry_snapshot.existed:
                    raise PublisherSafetyError(
                        f"cannot read absent-stub registry {absent_stubs_path}: "
                        "file does not exist"
                    )
                updated_registry = _consume_absent_stub_authorizations_bytes(
                    created_stub_slugs,
                    registry_snapshot.content,
                    absent_stubs_path,
                )
                _apply_anchored_write(
                    targets[registry_key],
                    updated_registry,
                    int(registry_snapshot.mode),
                    registry_snapshot,
                    journal,
                )

            manifest_key = _transaction_absolute_path(manifest_path, repo_root)
            report_key = _transaction_absolute_path(report_path, repo_root)
            assert_manifest_authorization_current()
            anchors.verify_bindings()
            if refresh_content_state_fn is None:
                generated_manifest, generated_report = refresh_content_state_artifacts(
                    repo_root=repo_root
                )
            else:
                generated_manifest, generated_report = _run_staged_refresh_callback(
                    refresh_content_state_fn
                )
            anchors.verify_bindings()
            # A generator may take long enough for an uncoordinated writer to
            # revoke policy. Abort before attempting to install refreshed
            # artifacts, leaving those concurrent manifest bytes untouched.
            assert_manifest_authorization_current()
            if not generated_report:
                raise PublisherSafetyError(
                    f"content-state generator did not produce required report: {report_path}"
                )
            for artifact_key, generated_content in (
                (manifest_key, generated_manifest),
                (report_key, generated_report),
            ):
                artifact_snapshot = snapshots[artifact_key]
                _apply_anchored_write(
                    targets[artifact_key],
                    generated_content,
                    int(artifact_snapshot.mode)
                    if artifact_snapshot.existed
                    else 0o644,
                    artifact_snapshot,
                    journal,
                )
            refreshed_manifest_snapshot = _snapshot_anchored(targets[manifest_key])
            refreshed_report_snapshot = _snapshot_anchored(targets[report_key])
            refreshed_manifest = _load_content_state_manifest_bytes(
                refreshed_manifest_snapshot.content,
                manifest_path,
            )
            for plan in write_plans:
                plan_path = _transaction_absolute_path(plan.out_path, repo_root)
                live_page = _snapshot_anchored(targets[plan_path])
                expected_page = str(plan.html).encode("utf-8")
                if (
                    not _mutation_owns_snapshot(page_mutations[plan_path], live_page)
                    or live_page.content != expected_page
                ):
                    raise PublisherSafetyError(
                        f"{plan.out_path}: written page changed during content-state refresh"
                    )
                slug = os.path.basename(plan.out_path).removesuffix(".html")
                entry = refreshed_manifest.get(slug)
                if entry is None:
                    raise PublisherSafetyError(
                        f"refreshed content-state manifest is missing written page {slug}"
                    )
                verify_manifest_freshness(entry, plan.out_path, live_page.content)

            anchors.verify_bindings()
            _validate_mutations_for_commit(journal)
            committed = True
            cleanup_failures = _cleanup_mutation_quarantines(journal)
        except BaseException as exc:
            if committed:
                raise
            rollback_exc: BaseException | None = None
            try:
                _rollback_mutations(journal)
            except BaseException as caught_rollback_exc:
                rollback_exc = caught_rollback_exc
            if not isinstance(exc, Exception):
                if rollback_exc is not None and hasattr(exc, "add_note"):
                    exc.add_note(f"publish rollback also failed: {rollback_exc}")
                raise
            if rollback_exc is not None:
                raise PublisherSafetyError(
                    f"publish failed ({exc}); rollback also failed ({rollback_exc})"
                ) from exc
            if isinstance(exc, PublisherSafetyError):
                raise PublisherSafetyError(f"publish transaction rolled back: {exc}") from exc
            raise PublisherSafetyError(f"publish transaction rolled back: {exc}") from exc

        if cleanup_failures:
            raise PublisherSafetyError(
                "publish committed but could not remove recovery copies: "
                + "; ".join(cleanup_failures)
            )

    return counts


def execute_publish_transaction(
    plans: list[PublishPlan],
    *,
    wiki_dir: str = WIKI_DIR,
    sitemap_path: str = SITEMAP_PATH,
    manifest_path: str = CONTENT_STATE_MANIFEST,
    report_path: str = CONTENT_STATE_REPORT,
    absent_stubs_path: str = ABSENT_STUB_REGISTRY,
    refresh_content_state_fn: Callable[[str], None] | None = None,
    repo_root: str | None = None,
    transaction_lock: RepositoryPublishLock | None = None,
) -> dict[str, int]:
    """Execute plans under the shared repository publish lock.

    The CLI acquires this lock before planning and passes it here. Direct callers
    that do not already hold it are still protected during snapshot/commit.
    A custom ``refresh_content_state_fn`` receives one isolated staging-directory
    path and must create ``wiki-content-state.json`` and
    ``wiki-rewrite-audit.md`` there; it must never write canonical artifact paths.
    """
    root = _canonical_fs_path(repo_root or os.path.dirname(__file__))
    _validate_transaction_path_scope(
        plans,
        repo_root=root,
        wiki_dir=wiki_dir,
        sitemap_path=sitemap_path,
        manifest_path=manifest_path,
        report_path=report_path,
        absent_stubs_path=absent_stubs_path,
    )
    options = {
        "wiki_dir": wiki_dir,
        "sitemap_path": sitemap_path,
        "manifest_path": manifest_path,
        "report_path": report_path,
        "absent_stubs_path": absent_stubs_path,
        "refresh_content_state_fn": refresh_content_state_fn,
        "repo_root": root,
    }
    if transaction_lock is not None:
        return _execute_publish_transaction_locked(
            plans,
            transaction_lock=transaction_lock,
            **options,
        )
    with repository_publish_lock(root) as acquired_lock:
        return _execute_publish_transaction_locked(
            plans,
            transaction_lock=acquired_lock,
            **options,
        )


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate(data_path: str) -> list[dict]:
    """Load and validate input. Supports export JSON, SAM facts JSON, and entity memory JSON."""
    if not os.path.exists(data_path):
        print(f"[ERROR] Input file not found: {data_path}", file=sys.stderr)
        sys.exit(1)

    try:
        with open(data_path, encoding="utf-8") as fh:
            raw = json.load(fh)
    except json.JSONDecodeError as exc:
        print(f"[ERROR] Invalid JSON in {data_path}: {exc}", file=sys.stderr)
        sys.exit(1)

    if not isinstance(raw, dict):
        print("[ERROR] JSON root must be an object.", file=sys.stderr)
        sys.exit(1)

    items = raw.get("items")

    if not items:
        items = sam_facts_to_items(raw)

    if not items:
        items = sam_entities_to_items(raw)

    if not isinstance(items, list):
        print("[ERROR] Could not derive an items list from input JSON.", file=sys.stderr)
        sys.exit(1)

    valid_items = [
        it for it in items
        if isinstance(it, dict)
        and first_non_empty(it.get("entity_name"), it.get("title"), it.get("slug"))
    ]
    if not valid_items:
        print("[ERROR] No valid items with entity_name, title, or slug found in input.", file=sys.stderr)
        sys.exit(1)

    try:
        slugs = [item_slug(it) for it in valid_items]
    except PublisherSafetyError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(1)
    seen: dict[str, int] = {}
    duplicates: list[str] = []

    for i, slug in enumerate(slugs):
        if slug in seen:
            entity = first_non_empty(
                valid_items[i].get("entity_name"),
                valid_items[i].get("title"),
                valid_items[i].get("slug"),
            )
            print(f"[WARN] Duplicate entity detected: {entity} (slug: {slug})")
            duplicates.append(slug)
        else:
            seen[slug] = i

    if duplicates:
        print(f"[ERROR] Duplicate slugs detected: {sorted(set(duplicates))}", file=sys.stderr)
        sys.exit(1)

    return valid_items


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Crypto Moonboys Wiki publisher")
    parser.add_argument(
        "input",
        nargs="?",
        default=DEFAULT_INPUT,
        help=f"Path to JSON data file (default: {DEFAULT_INPUT})",
    )
    parser.add_argument(
        "--manifest",
        default=CONTENT_STATE_MANIFEST,
        help=f"Repository content-state manifest (default: {CONTENT_STATE_MANIFEST})",
    )
    args = parser.parse_args()

    try:
        items = validate(args.input)
        repo_root = os.path.abspath(os.path.dirname(__file__))
        with repository_publish_lock(repo_root) as transaction_lock:
            manifest = load_content_state_manifest(args.manifest)

            # Hold the cross-route lock throughout repository-backed planning
            # and commit so reset/import routes cannot invalidate the plan.
            plans: list[PublishPlan] = []
            for item in items:
                slug = item_slug(item)
                entry = manifest.get(slug)
                if entry is None:
                    raise PublisherSafetyError(
                        f"{slug}: no repository content-state record; missing bot memory is not a first edit"
                    )
                plans.append(plan_item_publish(item, entry))

            os.makedirs(WIKI_DIR, exist_ok=True)
            counts = execute_publish_transaction(
                plans,
                wiki_dir=WIKI_DIR,
                sitemap_path=SITEMAP_PATH,
                manifest_path=args.manifest,
                report_path=CONTENT_STATE_REPORT,
                repo_root=repo_root,
                transaction_lock=transaction_lock,
            )
        for plan in plans:
            print(plan.message)

        print(
            f"[DONE] {counts['preserved']} pages preserved/locked, "
            f"{counts['written']} controlled writes, {counts['noops']} same-content no-ops. "
            f"Canonical article hub: {SEARCH_HUB_URL}"
        )
    except PublisherSafetyError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
