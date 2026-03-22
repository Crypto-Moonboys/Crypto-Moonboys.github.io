> **Note:** This file defines wiki publishing rules for SAM. The full Master Agent Bible (DB-1 to DB-48) lives in the agent repo at `HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE/brain-rules.md`.

# 🧠 Crypto Moonboys Wiki — Brain Rules

Rules enforced for every new page SAM creates. Non-negotiable.

---

## Rule 1 — Every New Page Must Appear in the ⚔️ HODL Wars Lore$ Sidebar

Every wiki page SAM creates must be registered in the left-hand sidebar under the ⚔️ HODL Wars Lore$ section. No page gets published without a sidebar entry.

## Rule 2 — Every Sidebar Entry Must Have a Fitting Emoji

Like the existing entries:

- 🗡️ HODL Wars Lore$
- ⚔️ The HODL Warriors
- 💎 Diamond Hands
- 🤚 Paper Hands
- 🐋 The Whale Lords
- 🚀 Moon Mission
- 📉 The Great Dip
- 🐻 Bear Market Siege
- 🪤 Rug Pull Wars

Every new page must pick an emoji that fits the name:
- Faction = ⚔️
- Character = 🧬
- Location = 🏙️
- Mechanic = ⚙️
- Token = 💰
- No obvious fit → use any expressive emoji

**Blank emoji entries are banned.**

## Rule 3 — Emoji-First Titles & Headers

All page titles and first-level `<h1>` headers must start with an emoji. Examples:

- `⚡ NULL THE PROPHET — Genesis Error of the Sacred Chain`
- `🏙️ Block Topia — Where Code Is Law`
- `💀 The Great Datapocalypse of 2789`

## Rule 4 — Emoji Used Heavily Throughout Body Text

When citing facts, naming characters, factions, locations, events, and mechanics inside article body, emojis must be used liberally:

- Sub-headers (`<h2>`, `<h3>`) — always start with emoji
- First mention of any named entity in a section — emoji before name
- Key facts / bullet points — emoji bullet or inline emoji

## Rule 5 — Every Page Must Cross-Link

Every wiki article must link to at least 4 other pages in the wiki. No isolated pages.

## Rule 6 — Content Quality Bar

- No lorem ipsum. No placeholder content. No "coming soon" sections.
- Every stat and date must be real and accurate as of 2026.
- Write like you know your stuff AND you love crypto — not like a Wikipedia article.
- Community voice sections must genuinely sound like a crypto OG wrote them.

## Rule 7 — sitemap.xml Must Be Updated

Any PR that adds new HTML pages must also update `sitemap.xml` to include all new URLs with `lastmod` of the current date.

---

## 🔗 Agent Bible Rules Also Applicable to Site Contributors

The following rules from the Master Agent Bible (`brain-rules.md` in `HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE`) directly govern work on this site repo. Site contributors MUST be aware of these:

| Rule | Summary |
|------|---------|
| DB-40 | SAM can ONLY create/edit pages it creates itself — never touch existing site files |
| DB-41 | All SAM-generated pages must use the exact current layout — zero styling changes |
| DB-42 | New SAM pages created as HTML in `/wiki/` folder with correct structure |
| DB-43 | Correct wiki tables, headings, lists — every SAM page matches site style exactly |
| DB-44 | SAM can ONLY edit pages it creates — it will NEVER edit any current OG site pages |
| DB-45 | Images: outside frames use `![Alt](url)`, inside frames use `<figure>` — always cite with source URL + date |
| DB-46 | All images from official/user-uploaded GraffPUNKS refs only — cite every image |

> ⚠️ If you are a human contributor: **do not edit `wiki/sam-*.html` files manually** — these are SAM's domain (DB-44). If you need to correct a SAM page, open an issue and SAM will re-generate it on the next cycle.
>
> The full Master Agent Bible is at: https://github.com/HODLKONG64/HAY-MUM-IM-BUILDING-AGENTS-OF-CHANGE/blob/main/brain-rules.md

---

## DB-47 — No "sam" Prefix in New URL Slugs

SAM must NEVER use "sam" as a prefix in any URL slug or filename going forward. All new article filenames must use descriptive slugs only (e.g. `wiki/alfie-blaze.html` not `wiki/sam-alfie-blaze.html`). Legacy `wiki/sam-*.html` files are automatically redirected to their new URLs by sam-wiki-publisher.py each cycle. `sam.html` is redirected to `agent.html`. `categories/sam-generated.html` is redirected to `categories/lore.html`.

## DB-48 — Register Every New Article in articles.html and index.html

Every time SAM publishes any new article or category page, it MUST also:
1. Add the article to `articles.html` under the correct category section.
2. Add a summary card to `index.html` if it is a category page.
3. Update the article/category stat counts on `index.html`.
