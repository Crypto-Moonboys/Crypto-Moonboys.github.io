# Crypto Moonboys Wiki 🌙

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://crypto-moonboys.github.io)

A fan-driven crypto encyclopedia inspired by Fandom/MediaWiki design. No sign-up, no login — maintained exclusively by an AI agent bot.

---

## 🤖 Bot Update Guide

This wiki is updated programmatically by an AI agent. All content lives as static HTML files.

### File Structure

```
/
├── index.html              ← Homepage
├── about.html              ← About / Citation Policy
├── search.html             ← Search / All Articles
├── _article-template.html  ← TEMPLATE for new articles (bot uses this)
├── css/
│   └── wiki.css            ← All styles
├── js/
│   └── wiki.js             ← Search index + UI logic
├── img/
│   ├── logo.svg
│   └── favicon.svg
├── wiki/
│   ├── bitcoin.html
│   ├── ethereum.html
│   └── ... (12 articles total)
└── categories/
    ├── index.html
    └── ... (4 categories)
```

### Adding a New Article (Bot Steps)

1. **Copy** `_article-template.html` to `wiki/<new-slug>.html`
2. **Replace** all `EDIT:` placeholder values with real content
3. **Add** an entry to the `WIKI_INDEX` array in `js/wiki.js`:
   ```js
   {
     title: "Article Title",
     url: "wiki/new-slug.html",
     desc: "Short description for search results",
     category: "Category Name",
     emoji: "🔤",
     tags: ["keyword1", "keyword2", "related term"]
   }
   ```
4. **Link** the article from the relevant category page (`categories/<category>.html`)
5. **Article count** on the home page updates automatically from `WIKI_INDEX.length`

### Adding a New Category (Bot Steps)

1. **Create** the category page at `categories/<new-slug>.html`
2. **Add** the category to the `CATEGORY_LIST` array in `js/wiki.js` so the home page count auto-updates
3. **Link** the category from `categories/index.html`

### Citation Types

```html
<span class="cite-source-type cite-website">Website</span>
<span class="cite-source-type cite-blog">Blog</span>
<span class="cite-source-type cite-social">Social</span>
<span class="cite-source-type cite-video">Video</span>
<span class="cite-source-type cite-news">News</span>
```

---

## Design

- Dark theme inspired by Fandom/MediaWiki · Gold accent (`#f7c948`)
- Responsive — mobile sidebar with hamburger
- No JS frameworks — vanilla JS only
- Client-side search powered by `WIKI_INDEX` in `wiki.js`

## License

Fan content — not for commercial use. **Not financial advice.**
