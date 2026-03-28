#!/usr/bin/env python3
"""
sam-wiki-publisher.py
=====================
Single-source-of-truth wiki build pipeline for Crypto Moonboys Wiki.

Requirements:
    pip install python-slugify

Usage:
    python3 sam-wiki-publisher.py                        # uses default: main-brain-export.json
    python3 sam-wiki-publisher.py path/to/export.json
"""

import argparse
import glob
import json
import os
import sys
from datetime import datetime
from slugify import slugify

BASE_URL = "https://crypto-moonboys.github.io/wiki/"
WIKI_DIR = "wiki"
SITEMAP_PATH = "sitemap.xml"
DEFAULT_INPUT = "main-brain-export.json"


# ---------------------------------------------------------------------------
# Rule 1 – Hard clean
# ---------------------------------------------------------------------------
def hard_clean_wiki_dir():
    """Delete all *.html files in wiki/ before the build starts."""
    removed = 0
    for f in glob.glob(f"{WIKI_DIR}/*.html"):
        os.remove(f)
        removed += 1
    print(f"[CLEAN] Removed {removed} legacy HTML files from {WIKI_DIR}/")


# ---------------------------------------------------------------------------
# Rule 3 – Remove broken file types (XML sitemaps mis-saved as .html)
# ---------------------------------------------------------------------------
def remove_broken_html_files():
    """Delete any wiki/*.html that contains '<urlset' (XML sitemap content)."""
    removed = 0
    for f in glob.glob(f"{WIKI_DIR}/*.html"):
        try:
            with open(f, "r", encoding="utf-8", errors="ignore") as fh:
                if "<urlset" in fh.read():
                    os.remove(f)
                    print(f"[CLEAN] Removed broken XML-as-HTML: {f}")
                    removed += 1
        except OSError:
            pass
    if removed:
        print(f"[CLEAN] Removed {removed} broken XML-as-HTML file(s).")


# ---------------------------------------------------------------------------
# Load + validate export
# ---------------------------------------------------------------------------
def load_and_validate_export(path: str) -> list:
    """
    Load the JSON export file and return a clean list of entity dicts.

    Expected format (main-brain-export.json):
        { "items": [ { "entity_name": "...", ... }, ... ] }

    Rules enforced here (BEFORE any clean/delete):
      - File must exist and be valid JSON.
      - Top-level key must be "items".
      - Every record must have a non-empty "entity_name".
      - No duplicate entity_names are allowed (logged then asserted).

    Returns list of raw item dicts.
    Exits with a descriptive error message on any failure.
    """
    # --- file existence check (before any destructive operation) ---
    if not os.path.exists(path):
        sys.exit(
            f"[ERROR] Input file not found: {path}\n"
            f"        Provide a valid JSON export file as the first argument."
        )

    # --- parse JSON ---
    try:
        with open(path, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except json.JSONDecodeError as exc:
        sys.exit(f"[ERROR] JSON parse error in {path}: {exc}")

    # --- top-level structure ---
    if not isinstance(raw, dict) or "items" not in raw:
        sys.exit(
            f"[ERROR] Expected top-level key 'items' in {path}.\n"
            f"        Got keys: {list(raw.keys()) if isinstance(raw, dict) else type(raw)}"
        )

    items = raw["items"]
    if not isinstance(items, list):
        sys.exit(f"[ERROR] 'items' must be a list, got {type(items)} in {path}")

    # --- validate each record has entity_name ---
    valid_items = []
    for i, item in enumerate(items):
        entity_name = item.get("entity_name", "").strip()
        if not entity_name:
            print(f"[WARN] Skipping record #{i} — missing or empty 'entity_name'")
            continue
        valid_items.append(item)

    if not valid_items:
        sys.exit(f"[ERROR] No valid records with 'entity_name' found in {path}")

    # --- Rule 4 + 8: duplicate detection BEFORE any file operations ---
    slugs = [slugify(item["entity_name"]) for item in valid_items]
    seen = set()
    duplicates_found = False
    for item, slug in zip(valid_items, slugs):
        entity_name = item["entity_name"]
        if slug in seen:
            # Rule 8 — log before asserting
            print(f"[WARN] Duplicate entity detected: {entity_name}  (slug: {slug})")
            duplicates_found = True
        seen.add(slug)

    if duplicates_found:
        dupes = [s for s in slugs if slugs.count(s) > 1]
        assert len(set(slugs)) == len(slugs), (
            f"Duplicate slugs detected: {sorted(set(dupes))}"
        )

    print(f"[VALIDATE] Loaded {len(valid_items)} valid entities from {path}")
    return valid_items


# ---------------------------------------------------------------------------
# HTML rendering
# ---------------------------------------------------------------------------
def render_html(item: dict, slug: str) -> str:
    """
    Render a wiki page from an entity dict.

    Rich fields read (all optional, graceful fallback to empty string / 0):
        entity_name    — page title                  (required by validator)
        summary        — paragraph body text
        source_url     — link to original source
        source_name    — display label for source link
        category       — badge / breadcrumb label
        mention_count  — how many times entity was mentioned in source data
    """
    entity_name   = item.get("entity_name", "Unknown Entity")
    summary       = item.get("summary", "")
    source_url    = item.get("source_url", "")
    source_name   = item.get("source_name", "")
    category      = item.get("category", "Wiki")
    mention_count = int(item.get("mention_count", 0))

    if source_url:
        label = source_name if source_name else source_url
        source_block = (
            f'<p class="source-link">\U0001f517 Source: '
            f'<a href="{source_url}" target="_blank" rel="noopener noreferrer">'
            f"{label}</a></p>"
        )
    else:
        source_block = ""

    mention_block = (
        f'<p class="mention-count">\U0001f4ca Mentions: <strong>{mention_count}</strong></p>'
        if mention_count > 0
        else ""
    )

    today = datetime.utcnow().strftime("%B %Y")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{entity_name}} — Crypto Moonboys Wiki</title>
  <link rel="stylesheet" href="../css/style.css">
  <link rel="icon" href="../favicon.png" type="image/png">
