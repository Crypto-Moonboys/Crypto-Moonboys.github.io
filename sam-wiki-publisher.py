#!/usr/bin/env python3
"""
sam-wiki-publisher.py
=====================
Publishes wiki HTML pages from SAM bible JSON files.

Rules:
- Slug is always derived from the entity name via slugify()
- Files are written to wiki/{slug}.html  (never wiki/wiki/)
- URLs resolve to /wiki/{slug}.html
- Every publish is logged and the file is asserted to exist
- sitemap.xml is regenerated from actual wiki/*.html files
"""

import json
import os
import re
import glob
from datetime import date
from html import escape

# ── Repository root (script lives at repo root) ────────────────────────────
REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
WIKI_DIR = os.path.join(REPO_ROOT, "wiki")
BIBLES_DIR = os.path.join(WIKI_DIR, "bibles")
SITEMAP_PATH = os.path.join(REPO_ROOT, "sitemap.xml")
BASE_URL = "https://crypto-moonboys.github.io"
TODAY = date.today().isoformat()


# ── Slug generation ────────────────────────────────────────────────────────

def slugify(name: str) -> str:
    """
    Produce a deterministic, URL-safe slug from an entity name.

    Algorithm:
      1. Lower-case the full name
      2. Replace every run of non-alphanumeric characters with a single '-'
      3. Strip any leading/trailing hyphens

    Examples:
      "Darren Cullen (SER)"  -> "darren-cullen-ser"
      "Bit-Cap 5000"         -> "bit-cap-5000"
      "1M Free NFTs Drop"    -> "1m-free-nfts-drop"
      "No Ball Games (NBG)"  -> "no-ball-games-nbg"
    """
    s = name.lower()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = s.strip('-')
    return s


# ── HTML helpers ────────────────────────────────────────────────────────────

def _esc(text: str) -> str:
    return escape(str(text), quote=True)


def _collect_sources(all_facts: list) -> list:
    """Return a de-duplicated ordered list of sources from all facts."""
    seen: set = set()
    sources: list = []
    for fact in all_facts:
        for src in fact.get("sources", []):
            if src not in seen:
                seen.add(src)
                sources.append(src)
    return sources


def _lead_paragraph(all_facts: list, entity: str) -> str:
    """Return the best candidate lead paragraph from the facts."""
    # Prefer the longest fact at confidence >= 80 and status VERIFIED
    candidates = [
        f["fact"] for f in all_facts
        if len(f.get("fact", "")) > 80
        and f.get("confidence", 0) >= 80
        and f.get("status") == "VERIFIED"
    ]
    if candidates:
        return max(candidates, key=len)
    # Fallback: any fact
    texts = [f["fact"] for f in all_facts if f.get("fact")]
    if texts:
        return max(texts, key=len)
    return f"{_esc(entity)} is a notable entity in the Crypto Moonboys universe."


def _render_sources_html(sources: list) -> str:
    items = []
    for src in sources:
        esc_src = _esc(src)
        items.append(
            f'          <li><a href="{esc_src}" target="_blank" '
            f'rel="noopener noreferrer">{esc_src}</a></li>'
        )
    return "\n".join(items)


def _render_facts_html(all_facts: list) -> str:
    blocks = []
    seen: set = set()
    for f in all_facts:
        text = f.get("fact", "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        blocks.append(
            f'          <div class="lore-fact-block">\n'
            f'          <p class="lore-paragraph">{_esc(text)}</p>\n'
            f'          </div>'
        )
    return "\n".join(blocks)


def _render_cross_links_html(cross_links: list) -> str:
    if not cross_links:
        return ""
    items = []
    for link in cross_links:
        if isinstance(link, dict):
            name = link.get("entity") or link.get("name") or str(link)
        else:
            name = str(link)
        link_slug = slugify(name)
        items.append(
            f'          <li>'
            f'<a href="{_esc(link_slug)}.html">{_esc(name)}</a>'
            f'</li>'
        )
    if not items:
        return ""
    return (
        '        <section class="wiki-section">\n'
        '          <h2 id="see-also">See Also</h2>\n'
        '          <ul>\n'
        + "\n".join(items) + "\n"
        '          </ul>\n'
        '        </section>\n'
    )


# ── HTML page generator ─────────────────────────────────────────────────────

