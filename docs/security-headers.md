# Security Headers — Deployment Guide

## Overview

This document explains how HTTP security headers are applied across the Crypto
Moonboys infrastructure, which spans:

- **Cloudflare Workers** (moonboys-api, leaderboard, anti-cheat, and future workers)
- **GitHub Pages** (static site — raw HTML/CSS/JS)
- **Colyseus game server** (Block Topia — Node.js/Express)

Security headers cannot be set by GitHub Pages directly. GitHub Pages does not
support `_headers` files (those are valid only for Cloudflare Pages or Netlify).

---

## 1. Cloudflare Workers

All JSON responses from Cloudflare Workers include the following security headers:

| Header | Value | Purpose |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `Access-Control-Allow-Origin` | Allowlisted origin only | Restrict CORS to known browser origins |

These headers are added in the `buildCorsHeaders()` / `getCorsHeaders()` helper
functions in each worker. Any new worker **must** include these headers in all
responses.

### Allowed Origins

Requests from browser origins are only accepted from the allowlist:

- `https://cryptomoonboys.com`
- `https://crypto-moonboys.github.io`

Set the `CORS_ALLOWED_ORIGINS` environment variable (comma-separated) to override
for staging environments.

### Content-Security-Policy

CSP is intentionally omitted from Worker JSON API responses because CSP is most
valuable for HTML documents. When the static site is migrated to Cloudflare
Pages, add CSP to the `_headers` file (see section 3 below).

---

## 2. GitHub Pages (current)

GitHub Pages serves the static HTML/CSS/JS site. Plain GitHub Pages does **not**
apply `_headers` files — that format is Cloudflare Pages / Netlify only.

### Option A: Cloudflare Transform Rules (recommended)

If the GitHub Pages domain is fronted by Cloudflare's proxy (orange cloud), use
a Cloudflare **Transform Rule** to inject headers on all responses:

1. In the Cloudflare dashboard → Rules → Transform Rules → Modify Response Header.
2. Add a rule that matches `http.host eq "crypto-moonboys.github.io"` (or your
   custom domain).
3. Add the following response headers:
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `X-Frame-Options: SAMEORIGIN`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
   - `Content-Security-Policy: default-src 'self' https:; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' https://telegram.org; style-src 'self' 'unsafe-inline'`

### Option B: Cloudflare Worker route (reverse proxy)

A Cloudflare Worker acting as a reverse proxy for the Pages origin can inject
headers on every response before it reaches the browser.

### What does NOT work

- A `_headers` file in the repository root — GitHub Pages ignores it.
- Netlify `_headers` format — only works when deployed to Netlify.

---

## 3. Cloudflare Pages (future migration)

If the static site is migrated from GitHub Pages to Cloudflare Pages:

1. A `_headers` file at the repository root **will** be applied by Cloudflare Pages.
2. Migrate the header policy from the Transform Rule into the `_headers` file.
3. Example `_headers` content for Cloudflare Pages:

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self' https:; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' https://telegram.org; style-src 'self' 'unsafe-inline'
```

---

## 4. Block Topia Game Server (Express + Colyseus)

The Express server does not currently set HTTP security headers on its responses.
If the server is ever exposed directly to browser clients (beyond Cloudflare proxy),
add a security middleware such as `helmet` before the CORS and route handlers.

For the `/health` endpoint and WebSocket upgrade path, minimal headers are
sufficient. The Colyseus monitor at `/colyseus` is protected by HTTP Basic Auth
and is additionally restricted by the `MONITOR_PASSWORD` environment variable.

---

## 5. Deployment Checklist

- [ ] Cloudflare Transform Rule (or Worker route) injects security headers on
      GitHub Pages responses.
- [ ] `CORS_ALLOWED_ORIGINS` env var is set on all Cloudflare Workers in production.
- [ ] `MONITOR_PASSWORD` is set on the Block Topia game server in production.
- [ ] Worker secrets (`TELEGRAM_BOT_TOKEN`, `ADMIN_SECRET`) are set via
      `wrangler secret put`, never in `wrangler.toml`.
