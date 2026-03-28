import sys
import os
import json
import glob
import re
from datetime import datetime, timezone

EXPORT_PATH = "main-brain-export.json"
WIKI_DIR = "wiki"
TEMPLATE_PATH = "_article-template.html"
BASE_URL = "https://crypto-moonboys.github.io"

# ---------------------------------------------------------------------------
# 1. Input validation — ABORT BEFORE CLEAN if any check fails
# ---------------------------------------------------------------------------

if not os.path.exists(EXPORT_PATH):
    print(f"[ABORT] {EXPORT_PATH} not found. Wiki not modified.")
    sys.exit(1)

with open(EXPORT_PATH, "r", encoding="utf-8") as f:
    try:
        export = json.load(f)
    except json.JSONDecodeError as e:
        print(f"[ABORT] {EXPORT_PATH} is malformed JSON: {e}. Wiki not modified.")
        sys.exit(1)

# Support multiple possible export shapes
entities = (
    export.get("entities") or
    export.get("entity_list") or
    export.get("pages") or
    []
)

if not entities or not isinstance(entities, list) or len(entities) == 0:
    print(f"[ABORT] {EXPORT_PATH} contains no entities. Wiki not modified.")
    sys.exit(1)

print(f"[WIKI] Loaded {len(entities)} entities from {EXPORT_PATH}")

# ---------------------------------------------------------------------------
# 2. Read template — ABORT if missing
# ---------------------------------------------------------------------------

if not os.path.exists(TEMPLATE_PATH):
    print(f"[ABORT] {TEMPLATE_PATH} not found. Wiki not modified.")
    sys.exit(1)

with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
    template = f.read()

# ---------------------------------------------------------------------------
# 3. Slugify — SINGLE source of truth (entity name only, never JSON slug field)
# ---------------------------------------------------------------------------

def slugify(text):
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")

# ---------------------------------------------------------------------------
# 4. Duplicate detection (warn but do not abort)
# ---------------------------------------------------------------------------

slugs = []
for entity_data in entities:
    entity_name = (
        entity_data.get("entity") or
        entity_data.get("name") or
        entity_data.get("title") or
        ""
    )
    if not entity_name:
        continue
    slug = slugify(entity_name)
    if slug in slugs:
        print(f"[WARN] Duplicate entity detected: {entity_name} → {slug}")
    else:
        slugs.append(slug)

# ---------------------------------------------------------------------------
# 5. Hard clean AFTER validation passes
# ---------------------------------------------------------------------------

os.makedirs(WIKI_DIR, exist_ok=True)
existing = glob.glob(f"{WIKI_DIR}/*.html")
for fp in existing:
    os.remove(fp)
print(f"[WIKI] Cleaned {len(existing)} legacy files from {WIKI_DIR}/")

# ---------------------------------------------------------------------------
# 6. HTML page generation
# ---------------------------------------------------------------------------

written_count = 0

for entity_data in entities:
    entity_name = (
        entity_data.get("entity") or
        entity_data.get("name") or
        entity_data.get("title") or
        ""
    )
    if not entity_name:
        print("[WARN] Skipping entity with no name field.")
        continue

    slug = slugify(entity_name)

    # Safety guard: slug must never contain path components
    assert not slug.startswith("wiki/"), f"Slug must not start with 'wiki/': {slug}"

    description = (
        entity_data.get("description") or
        entity_data.get("summary") or
        f"{entity_name} — Crypto Moonboys Wiki"
    )

    content = (
        entity_data.get("content") or
        entity_data.get("body") or
        entity_data.get("summary") or
        ""
    )

    page = template

    # Replace meta description
    page = page.replace(
        "ARTICLE DESCRIPTION — Crypto Moonboys Wiki",
        f"{description} — Crypto Moonboys Wiki"
    )
    # Replace OG title
    page = page.replace(
        "ARTICLE TITLE — Crypto Moonboys Wiki",
        f"{entity_name} — Crypto Moonboys Wiki"
    )
    # Replace OG description
    page = page.replace(
        'content="ARTICLE DESCRIPTION"',
        f'content="{description}"'
    )
    # Replace OG URL slug
    page = page.replace("ARTICLE-SLUG", slug)
    # Replace page <title>
    page = page.replace(
        "<title>ARTICLE TITLE — Crypto Moonboys Wiki</title>",
        f"<title>{entity_name} — Crypto Moonboys Wiki</title>"
    )
    # Replace entity slug placeholder in article element
    page = page.replace("{{ENTITY_SLUG}}", slug)
    # Replace breadcrumb / h1 article title occurrences
    page = page.replace("ARTICLE TITLE", entity_name)

    # Inject article body content into the article element
    # Replace the lead paragraph placeholder with actual content (if any)
    if content:
        page = page.replace(
            "<p>LEAD PARAGRAPH — A brief introduction to the topic (2-3 sentences).</p>",
            content
        )

    out_path = os.path.join(WIKI_DIR, f"{slug}.html")
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(page)

    assert os.path.exists(out_path), f"File not written: {out_path}"
    written_count += 1
    print(f"[WIKI] Written: wiki/{slug}.html")

# ---------------------------------------------------------------------------
# 7. Post-build sitemap rebuild (from filesystem only)
# ---------------------------------------------------------------------------

written_files = sorted(glob.glob(f"{WIKI_DIR}/*.html"))
now = datetime.now(timezone.utc).strftime("%Y-%m-%d")

sitemap_entries = []
for filepath in written_files:
    filename = os.path.basename(filepath)
    page_slug = filename.replace(".html", "")
    url = f"{BASE_URL}/wiki/{page_slug}.html"
    sitemap_entries.append(f"""  <url>
    <loc>{url}</loc>
    <lastmod>{now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>""")

sitemap_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{chr(10).join(sitemap_entries)}
</urlset>"""

with open("sitemap.xml", "w", encoding="utf-8") as f:
    f.write(sitemap_xml)

print(f"[WIKI] Sitemap rebuilt with {len(written_files)} URLs → sitemap.xml")

# ---------------------------------------------------------------------------
# 8. Final summary log
# ---------------------------------------------------------------------------

print(f"[WIKI] Built {written_count} pages from {EXPORT_PATH}")
print(f"[WIKI] All output paths: wiki/{{slug}}.html ✓")
print(f"[WIKI] Ready for rerun ✓")