def generate_html(bible: dict) -> str:
    """Build the full HTML page for a bible entity."""
    entity = bible["entity"]
    slug = slugify(entity)
    all_facts = bible.get("all_facts", [])
    cross_links = bible.get("cross_links", [])
    mention_count = bible.get("mention_count", 0)

    lead = _lead_paragraph(all_facts, entity)
    sources = _collect_sources(all_facts)
    facts_html = _render_facts_html(all_facts)
    sources_html = _render_sources_html(sources)
    see_also_html = _render_cross_links_html(cross_links)

    desc_short = lead[:155] + ("…" if len(lead) > 155 else "")
    page_url = f"{BASE_URL}/wiki/{slug}.html"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{_esc(desc_short)}">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="{_esc(entity)} — Crypto Moonboys Wiki">
  <meta property="og:description" content="{_esc(desc_short)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{_esc(page_url)}">
  <meta property="og:image" content="{BASE_URL}/img/logo.svg">
  <title>{_esc(entity)} — Crypto Moonboys Wiki</title>
  <link rel="stylesheet" href="../css/wiki.css">
  <link rel="icon" href="../img/favicon.svg" type="image/svg+xml">
  <style>
    .wiki-section {{
      margin: 1.6em 0;
    }}
    .lore-paragraph {{
      line-height: 1.75;
      margin: 0 0 1em 0;
    }}
    .lead-paragraph {{
      font-size: 1.06em;
      line-height: 1.8;
      margin: 0 0 1em 0;
    }}
    .lore-facts-stack {{
      display: block;
    }}
    .lore-fact-block {{
      margin: 0 0 1.2em 0;
      padding: 1em 1.1em;
      background: rgba(255,255,255,0.03);
      border-left: 4px solid #5b8cff;
      border-radius: 6px;
    }}
    .sources-list {{
      padding-left: 1.4em;
    }}
    .sources-list li {{
      margin-bottom: 0.3em;
      word-break: break-all;
    }}
  </style>
</head>
<body>

<a class="skip-link" href="#content">Skip to content</a>

<header id="site-header" role="banner">
  <button class="hamburger" id="hamburger" aria-label="Toggle navigation" aria-expanded="false" aria-controls="sidebar">☰</button>
  <a href="../index.html" class="site-logo" aria-label="Crypto Moonboys Wiki home">
    <img src="../img/logo.svg" alt="" aria-hidden="true">
    <span>
      <span class="logo-text">🌙 Moonboys Wiki</span>
      <span class="logo-sub">Crypto Encyclopedia</span>
    </span>
  </a>
  <div id="header-search" role="search">
    <input type="search" id="search-input" placeholder="Search articles…" aria-label="Search" autocomplete="off">
    <button id="search-btn" aria-label="Search">🔍</button>
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
        <a href="../index.html"><span class="nav-icon">🏠</span> Main Page</a>
        <a href="../categories/index.html"><span class="nav-icon">📂</span> All Categories</a>
        <a href="../articles.html"><span class="nav-icon">🔍</span> All Articles</a>
      </div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-heading">Cryptocurrencies</div>
      <div class="sidebar-nav">
        <a href="bitcoin.html"><span class="nav-icon">₿</span> Bitcoin (BTC)</a>
        <a href="ethereum.html"><span class="nav-icon">Ξ</span> Ethereum (ETH)</a>
        <a href="solana.html"><span class="nav-icon">◎</span> Solana (SOL)</a>
      </div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-heading">⚔️ HODL Wars Lore</div>
      <div class="sidebar-nav">
        <a href="hodl-wars.html"><span class="nav-icon">📜</span> HODL Wars</a>
        <a href="hodl-warriors.html"><span class="nav-icon">⚔️</span> HODL Warriors</a>
        <a href="diamond-hands.html"><span class="nav-icon">💎</span> Diamond Hands</a>
        <a href="moon-mission.html"><span class="nav-icon">🚀</span> Moon Mission</a>
      </div>
    </div>
  </nav>

  <div id="main-wrapper">
    <main id="content" role="main">

      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="../index.html">Home</a>
        <span class="sep" aria-hidden="true">›</span>
        <a href="../categories/lore.html">Lore</a>
        <span class="sep" aria-hidden="true">›</span>
        <span aria-current="page">{_esc(entity)}</span>
      </nav>

      <h1 class="page-title">
        🎭 {_esc(entity)}
      </h1>
      <div class="page-title-line" aria-hidden="true"></div>

      <div class="article-meta">
        <span class="article-badge">🎭 Lore</span>
        <span class="meta-item">📅 Last updated: {TODAY}</span>
        <span class="meta-item">📂 <a href="../categories/lore.html">Lore</a></span>
      </div>

      <article class="wiki-content" data-entity-slug="{_esc(slug)}">

          <p class="lead-paragraph">{_esc(lead)}</p>

        <section class="wiki-section">
          <h2 id="known-facts">Known Facts</h2>
          <div class="lore-facts-stack">
{facts_html}
          </div>
        </section>

