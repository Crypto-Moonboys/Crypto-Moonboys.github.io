#!/usr/bin/env python3
"""
sam-wiki-publisher.py
=====================
Single-source-of-truth wiki build pipeline for Crypto Moonboys Wiki.

Requirements:
    pip install python-slugify

Usage:
    python3 sam-wiki-publisher.py                        # uses default: main-brain-export.json
    python3 sam-wiki-publisher.py path/to/data.json
"""

import argparse
import glob
import json
import os
import sys
import xml.etree.ElementTree as ET
from datetime import date

from slugify import slugify

BASE_URL = "https://crypto-moonboys.github.io/wiki/"
SEARCH_HUB_URL = "https://crypto-moonboys.github.io/search.html"
WIKI_DIR = "wiki"
SITEMAP_PATH = "sitemap.xml"
DEFAULT_INPUT = "main-brain-export.json"


# ---------------------------------------------------------------------------
# HTML rendering
# ---------------------------------------------------------------------------

def render_html(entity_name: str, slug: str, summary: str, source_url: str,
                source_name: str, category: str, mention_count: int) -> str:
    """Return a minimal but valid HTML5 page for the given entity."""
    title_safe = entity_name.replace("'", "&#39;").replace('"', "&quot;")
    page_url = f"https://crypto-moonboys.github.io/wiki/{slug}.html"

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
  <meta property="og:image" content="https://crypto-moonboys.github.io/img/logo.svg">
  <title>{title_safe} — Crypto Moonboys Wiki</title>
  <link rel="stylesheet" href="../css/wiki.css">
  <link rel="icon" href="../img/favicon.svg" type="image/svg+xml">
</head>
<body>
<div id="wiki-wrap">
  <div id="wiki-main">
    <main id="wiki-content">
      <article data-entity-slug="{slug}">
        <header class="wiki-header">
          <h1>{title_safe}</h1>
          <p class="wiki-meta">Category: {category} &nbsp;|&nbsp; Mentions: {mention_count}</p>
        </header>

        <section class="wiki-section">
          <h2 id="summary">Summary</h2>
          <p>{summary}</p>
        </section>

        <section class="wiki-section">
          <h2 id="source">Source</h2>
          <p>
            <a href="{source_url}" target="_blank" rel="noopener noreferrer">{source_name}</a>
          </p>
        </section>

        <div id="bible-content"></div>
      </article>
    </main>

    <footer id="site-footer" role="contentinfo">
      <div class="footer-inner">
        <div class="footer-col"><h4>🌙 Moonboys Wiki</h4><p>Fan-driven encyclopedia for the crypto community.</p></div>
        <div class="footer-col"><h4>Explore</h4><ul>
          <li><a href="../index.html">Main Page</a></li>
          <li><a href="../categories/index.html">Categories</a></li>
          <li><a href="../search.html">All Articles</a></li>
          <li><a href="../about.html">About</a></li>
        </ul></div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 Crypto Moonboys Wiki · Not financial advice.</p>
      </div>
    </footer>
  </div>
</div>

<script src="../js/wiki.js"></script>
<script src="/js/bible-loader.js"></script>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Sitemap builder
# ---------------------------------------------------------------------------

def build_sitemap(html_files: list, sitemap_path: str) -> str:
    """Return a complete sitemap.xml string.

    Non-wiki <url> entries already present in *sitemap_path* are preserved
    verbatim (lastmod, changefreq, priority untouched). Wiki entries are
    rebuilt from *html_files* and appended after the preserved entries.
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
                        parts.append(f"    <{tag}>{child.text}</{tag}>")
                    parts.append("  </url>")
                    non_wiki_blocks.append("
".join(parts))
        except ET.ParseError:
            pass

    wiki_entries: list[str] = []
    for fpath in sorted(html_files):
        fname = os.path.basename(fpath)
        if fname == "index.html":
            continue
        loc = f"{BASE_URL}{fname}"
        priority = "0.8"
        wiki_entries.append(
            f'  <url><loc>{loc}</loc><lastmod>{today}</lastmod>'
            f'<changefreq>weekly</changefreq><priority>{priority}</priority></url>'
        )

    all_entries = non_wiki_blocks + wiki_entries
    body = "
".join(all_entries)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>
'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
'
        f'{body}
'
        '</urlset>
'
    )


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate(data_path: str):
    """Load and validate input. Returns list of item dicts. Exits on any error."""

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
        print("[ERROR] JSON root must be an object with an 'items' key.", file=sys.stderr)
        sys.exit(1)

    items = raw.get("items")
    if not isinstance(items, list):
        print("[ERROR] JSON must contain an 'items' list.", file=sys.stderr)
        sys.exit(1)

    valid_items = [it for it in items if isinstance(it, dict) and it.get("entity_name", "").strip()]
    if not valid_items:
        print("[ERROR] No valid items with 'entity_name' found in input.", file=sys.stderr)
        sys.exit(1)

    slugs = [slugify(it["entity_name"]) for it in valid_items]
    seen = {}
    duplicates = []
    for i, slug in enumerate(slugs):
        if slug in seen:
            entity = valid_items[i]["entity_name"]
            print(f"[WARN] Duplicate entity detected: {entity} (slug: {slug})")
            duplicates.append(slug)
        else:
            seen[slug] = i

    if duplicates:
        print(f"[ERROR] Duplicate slugs detected: {list(set(duplicates))}", file=sys.stderr)
        sys.exit(1)

    return valid_items


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Crypto Moonboys Wiki publisher")
    parser.add_argument(
        "input",
        nargs="?",
        default=DEFAULT_INPUT,
        help=f"Path to JSON data file (default: {DEFAULT_INPUT})"
    )
    args = parser.parse_args()

    items = validate(args.input)

    os.makedirs(WIKI_DIR, exist_ok=True)

    removed = 0
    for fpath in glob.glob(f"{WIKI_DIR}/*.html"):
        os.remove(fpath)
        removed += 1
    print(f"[CLEAN] Removed {removed} existing wiki/*.html files.")

    written = 0
    for item in items:
        entity_name = item["entity_name"].strip()
        slug = slugify(entity_name)
        summary = item.get("summary", "").strip()
        source_url = item.get("source_url", "#").strip()
        source_name = item.get("source_name", source_url).strip()
        category = item.get("category", "").strip()
        mention_count = int(item.get("mention_count", 0))

        out_path = f"{WIKI_DIR}/{slug}.html"
        html = render_html(
            entity_name,
            slug,
            summary,
            source_url,
            source_name,
            category,
            mention_count
        )
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(html)

        assert os.path.exists(out_path), f"Expected output missing: {out_path}"
        print(f"[BUILD] {out_path}")
        written += 1

    html_files = glob.glob(f"{WIKI_DIR}/*.html")
    sitemap_content = build_sitemap(html_files, SITEMAP_PATH)
    with open(SITEMAP_PATH, "w", encoding="utf-8") as fh:
        fh.write(sitemap_content)
    print(f"[SITEMAP] Rebuilt {SITEMAP_PATH} with {len(html_files)} wiki entries.")

    print(f"[DONE] {written} pages written. Canonical article hub: {SEARCH_HUB_URL}")


if __name__ == "__main__":
    main()
