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
- Existing real articles (word count >= STUB_WORD_THRESHOLD) are preserved unchanged
- SAM metadata (summary, aliases, tags, mention counts) is used for ranking/indexing only
- A new stub page is generated ONLY when no real article file exists for an entity
- Stub pages are clearly marked with data-wiki-stub="true" and a visible stub notice

Requirements:
    pip install python-slugify

Usage:
    python3 sam-wiki-publisher.py
    python3 sam-wiki-publisher.py path/to/data.json
"""

import argparse
import glob
import json
import os
import sys
import xml.etree.ElementTree as ET
from datetime import date
from html import escape
from typing import Any

from slugify import slugify

BASE_URL = "https://crypto-moonboys.github.io/wiki/"
SEARCH_HUB_URL = "https://crypto-moonboys.github.io/search.html"
WIKI_DIR = "wiki"
SITEMAP_PATH = "sitemap.xml"
DEFAULT_INPUT = "main-brain-export.json"

# An existing HTML file with fewer than this many words is treated as a stub
# (safe to overwrite). Files with >= this many words are real articles and
# must never be overwritten by the publisher.
STUB_WORD_THRESHOLD = 400


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
        items.append(item)

    return items


def is_stub_file(path: str) -> bool:
    """Return True if the file at *path* does not exist or contains fewer than
    STUB_WORD_THRESHOLD words (i.e. it is a generated stub, not a real article)."""
    if not os.path.exists(path):
        return True
    try:
        with open(path, encoding="utf-8") as fh:
            content = fh.read()
        word_count = len(content.split())
        return word_count < STUB_WORD_THRESHOLD
    except OSError:
        return True


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
    source_url_safe = esc(source_url if source_url else "#")
    source_name_safe = esc(source_name if source_name else source_url if source_url else "Source")
    category_safe = esc(category)
    page_url = f"{BASE_URL}{slug}.html"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{title_safe} — Crypto Moonboys Wiki">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="{title_safe} — Crypto Moonboys Wiki">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{page_url}">
  <meta property="og:image" content="https://crypto-moonboys.github.io/img/CRYPTO-MOONBOYS-BITCOIN-LOGO.png">
  <title>{title_safe} — Crypto Moonboys Wiki</title>
  <link rel="canonical" href="{page_url}">
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


# ---------------------------------------------------------------------------
# Sitemap builder
# ---------------------------------------------------------------------------

def build_sitemap(html_files: list[str], sitemap_path: str) -> str:
    """
    Preserve non-wiki URLs from the existing sitemap.
    Rebuild wiki article URLs only.
    Excludes any legacy wiki/index.html entry.
    """
    today = date.today().isoformat()

    non_wiki_blocks: list[str] = []
    if os.path.exists(sitemap_path):
        try:
            tree = ET.parse(sitemap_path)
            root = tree.getroot()
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

    valid_items = [it for it in items if isinstance(it, dict) and it.get("entity_name", "").strip()]
    if not valid_items:
        print("[ERROR] No valid items with 'entity_name' found in input.", file=sys.stderr)
        sys.exit(1)

    slugs = [slugify(it["entity_name"]) for it in valid_items]
    seen: dict[str, int] = {}
    duplicates: list[str] = []

    for i, slug in enumerate(slugs):
        if slug in seen:
            entity = valid_items[i]["entity_name"]
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
    args = parser.parse_args()

    items = validate(args.input)
    os.makedirs(WIKI_DIR, exist_ok=True)

    # Preservation-first: never mass-delete wiki/*.html files.
    # Only generate a new stub page when no real article exists for an entity.
    written = 0
    preserved = 0
    skipped_stub = 0

    for item in items:
        entity_name = item["entity_name"].strip()
        slug = slugify(entity_name)
        summary = item.get("summary", "").strip()
        source_url = item.get("source_url", "#").strip()
        source_name = item.get("source_name", source_url).strip()
        category = item.get("category", "").strip()
        mention_count = int(item.get("mention_count", 0))

        out_path = os.path.join(WIKI_DIR, f"{slug}.html")

        # Skip if a real article already exists — never overwrite real content
        if not is_stub_file(out_path):
            print(f"[PRESERVE] {out_path}")
            preserved += 1
            continue

        # Generate a stub only if no real article exists.
        # NOTE: if content is ever sourced from git history (e.g. via
        # `git show <sha>:wiki/<slug>.html`) rather than freshly rendered here,
        # call normalize_legacy_paths(html) on it before writing to disk so
        # that old relative paths (../css/, ../js/, etc.) are not reintroduced.
        html = render_html(
            entity_name=entity_name,
            slug=slug,
            summary=summary,
            source_url=source_url,
            source_name=source_name,
            category=category,
            mention_count=mention_count,
        )

        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(html)

        if not os.path.exists(out_path):
            raise RuntimeError(f"Expected output missing: {out_path}")

        print(f"[STUB] {out_path}")
        written += 1

    legacy_index = os.path.join(WIKI_DIR, "index.html")
    if os.path.exists(legacy_index):
        os.remove(legacy_index)
        print(f"[CLEAN] Removed legacy file: {legacy_index}")

    html_files = glob.glob(f"{WIKI_DIR}/*.html")
    sitemap_content = build_sitemap(html_files, SITEMAP_PATH)
    with open(SITEMAP_PATH, "w", encoding="utf-8") as fh:
        fh.write(sitemap_content)

    print(f"[SITEMAP] Rebuilt {SITEMAP_PATH} with {len(html_files)} wiki article entries.")
    print(
        f"[DONE] {preserved} articles preserved, {written} stub pages generated. "
        f"Canonical article hub: {SEARCH_HUB_URL}"
    )


if __name__ == "__main__":
    main()