{see_also_html}
        <section class="wiki-section">
          <h2 id="sources">Sources</h2>
          <ul class="sources-list">
{sources_html}
          </ul>
        </section>

        <div id="bible-content"></div>

      </article>

      <div class="category-tags" aria-label="Article categories">
        <span class="cat-label">Categories:</span>
        <a href="../categories/lore.html">Lore</a>
      </div>

    </main>

    <footer id="site-footer" role="contentinfo">
      <div class="footer-inner">
        <div class="footer-col"><h4>🌙 Moonboys Wiki</h4><p>Fan-driven encyclopedia for the crypto community.</p></div>
        <div class="footer-col"><h4>Explore</h4><ul><li><a href="../index.html">Main Page</a></li><li><a href="../categories/index.html">Categories</a></li><li><a href="../articles.html">All Articles</a></li><li><a href="../about.html">About</a></li></ul></div>
        <div class="footer-col"><h4>🌐 Wiki</h4><ul><li><a href="../articles.html">All Articles</a></li><li><a href="hodl-wars.html">HODL Wars</a></li><li><a href="hodl-warriors.html">HODL Warriors</a></li></ul></div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 Crypto Moonboys Wiki · Not financial advice.</p>
        <p><span class="no-login-note">🔒 No sign-up · No login · Bot-maintained</span></p>
      </div>
    </footer>
  </div>
</div>

