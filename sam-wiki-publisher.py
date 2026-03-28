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
from datetime import date

from slugify import slugify

BASE_URL = "https://crypto-moonboys.github.io/wiki/"
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
          <li><a href="../articles.html">All Articles</a></li>
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

def build_sitemap(html_files: list) -> str:
    """Return a complete sitemap.xml string built only from wiki/*.html files."""
    today = date.today().isoformat()
    entries = []
    for fpath in sorted(html_files):
        fname = os.path.basename(fpath)
        loc = f"{BASE_URL}{fname}"
        entries.append(
            f'  <url><loc>{loc}</loc><lastmod>{today}</lastmod>'
            f'<changefreq>weekly</changefreq><priority>0.8</priority></url>'
        )
    body = "\n".join(entries)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f'{body}\n'
        '</urlset>\n'
    )


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate(data_path: str):
    """Load and validate input. Returns list of item dicts. Exits on any error."""

    # 1. File exists
    if not os.path.exists(data_path):
        print(f"[ERROR] Input file not found: {data_path}", file=sys.stderr)
        sys.exit(1)

    # 2. JSON loads
    try:
        with open(data_path, encoding="utf-8") as fh:
            raw = json.load(fh)
    except json.JSONDecodeError as exc:
        print(f"[ERROR] Invalid JSON in {data_path}: {exc}", file=sys.stderr)
        sys.exit(1)

    # 3. raw is dict
    if not isinstance(raw, dict):
        print("[ERROR] JSON root must be an object with an 'items' key.", file=sys.stderr)
        sys.exit(1)

    # 4. raw["items"] is list
    items = raw.get("items")
    if not isinstance(items, list):
        print("[ERROR] JSON must contain an 'items' list.", file=sys.stderr)
        sys.exit(1)

    # 5. At least 1 valid entity_name
    valid_items = [it for it in items if isinstance(it, dict) and it.get("entity_name", "").strip()]
    if not valid_items:
        print("[ERROR] No valid items with 'entity_name' found in input.", file=sys.stderr)
        sys.exit(1)

    # 6. Duplicate slug detection
    slugs = [slugify(it["entity_name"]) for it in valid_items]
    seen = {}
    duplicates = []
    for i, s in enumerate(slugs):
        if s in seen:
            entity = valid_items[i]["entity_name"]
            print(f"[WARN] Duplicate entity detected: {entity} (slug: {s})")
            duplicates.append(s)
        else:
            seen[s] = i

    if duplicates:
        print(f"[ERROR] Duplicate slugs detected: {list(set(duplicates))}", file=sys.stderr)
        sys.exit(1)

    return valid_items


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Crypto Moonboys Wiki publisher")
    parser.add_argument("input", nargs="?", default=DEFAULT_INPUT,
                        help=f"Path to JSON data file (default: {DEFAULT_INPUT})")
    args = parser.parse_args()

    # Steps 1–6: load + validate (exits on failure — filesystem untouched)
    items = validate(args.input)

    # Steps 7: mkdir
    os.makedirs(WIKI_DIR, exist_ok=True)

    # Step 8: HARD CLEAN
    removed = 0
    for fpath in glob.glob(f"{WIKI_DIR}/*.html"):
        os.remove(fpath)
        removed += 1
    print(f"[CLEAN] Removed {removed} existing wiki/*.html files.")

    # Step 9: write pages
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
        html = render_html(entity_name, slug, summary, source_url,
                           source_name, category, mention_count)
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(html)

        # Post-write assertion
        assert os.path.exists(out_path), f"Expected output missing: {out_path}"
        print(f"[BUILD] {out_path}")
        written += 1

    # Step 10: rebuild sitemap
    html_files = glob.glob(f"{WIKI_DIR}/*.html")
    sitemap_content = build_sitemap(html_files)
    with open(SITEMAP_PATH, "w", encoding="utf-8") as fh:
        fh.write(sitemap_content)
    print(f"[SITEMAP] Rebuilt {SITEMAP_PATH} with {len(html_files)} entries.")

    print(f"[DONE] {written} pages written. Sitemap: {len(html_files)} entries.")


if __name__ == "__main__":
    main()
