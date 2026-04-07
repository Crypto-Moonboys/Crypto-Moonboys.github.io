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
# Wiki index page renderer
# ---------------------------------------------------------------------------

def render_wiki_index(articles: list) -> str:
    """Return a full HTML5 wiki/index.html page listing all generated articles.

    articles -- list of (entity_name, slug) tuples for every page written this run.
    """
    count = len(articles)
    today = date.today().strftime("%B %Y")
    article_word = "article" if count == 1 else "articles"

    items_html = ""
    for name, slug in sorted(articles, key=lambda x: x[0].lower()):
        name_safe = (
            name.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("'", "&#39;")
                .replace('"', "&quot;")
        )
        items_html += (
            f'        <li class="wiki-index-item">'
            f'<a href="{slug}.html">{name_safe}</a></li>\n'
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Crypto Moonboys Wiki &#x2014; browse all {count} {article_word} in the wiki.">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="&#x1F4DA; Wiki Index &#x2014; Crypto Moonboys Wiki">
  <meta property="og:description" content="Browse all {count} {article_word} in the Crypto Moonboys Wiki.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://crypto-moonboys.github.io/wiki/index.html">
  <meta property="og:image" content="https://crypto-moonboys.github.io/img/logo.svg">
  <title>&#x1F4DA; Wiki Index &#x2014; Crypto Moonboys Wiki</title>
  <link rel="stylesheet" href="../css/wiki.css">
  <link rel="icon" href="../img/favicon.svg" type="image/svg+xml">
  <style>
    .wiki-index-list {{
      list-style: none;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 8px;
      margin-top: 16px;
    }}
    .wiki-index-item a {{
      display: block;
      padding: 9px 14px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      color: var(--color-link);
      text-decoration: none;
      font-size: .9rem;
      transition: border-color .2s, background .2s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }}
    .wiki-index-item a:hover {{
      border-color: var(--color-accent);
      background: var(--color-surface-raised, #1c2128);
    }}
    .wiki-index-count {{
      color: var(--color-text-muted, #8b949e);
      font-size: .9rem;
      margin-bottom: 20px;
    }}
    .wiki-index-intro {{
      max-width: 680px;
      margin-bottom: 28px;
      line-height: 1.7;
    }}
  </style>
</head>
<body>
<a class="skip-link" href="#content">Skip to content</a>

<header id="site-header" role="banner">
  <button class="hamburger" id="hamburger" aria-label="Toggle navigation" aria-expanded="false" aria-controls="sidebar">&#9776;</button>
  <a href="../index.html" class="site-logo" aria-label="Crypto Moonboys Wiki home">
    <img src="../img/logo.svg" alt="" aria-hidden="true">
    <span>
      <span class="logo-text">&#x1F319; Moonboys Wiki</span>
      <span class="logo-sub">Crypto Encyclopedia</span>
    </span>
  </a>
  <div id="header-search" role="search">
    <input type="search" id="search-input" placeholder="Search articles&#x2026;" aria-label="Search" autocomplete="off">
    <button id="search-btn" aria-label="Search">&#x1F50D;</button>
    <div id="search-results" role="listbox"></div>
  </div>
  <nav class="header-nav" aria-label="Main navigation">
    <a href="../index.html">Home</a>
    <a href="../categories/index.html">Categories</a>
    <a href="../articles.html">All Articles</a>
  </nav>
</header>

<div id="sidebar-overlay" aria-hidden="true"></div>

<div id="layout">
  <nav id="sidebar" aria-label="Wiki navigation">
    <div class="sidebar-section">
      <div class="sidebar-heading">Navigation</div>
      <div class="sidebar-nav">
        <a href="../index.html"><span class="nav-icon">&#x1F3E0;</span> Main Page</a>
        <a href="../categories/index.html"><span class="nav-icon">&#x1F4C2;</span> All Categories</a>
        <a href="../articles.html"><span class="nav-icon">&#x1F50D;</span> All Articles</a>
        <a href="index.html" class="active"><span class="nav-icon">&#x1F4DA;</span> Wiki Index</a>
      </div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-heading">Cryptocurrencies</div>
      <div class="sidebar-nav">
        <a href="bitcoin.html"><span class="nav-icon">&#x20BF;</span> Bitcoin (BTC)</a>
        <a href="ethereum.html"><span class="nav-icon">&#x39E;</span> Ethereum (ETH)</a>
        <a href="solana.html"><span class="nav-icon">&#x25CE;</span> Solana (SOL)</a>
      </div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-heading">&#x2694;&#xFE0F; HODL Wars Lore</div>
      <div class="sidebar-nav">
        <a href="hodl-wars.html"><span class="nav-icon">&#x1F4DC;</span> HODL Wars</a>
        <a href="hodl-warriors.html"><span class="nav-icon">&#x2694;&#xFE0F;</span> HODL Warriors</a>
        <a href="diamond-hands.html"><span class="nav-icon">&#x1F48E;</span> Diamond Hands</a>
        <a href="moon-mission.html"><span class="nav-icon">&#x1F680;</span> Moon Mission</a>
      </div>
    </div>
  </nav>

  <div id="main-wrapper">
    <main id="content" role="main">

      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="../index.html">Home</a>
        <span class="sep" aria-hidden="true">&#x203A;</span>
        <span aria-current="page">Wiki Index</span>
      </nav>

      <h1 class="page-title">&#x1F4DA; Crypto Moonboys Wiki</h1>
      <div class="page-title-line" aria-hidden="true"></div>

      <p class="wiki-index-intro">
        Welcome to the <strong>Crypto Moonboys Wiki</strong> &#x2014; a fan-driven encyclopedia covering
        crypto, blockchain, DeFi, NFTs, HODL Wars lore, community figures, and the wider Moonboys
        universe. Browse all {article_word} below or use the search bar to find what you&#x2019;re
        looking for.
      </p>

      <p class="wiki-index-count">
        &#x1F4C4; {count} {article_word} in this wiki &#x2014; last generated {today}
      </p>

      <ul class="wiki-index-list" aria-label="All wiki articles">
{items_html}      </ul>

    </main>

    <footer id="site-footer" role="contentinfo">
      <div class="footer-inner">
        <div class="footer-col"><h4>&#x1F319; Moonboys Wiki</h4><p>Fan-driven encyclopedia for the crypto community.</p></div>
        <div class="footer-col"><h4>Explore</h4><ul>
          <li><a href="../index.html">Main Page</a></li>
          <li><a href="../categories/index.html">Categories</a></li>
          <li><a href="../articles.html">All Articles</a></li>
          <li><a href="../about.html">About</a></li>
        </ul></div>
        <div class="footer-col"><h4>&#x1F310; Wiki</h4><ul>
          <li><a href="../articles.html">All Articles</a></li>
          <li><a href="hodl-wars.html">HODL Wars</a></li>
          <li><a href="hodl-warriors.html">HODL Warriors</a></li>
        </ul></div>
      </div>
      <div class="footer-bottom">
        <p>&#x00A9; 2026 Crypto Moonboys Wiki &#xB7; Not financial advice.</p>
        <p><span class="no-login-note">&#x1F512; No sign-up &#xB7; No login &#xB7; Bot-maintained</span></p>
      </div>
    </footer>
  </div>
</div>

<button id="back-to-top" aria-label="Back to top">&#x2191;</button>
<script src="../js/wiki.js"></script>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Sitemap builder
# ---------------------------------------------------------------------------

def build_sitemap(html_files: list, sitemap_path: str) -> str:
    """Return a complete sitemap.xml string.

    Non-wiki <url> entries already present in *sitemap_path* are preserved
    verbatim (lastmod, changefreq, priority untouched).  Wiki entries are
    rebuilt from *html_files* and appended after the preserved entries.
    """
    today = date.today().isoformat()

    # --- collect non-wiki entries from existing sitemap ---
    non_wiki_blocks: list[str] = []
    if os.path.exists(sitemap_path):
        try:
            tree = ET.parse(sitemap_path)
            root = tree.getroot()
            ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
            for url_el in root.findall("sm:url", ns):
                loc_el = url_el.find("sm:loc", ns)
                if loc_el is None:
                    continue
                if not loc_el.text.startswith(BASE_URL):
                    # Reconstruct the <url> block preserving child element order
                    parts = ["  <url>"]
                    for child in url_el:
                        tag = child.tag.split("}")[-1]  # strip namespace
                        parts.append(f"    <{tag}>{child.text}</{tag}>")
                    parts.append("  </url>")
                    non_wiki_blocks.append("\n".join(parts))
        except ET.ParseError:
            pass  # if the existing file is malformed, start fresh

    # --- build wiki entries ---
    wiki_entries: list[str] = []
    for fpath in sorted(html_files):
        fname = os.path.basename(fpath)
        loc = f"{BASE_URL}{fname}"
        priority = "0.9" if fname == "index.html" else "0.8"
        wiki_entries.append(
            f'  <url><loc>{loc}</loc><lastmod>{today}</lastmod>'
            f'<changefreq>weekly</changefreq><priority>{priority}</priority></url>'
        )

    all_entries = non_wiki_blocks + wiki_entries
    body = "\n".join(all_entries)
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
    article_index = []  # (entity_name, slug) pairs for the index page
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
        article_index.append((entity_name, slug))

    # Step 10: write wiki/index.html  (must happen before sitemap glob)
    index_path = f"{WIKI_DIR}/index.html"
    index_html = render_wiki_index(article_index)
    with open(index_path, "w", encoding="utf-8") as fh:
        fh.write(index_html)
    assert os.path.exists(index_path), f"Expected output missing: {index_path}"
    print(f"[INDEX] {index_path} written with {len(article_index)} article entries.")

    # Step 11: rebuild sitemap (picks up wiki/index.html automatically via glob)
    html_files = glob.glob(f"{WIKI_DIR}/*.html")
    sitemap_content = build_sitemap(html_files, SITEMAP_PATH)
    with open(SITEMAP_PATH, "w", encoding="utf-8") as fh:
        fh.write(sitemap_content)
    print(f"[SITEMAP] Rebuilt {SITEMAP_PATH} with {len(html_files)} entries.")

    print(f"[DONE] {written} pages written + wiki/index.html. Sitemap: {len(html_files)} entries.")


if __name__ == "__main__":
    main()