<button id="back-to-top" aria-label="Back to top">&#8593;</button>
<script src="../js/wiki.js"></script>
<script src="/js/bible-loader.js"></script>
</body>
</html>
"""


# ── Publisher ────────────────────────────────────────────────────────────────

def publish_bible(bible_path: str) -> str:
    """
    Publish a single bible JSON as a wiki HTML page.

    Returns the slug that was published.
    """
    with open(bible_path, encoding="utf-8") as fh:
        bible = json.load(fh)

    entity = bible["entity"]

    # Slug is always derived from entity name — never from bible['slug']
    slug = slugify(entity)

    # Path: wiki/{slug}.html  (NO wiki/wiki/ nesting)
    file_path = os.path.join(WIKI_DIR, f"{slug}.html")

    html = generate_html(bible)
    with open(file_path, "w", encoding="utf-8") as fh:
        fh.write(html)

    # Mandatory post-write assertion
    assert os.path.exists(file_path), f"Missing file: {file_path}"

    # Publish log
    print(f"[WIKI] Published: {slug} → /wiki/{slug}.html")

    return slug


# ── Sitemap regeneration ─────────────────────────────────────────────────────

# Non-wiki entries that must always be present in the sitemap.
# Entries are (url, lastmod, changefreq, priority).
_STATIC_ENTRIES = [
    (f"{BASE_URL}/",                                    "2026-03-22", "weekly",  "1.0"),
    (f"{BASE_URL}/about.html",                          "2026-03-22", "weekly",  "1.0"),
    (f"{BASE_URL}/agent.html",                          "2026-03-28", "weekly",  "0.9"),
    (f"{BASE_URL}/block-topia.html",                    "2026-03-28", "daily",   "0.9"),
    (f"{BASE_URL}/search.html",                         "2026-03-22", "weekly",  "1.0"),
    (f"{BASE_URL}/articles.html",                       "2026-03-22", "weekly",  "1.0"),
    (f"{BASE_URL}/about/graffiti-kings.html",           "2026-03-22", "monthly", "0.6"),
    (f"{BASE_URL}/about/graffpunks-radio.html",         "2026-03-22", "monthly", "0.6"),
    (f"{BASE_URL}/about/hodl-warriors.html",            "2026-03-22", "monthly", "0.6"),
    (f"{BASE_URL}/about/hodl-wars-universe.html",       "2026-03-22", "monthly", "0.6"),
    (f"{BASE_URL}/about/join-community.html",           "2026-03-22", "monthly", "0.6"),
    (f"{BASE_URL}/about/multi-chain-multiverse.html",   "2026-03-22", "monthly", "0.6"),
    (f"{BASE_URL}/about/our-mission.html",              "2026-03-22", "monthly", "0.6"),
    (f"{BASE_URL}/about/rackin-sats.html",              "2026-03-22", "monthly", "0.6"),
    (f"{BASE_URL}/about/what-is-crypto-moonboys.html",  "2026-03-22", "monthly", "0.6"),
    (f"{BASE_URL}/categories/activism-counter-culture.html", "2026-03-22", "weekly", "0.9"),
    (f"{BASE_URL}/categories/art-creativity.html",      "2026-03-22", "weekly",  "0.9"),
    (f"{BASE_URL}/categories/community-people.html",    "2026-03-22", "weekly",  "0.9"),
    (f"{BASE_URL}/categories/concepts.html",            "2026-03-22", "weekly",  "0.9"),
    (f"{BASE_URL}/categories/cryptocurrencies.html",    "2026-03-22", "weekly",  "0.9"),
    (f"{BASE_URL}/categories/designer-toys.html",       "2026-03-22", "weekly",  "0.9"),
    (f"{BASE_URL}/categories/gaming.html",              "2026-03-22", "weekly",  "0.9"),
    (f"{BASE_URL}/categories/graffiti-street-art.html", "2026-03-22", "weekly",  "0.9"),
    (f"{BASE_URL}/categories/guerilla-marketing.html",  "2026-03-22", "weekly",  "0.9"),
    (f"{BASE_URL}/categories/index.html",               "2026-03-22", "weekly",  "1.0"),
    (f"{BASE_URL}/categories/lore.html",                "2026-03-22", "weekly",  "0.9"),
    (f"{BASE_URL}/categories/media-publishing.html",    "2026-03-22", "weekly",  "0.9"),
    (f"{BASE_URL}/categories/nfts-digital-art.html",    "2026-03-22", "weekly",  "0.9"),
    (f"{BASE_URL}/categories/punk-culture.html",        "2026-03-22", "weekly",  "0.9"),
    (f"{BASE_URL}/categories/technology.html",          "2026-03-22", "weekly",  "0.9"),
    (f"{BASE_URL}/categories/tools.html",               "2026-03-22", "weekly",  "0.9"),
]


def regenerate_sitemap() -> None:
    """
    Rebuild sitemap.xml from:
      - the fixed static entries above
      - every *.html file found directly inside wiki/  (bibles/ excluded)
    """
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]

    # Static entries
    for url, lastmod, changefreq, priority in _STATIC_ENTRIES:
        lines.append(
            f'  <url><loc>{url}</loc>'
            f'<lastmod>{lastmod}</lastmod>'
            f'<changefreq>{changefreq}</changefreq>'
            f'<priority>{priority}</priority></url>'
        )

    # Wiki entries — scan actual files so dead links are never added
    wiki_files = sorted(
        f for f in glob.glob(os.path.join(WIKI_DIR, "*.html"))
    )
    for wiki_file in wiki_files:
        fname = os.path.basename(wiki_file)
        url = f"{BASE_URL}/wiki/{fname}"
        lines.append(
            f'  <url><loc>{url}</loc>'
            f'<lastmod>{TODAY}</lastmod>'
            f'<changefreq>weekly</changefreq>'
            f'<priority>0.8</priority></url>'
        )

    lines.append('</urlset>')

    sitemap_content = "\n".join(lines) + "\n"
    with open(SITEMAP_PATH, "w", encoding="utf-8") as fh:
        fh.write(sitemap_content)

    print(f"[SITEMAP] Regenerated with {len(wiki_files)} wiki pages → sitemap.xml")


# ── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    bible_files = sorted(glob.glob(os.path.join(BIBLES_DIR, "*.json")))

    if not bible_files:
        print("[WIKI] No bible files found — nothing to publish.")
        return

    published: list = []
    errors: list = []

    for bible_path in bible_files:
        try:
            slug = publish_bible(bible_path)
            published.append(slug)
        except Exception as exc:
            errors.append((bible_path, str(exc)))
            print(f"[WIKI] ERROR publishing {bible_path}: {exc}")

    print(f"\n[WIKI] Done — {len(published)} published, {len(errors)} errors.")

    regenerate_sitemap()

    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