</head>
<body>
<header class="site-header">
  <a href="../index.html" class="site-logo">
    <img src="../favicon.png" alt="Crypto Moonboys" width="32" height="32">
    <span>Crypto Moonboys Wiki</span>
  </a>
  <nav class="header-nav" aria-label="Main navigation">
    <a href="../index.html">Home</a>
    <a href="../articles.html">All Articles</a>
  </nav>
</header>

<div id="layout">
  <main id="content" role="main">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="../index.html">Home</a>
      <span class="sep" aria-hidden="true">›</span>
      <span>{{category}}</span>
      <span class="sep" aria-hidden="true">›</span>
      <span aria-current="page">{{entity_name}}</span>
    </nav>

    <h1 class="page-title">{{entity_name}}</h1>
    <div class="page-title-line" aria-hidden="true"></div>

    <div class="article-meta">
      <span class="article-badge">{{category}}</span>
      <span class="meta-item">\U0001f4c5 Last updated: {{today}}</span>
      {{mention_block}}
    </div>

    <div class="article-body">
      {{f"<p>{{summary}}</p>" if summary else ""}}
      {{source_block}}
    </div>
  </main>
</div>

<footer class="site-footer">
  <p>&copy; Crypto Moonboys Wiki</p>
</footer>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Sitemap helpers
# ---------------------------------------------------------------------------
def read_existing_sitemap_non_wiki_entries(sitemap_path: str) -> list:
    """
    Parse existing sitemap.xml and return all <url> blocks that are NOT
    wiki/*.html pages. These are preserved verbatim so the full sitemap
    is not lost.
    """
    if not os.path.exists(sitemap_path):
        return []
    with open(sitemap_path, encoding="utf-8") as fh:
        content = fh.read()
    entries = []
    for block in content.split("<url>"):
        block = block.strip()
        if not block or "<urlset" in block:
            continue
        block = block.replace("</url>", "").strip()
        loc_start = block.find("<loc>")
        loc_end = block.find("</loc>")
        if loc_start == -1 or loc_end == -1:
            continue
        loc = block[loc_start + 5:loc_end]
        if "/wiki/" not in loc or not loc.endswith(".html"):
            entries.append(f"  <url>{{block}}</url>")
    return entries


def build_sitemap(html_files: list, existing_entries: list) -> str:
    """Return a complete sitemap.xml string rebuilt from wiki/*.html files."""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    wiki_entries = []
    for fpath in sorted(html_files):
        fname = os.path.basename(fpath)
        loc = f"{BASE_URL}{fname}"
        wiki_entries.append(
            f"  <url><loc>{{loc}}</loc><lastmod>{{today}}</lastmod>"
            f"<changefreq>weekly</changefreq><priority>0.8</priority></url>"
        )
    all_entries = existing_entries + wiki_entries
    body = "\n".join(all_entries)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{{body}}\n"
        "</urlset>\n"
    )


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Build Crypto Moonboys wiki pages from a JSON export file."
    )
    parser.add_argument(
        "data_file",
        nargs="?",
        default=DEFAULT_INPUT,
        help=f"Path to JSON export file (default: {DEFAULT_INPUT})",
    )
    args = parser.parse_args()

    # Step 1: validate input BEFORE destructive operations
    items = load_and_validate_export(args.data_file)

    # Step 2: Rule 1 – hard clean wiki/*.html
    hard_clean_wiki_dir()

    # Step 3: Rule 3 – remove any XML-as-HTML stragglers (belt-and-suspenders)
    remove_broken_html_files()

    # Step 4: preserve non-wiki sitemap entries before rebuild
    existing_sitemap_entries = read_existing_sitemap_non_wiki_entries(SITEMAP_PATH)

    # Step 5: Rules 2, 6, 7 – render and write each page
    pages_written = 0
    os.makedirs(WIKI_DIR, exist_ok=True)
    for item in items:
        entity_name = item["entity_name"]
        # Rule 2: slug ONLY from entity_name; never read a "slug" JSON field
        slug = slugify(entity_name)

        html = render_html(item, slug)

        # Rule 6: strict output path wiki/{slug}.html
        out_path = os.path.join(WIKI_DIR, f"{{slug}}.html")
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(html)

        # Rule 7: post-write assertion
        assert os.path.exists(out_path), f"Expected output missing: {{out_path}}"
        pages_written += 1

    # Step 6: Rule 5 – rebuild sitemap from filesystem only
    html_files = glob.glob(os.path.join(WIKI_DIR, "*.html"))
    sitemap_content = build_sitemap(html_files, existing_sitemap_entries)
    with open(SITEMAP_PATH, "w", encoding="utf-8") as fh:
        fh.write(sitemap_content)

    print(
        f"[DONE] {{pages_written}} page(s) written to {{WIKI_DIR}}/. "
        f"Sitemap rebuilt with {{len(html_files)}} wiki entries "
        f"(+ {{len(existing_sitemap_entries)}} preserved non-wiki entries)."
    )


if __name__ == "__main__":
    main()  
