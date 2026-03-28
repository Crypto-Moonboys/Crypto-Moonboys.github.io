#!/usr/bin/env python3
"""
sam-wiki-publisher.py — Crypto Moonboys Wiki build pipeline.

Enforces a clean, single-source-of-truth publish run:
  1. Hard-cleans all wiki/*.html before writing anything.
  2. Derives slugs ONLY from entity names (never from a JSON "slug" field).
  3. Removes broken file types (e.g. XML sitemaps saved as .html).
  4. Asserts slug uniqueness before writing any page.
  5. Writes each page to wiki/{slug}.html and asserts the file exists.
  6. Rebuilds sitemap.xml entirely from the filesystem after the build.

Requires:  python-slugify
Install:   pip install python-slugify
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


# ---------------------------------------------------------------------------
# HTML rendering
# ---------------------------------------------------------------------------

def render_html(entity: str, slug: str, facts: list[str], sources: list[str]) -> str:
    """Return a minimal but valid HTML5 page for the given entity."""
    title_safe = entity.replace("'", "&#39;").replace('"', "&quot;")
    page_url = f"https://crypto-moonboys.github.io/wiki/{slug}.html"

    facts_html = "\n".join(
        f'          <li>{fact}</li>' for fact in facts
    ) if facts else "          <li>No facts recorded yet.</li>"

    sources_html = "\n".join(
        f'          <li><a href="{src}" target="_blank" rel="noopener noreferrer">{src}</a></li>'
        for src in sources
    ) if sources else "          <li>No sources listed.</li>"

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
        </header>

        <section class="wiki-section">
          <h2 id="facts">Facts</h2>
          <ul class="sources-list">
{facts_html}
          </ul>
        </section>

        <section class="wiki-section">
          <h2 id="sources">Sources</h2>
          <ul class="sources-list">
{sources_html}
          </ul>
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
# Sitemap helpers
# ---------------------------------------------------------------------------

def read_existing_sitemap_non_wiki_entries(sitemap_path: str) -> list[str]:
    """
    Parse existing sitemap.xml and return all <url> blocks that are NOT
    wiki/*.html pages.  These are preserved verbatim so the full sitemap
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
        # Strip closing </url> if present so we can re-wrap cleanly
        block = block.replace("</url>", "").strip()
        loc_start = block.find("<loc>")
        loc_end = block.find("</loc>")
        if loc_start == -1 or loc_end == -1:
            continue
        loc = block[loc_start + 5:loc_end]
        # Keep only non-wiki-page entries (wiki/*.html are rebuilt below)
        if "/wiki/" not in loc or not loc.endswith(".html"):
            entries.append(f"  <url>{block}</url>")
    return entries


def build_sitemap(html_files: list[str], existing_entries: list[str]) -> str:
    """Return a complete sitemap.xml string."""
    today = date.today().isoformat()
    wiki_entries = []
    for fpath in sorted(html_files):
        fname = os.path.basename(fpath)
        loc = f"{BASE_URL}{fname}"
        wiki_entries.append(
            f'  <url><loc>{loc}</loc><lastmod>{today}</lastmod>'
            f'<changefreq>weekly</changefreq><priority>0.8</priority></url>'
        )

    all_entries = existing_entries + wiki_entries
    body = "\n".join(all_entries)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f'{body}\n'
        '</urlset>\n'
    )


# ---------------------------------------------------------------------------
# Rule 3 — scan for broken files (useful when not doing a fresh run)
# ---------------------------------------------------------------------------

def remove_broken_files(wiki_dir: str) -> int:
    """
    Delete any .html file in wiki_dir that contains '<urlset'
    (i.e. an XML sitemap accidentally saved as .html).
    Returns the number of files removed.
    """
    removed = 0
    for fpath in glob.glob(os.path.join(wiki_dir, "*.html")):
        try:
            with open(fpath, encoding="utf-8", errors="replace") as fh:
                content = fh.read(4096)  # Only need the start to detect <urlset>
            if "<urlset" in content:
                print(f"[CLEAN] Removing broken XML-in-HTML file: {fpath}")
                os.remove(fpath)
                removed += 1
        except OSError as exc:
            print(f"[WARN] Could not read {fpath}: {exc}")
    return removed


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def load_data(data_path: str) -> list[dict]:
    """Load JSON data file; raise SystemExit with a helpful message on error."""
    if not os.path.exists(data_path):
        print(
            f"[ERROR] Data file not found: {data_path}\n"
            "Please provide a JSON file containing a list of entity dicts, e.g.:\n"
            '  [{"entity": "Bitcoin", "facts": ["..."], "sources": ["..."]}]',
            file=sys.stderr,
        )
        sys.exit(1)
    try:
        with open(data_path, encoding="utf-8") as fh:
            data = json.load(fh)
    except json.JSONDecodeError as exc:
        print(f"[ERROR] Failed to parse JSON from {data_path}: {exc}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(data, list):
        print(
            f"[ERROR] Expected a JSON array in {data_path}, got {type(data).__name__}.",
            file=sys.stderr,
        )
        sys.exit(1)
    return data


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build Crypto Moonboys wiki pages from a JSON data file."
    )
    parser.add_argument(
        "data_file",
        nargs="?",
        default="wiki_data.json",
        help="Path to the JSON data file (default: wiki_data.json).",
    )
    args = parser.parse_args()

    # ------------------------------------------------------------------
    # Rule 1 — HARD CLEAN: delete all existing wiki/*.html before build
    # ------------------------------------------------------------------
    cleaned = 0
    for fpath in glob.glob(os.path.join(WIKI_DIR, "*.html")):
        os.remove(fpath)
        cleaned += 1
    print(f"[CLEAN] Removed {cleaned} existing wiki/*.html file(s).")

    # ------------------------------------------------------------------
    # Rule 3 — remove any remaining broken file types
    # (belt-and-suspenders: Rule 1 already wiped them, but this handles
    #  edge cases where the clean was skipped or files were re-added)
    # ------------------------------------------------------------------
    remove_broken_files(WIKI_DIR)

    # ------------------------------------------------------------------
    # Load data
    # ------------------------------------------------------------------
    records = load_data(args.data_file)
    print(f"[INFO] Loaded {len(records)} record(s) from {args.data_file}.")

    # ------------------------------------------------------------------
    # Rule 2 & 4 & 8 — compute slugs, log duplicates, assert uniqueness
    # ------------------------------------------------------------------
    valid_records: list[dict] = []
    slugs: list[str] = []
    entities: list[str] = []
    for record in records:
        if "entity" not in record:
            print(f"[WARN] Record missing 'entity' key, skipping: {record}")
            continue
        entity = record["entity"]
        # Rule 2: slug is ALWAYS derived from entity name, never from JSON
        slug = slugify(entity)
        if slug in slugs:
            # Rule 8: log before asserting
            print(f"[WARN] Duplicate entity detected: {entity}")
        valid_records.append(record)
        slugs.append(slug)
        entities.append(entity)

    # Rule 4: assert uniqueness
    assert len(set(slugs)) == len(slugs), (
        f"Duplicate slugs detected: {[s for s in slugs if slugs.count(s) > 1]}"
    )

    # ------------------------------------------------------------------
    # Rules 5 (prep) — read non-wiki entries from existing sitemap before
    # we start writing (we will rebuild wiki entries from the filesystem)
    # ------------------------------------------------------------------
    existing_sitemap_entries = read_existing_sitemap_non_wiki_entries(SITEMAP_PATH)

    # ------------------------------------------------------------------
    # Rules 2, 6, 7 — render and write each page
    # ------------------------------------------------------------------
    pages_written = 0
    for record, slug, entity in zip(valid_records, slugs, entities):
        # Use "facts" if explicitly present (even if empty); fall back to
        # all_facts only when the key is absent entirely.
        if "facts" in record:
            facts = record["facts"]
        else:
            facts = [
                f["fact"] for f in record.get("all_facts", [])
                if isinstance(f, dict) and "fact" in f
            ]
        sources = record.get("sources", [])

        html = render_html(entity, slug, facts, sources)

        # Rule 6: strict output path wiki/{slug}.html
        out_path = os.path.join(WIKI_DIR, f"{slug}.html")
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(html)

        # Rule 7: post-write existence assertion
        assert os.path.exists(os.path.join(WIKI_DIR, f"{slug}.html")), (
            f"Expected output missing: {WIKI_DIR}/{slug}.html"
        )

        pages_written += 1

    # ------------------------------------------------------------------
    # Rule 5 — rebuild sitemap.xml from filesystem only
    # ------------------------------------------------------------------
    html_files = glob.glob(os.path.join(WIKI_DIR, "*.html"))
    sitemap_content = build_sitemap(html_files, existing_sitemap_entries)
    with open(SITEMAP_PATH, "w", encoding="utf-8") as fh:
        fh.write(sitemap_content)
    sitemap_entries = len(html_files)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print(
        f"[DONE] {pages_written} page(s) written to {WIKI_DIR}/. "
        f"Sitemap rebuilt with {sitemap_entries} wiki entries "
        f"(+ {len(existing_sitemap_entries)} preserved non-wiki entries)."
    )


if __name__ == "__main__":
    main()
