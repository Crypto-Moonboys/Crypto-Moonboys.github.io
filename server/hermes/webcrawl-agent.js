"use strict";

const fs = require("node:fs");
const path = require("node:path");
const dns = require("node:dns").promises;
const { HERMES_DATA_ROOT } = require("./config.js");

const HISTORY_FILE = path.join(HERMES_DATA_ROOT, "webcrawl-history.json");
const MAX_CRAWL_DEPTH = 2;
const MAX_CRAWL_PAGES = 12;
const MAX_FETCH_BYTES = 250000;
const DEFAULT_TIMEOUT_MS = 12000;
const SEARCH_LIMIT = 8;

function nowIso() {
  return new Date().toISOString();
}

function ensureDataDir() {
  fs.mkdirSync(HERMES_DATA_ROOT, { recursive: true });
}

function readHistory() {
  ensureDataDir();
  if (!fs.existsSync(HISTORY_FILE)) {
    return { topics: {}, sessions: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      return { topics: {}, sessions: [] };
    }
    return {
      topics: parsed.topics && typeof parsed.topics === "object" ? parsed.topics : {},
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
    };
  } catch (_error) {
    return { topics: {}, sessions: [] };
  }
}

function writeHistory(history) {
  ensureDataDir();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2) + "\n", "utf8");
}

function normalizeUrl(rawUrl) {
  const url = new URL(String(rawUrl || "").trim());
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http/https URLs are allowed.");
  }
  return url;
}

function isPrivateIpv4(value) {
  const ip = String(value || "");
  if (!/^\d+\.\d+\.\d+\.\d+$/u.test(ip)) return false;
  const parts = ip.split(".").map((v) => Number(v));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function isBlockedHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return true;
  if (host === "localhost") return true;
  if (host.endsWith(".localhost")) return true;
  if (host.endsWith(".local")) return true;
  if (host === "0.0.0.0") return true;
  if (host === "::1") return true;
  if (host.startsWith("127.")) return true;
  if (isPrivateIpv4(host)) return true;
  if (host.startsWith("169.254.")) return true;
  if (host.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./u.test(host)) return true;
  return false;
}

async function assertPublicTarget(url) {
  if (isBlockedHost(url.hostname)) {
    throw new Error("Blocked private or local network target.");
  }
  try {
    const records = await dns.lookup(url.hostname, { all: true });
    for (const record of records) {
      const addr = String(record?.address || "");
      if (!addr) continue;
      if (addr === "::1" || isPrivateIpv4(addr) || addr.startsWith("fe80:") || addr.startsWith("fc") || addr.startsWith("fd")) {
        throw new Error("Blocked private or local network target.");
      }
    }
  } catch (error) {
    if (/Blocked private or local network target\./u.test(String(error?.message || ""))) {
      throw error;
    }
  }
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      text: text.slice(0, MAX_FETCH_BYTES),
      truncated: text.length > MAX_FETCH_BYTES
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractLinks(baseUrl, html) {
  const links = [];
  const seen = new Set();
  const src = String(html || "");
  const re = /href\s*=\s*["']([^"'#]+)["']/giu;
  let match = re.exec(src);
  while (match) {
    const raw = String(match[1] || "").trim();
    try {
      const absolute = new URL(raw, baseUrl).toString();
      if (!seen.has(absolute)) {
        seen.add(absolute);
        links.push(absolute);
      }
    } catch (_error) {
      // Ignore malformed links.
    }
    match = re.exec(src);
  }
  return links;
}

function buildSessionRecord(kind, payload = {}) {
  return {
    id: `wc_${Date.now()}`,
    kind,
    timestamp: nowIso(),
    ...payload
  };
}

function unavailableResult(topic, action) {
  return {
    ok: false,
    action,
    unavailable: true,
    message: "Webcrawl tools unavailable",
    topic: String(topic || ""),
    checkedAt: nowIso(),
    sources: [],
    failures: ["OPENAI_API_KEY is not configured for web search."]
  };
}

async function searchWeb(topic, options = {}) {
  const query = String(topic || "").trim();
  if (!query) {
    throw new Error("Topic/query is required.");
  }
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return unavailableResult(query, "webcrawl/search");
  }

  const body = {
    model: String(options.model || process.env.HERMES_WEB_MODEL || "gpt-5.4-mini"),
    input: `Find recent public updates about: ${query}. Return concise factual findings with source URLs and dates.`,
    tools: [{ type: "web_search_preview" }]
  };
  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    timeoutMs: Number(options.timeoutMs || 20000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const raw = String(response.text || "");
  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    parsed = {};
  }
  const outputText = String(parsed.output_text || "").trim();
  const sources = [];
  const urlRegex = /https?:\/\/[^\s)\]]+/giu;
  let match = urlRegex.exec(outputText);
  while (match && sources.length < SEARCH_LIMIT) {
    const url = String(match[0]).replace(/[.,;]+$/u, "");
    if (!sources.find((s) => s.url === url)) {
      sources.push({ url, title: "" });
    }
    match = urlRegex.exec(outputText);
  }
  return {
    ok: response.ok,
    action: "webcrawl/search",
    topic: query,
    checkedAt: nowIso(),
    summary: outputText || (response.ok ? "No summary returned." : "Web search failed."),
    confidence: response.ok ? "medium" : "low",
    sources,
    failures: response.ok ? [] : [`Web search API returned status ${response.status}.`]
  };
}

async function fetchUrl(rawUrl, options = {}) {
  const url = normalizeUrl(rawUrl);
  await assertPublicTarget(url);
  const response = await fetchWithTimeout(url.toString(), {
    timeoutMs: Number(options.timeoutMs || DEFAULT_TIMEOUT_MS),
    headers: {
      "User-Agent": "HermesWebcrawlAgent/1.0 (+https://cryptomoonboys.com)"
    }
  });
  const titleMatch = String(response.text || "").match(/<title[^>]*>([^<]+)<\/title>/iu);
  return {
    ok: response.ok,
    action: "webcrawl/fetch-url",
    url: url.toString(),
    checkedAt: nowIso(),
    status: response.status,
    title: titleMatch ? String(titleMatch[1]).trim() : "",
    snippet: String(response.text || "").slice(0, 1000),
    truncated: response.truncated === true,
    confidence: response.ok ? "high" : "low",
    sources: [{ url: url.toString(), title: titleMatch ? String(titleMatch[1]).trim() : "" }],
    failures: response.ok ? [] : [`Fetch failed with status ${response.status}.`]
  };
}

async function crawlWebsite(rawUrl, options = {}) {
  const startUrl = normalizeUrl(rawUrl);
  await assertPublicTarget(startUrl);
  const maxDepth = Math.min(Math.max(Number(options.maxDepth || MAX_CRAWL_DEPTH), 0), MAX_CRAWL_DEPTH);
  const maxPages = Math.min(Math.max(Number(options.maxPages || MAX_CRAWL_PAGES), 1), MAX_CRAWL_PAGES);
  const queue = [{ url: startUrl.toString(), depth: 0 }];
  const visited = new Set();
  const pages = [];
  const failures = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const next = queue.shift();
    if (!next || visited.has(next.url)) continue;
    visited.add(next.url);
    try {
      const fetched = await fetchUrl(next.url, options);
      pages.push({
        url: fetched.url,
        title: fetched.title,
        status: fetched.status,
        checkedAt: fetched.checkedAt
      });
      if (next.depth < maxDepth) {
        const links = extractLinks(next.url, fetched.snippet || "");
        for (const link of links) {
          if (visited.has(link)) continue;
          try {
            const candidate = normalizeUrl(link);
            if (candidate.hostname !== startUrl.hostname) continue;
            queue.push({ url: candidate.toString(), depth: next.depth + 1 });
          } catch (_error) {
            // Skip malformed links.
          }
        }
      }
    } catch (error) {
      failures.push(`${next.url}: ${String(error?.message || error)}`);
    }
  }

  return {
    ok: failures.length < pages.length || pages.length > 0,
    action: "webcrawl/crawl-site",
    topic: startUrl.hostname,
    checkedAt: nowIso(),
    sourceRoot: startUrl.toString(),
    pagesVisited: pages.length,
    maxDepth,
    maxPages,
    confidence: pages.length > 0 ? "medium" : "low",
    sources: pages.map((p) => ({ url: p.url, title: p.title || "" })),
    failures
  };
}

function extractRssItems(xmlText, limit = 8) {
  const text = String(xmlText || "");
  const items = [];
  const itemRe = /<item[\s\S]*?<\/item>/giu;
  let match = itemRe.exec(text);
  while (match && items.length < limit) {
    const block = String(match[0] || "");
    const title = (block.match(/<title>([\s\S]*?)<\/title>/iu) || [])[1] || "";
    const link = (block.match(/<link>([\s\S]*?)<\/link>/iu) || [])[1] || "";
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/iu) || [])[1] || "";
    items.push({ title: String(title).trim(), url: String(link).trim(), publishedAt: String(pubDate).trim() });
    match = itemRe.exec(text);
  }
  return items;
}

async function compareWithSnapshot(topic) {
  const key = String(topic || "").trim().toLowerCase();
  if (!key) {
    throw new Error("Topic is required.");
  }
  const history = readHistory();
  const previous = history.topics[key];
  if (!previous) {
    return {
      ok: true,
      action: "webcrawl/compare-snapshot",
      topic: key,
      checkedAt: nowIso(),
      whatChanged: "No prior snapshot found.",
      confidence: "low",
      sources: [],
      failures: []
    };
  }

  const current = await searchWeb(key);
  const previousUrls = new Set((previous.sources || []).map((s) => s.url));
  const newSources = (current.sources || []).filter((s) => !previousUrls.has(s.url));
  return {
    ok: true,
    action: "webcrawl/compare-snapshot",
    topic: key,
    checkedAt: nowIso(),
    whatChanged: newSources.length ? `Found ${newSources.length} new source(s).` : "No source-level changes detected.",
    confidence: newSources.length ? "medium" : "low",
    sources: current.sources || [],
    newSources,
    failures: current.failures || []
  };
}

function saveWatchTopic(topic, metadata = {}) {
  const key = String(topic || "").trim().toLowerCase();
  if (!key) {
    throw new Error("Topic is required.");
  }
  const history = readHistory();
  history.topics[key] = {
    topic: key,
    createdAt: history.topics[key]?.createdAt || nowIso(),
    updatedAt: nowIso(),
    ...history.topics[key],
    ...metadata
  };
  writeHistory(history);
  return history.topics[key];
}

function listWatchTopics() {
  const history = readHistory();
  return Object.values(history.topics || {}).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function addSessionRecord(record) {
  const history = readHistory();
  history.sessions.unshift(record);
  history.sessions = history.sessions.slice(0, 200);
  writeHistory(history);
}

function clearWebcrawlSession() {
  const history = readHistory();
  history.sessions = [];
  writeHistory(history);
  return { cleared: true, checkedAt: nowIso() };
}

function summarizeFindings(topic) {
  const key = String(topic || "").trim().toLowerCase();
  const history = readHistory();
  const records = history.sessions.filter((item) => !key || String(item.topic || "").toLowerCase() === key).slice(0, 8);
  return {
    topic: key || "",
    checkedAt: nowIso(),
    count: records.length,
    records
  };
}

async function findNewUpdates(topic, options = {}) {
  const key = String(topic || "").trim();
  if (!key) {
    throw new Error("Topic is required.");
  }
  const latest = await searchWeb(key, options);
  const history = readHistory();
  const previous = history.topics[key.toLowerCase()];
  const previousUrls = new Set((previous?.sources || []).map((s) => s.url));
  const newSources = (latest.sources || []).filter((s) => !previousUrls.has(s.url));
  const result = {
    ...latest,
    action: "webcrawl/find-updates",
    whatChanged: previous
      ? (newSources.length ? `Found ${newSources.length} new source(s) since last check.` : "No new sources since last check.")
      : "First check for this topic.",
    newSources
  };
  history.topics[key.toLowerCase()] = {
    topic: key,
    updatedAt: nowIso(),
    checkedAt: result.checkedAt,
    sources: latest.sources || [],
    summary: latest.summary || "",
    lastResultOk: latest.ok === true
  };
  history.sessions.unshift(buildSessionRecord("find-updates", result));
  history.sessions = history.sessions.slice(0, 200);
  writeHistory(history);
  return result;
}

async function checkRssFeed(rawUrl, options = {}) {
  const fetched = await fetchUrl(rawUrl, options);
  if (!fetched.ok) return fetched;
  const items = extractRssItems(fetched.snippet || "");
  return {
    ok: true,
    action: "webcrawl/rss-check",
    checkedAt: nowIso(),
    url: fetched.url,
    topic: fetched.url,
    confidence: items.length ? "medium" : "low",
    sources: items.map((item) => ({ url: item.url, title: item.title })),
    items,
    failures: []
  };
}

async function executeWebcrawlAction(actionType, payload = {}) {
  const topic = String(payload.topic || payload.query || "").trim();
  let result;
  switch (actionType) {
    case "webcrawl/find-updates":
      result = await findNewUpdates(topic, payload);
      break;
    case "webcrawl/search":
      result = await searchWeb(topic, payload);
      addSessionRecord(buildSessionRecord("search", result));
      break;
    case "webcrawl/fetch-url":
      result = await fetchUrl(payload.url, payload);
      addSessionRecord(buildSessionRecord("fetch-url", result));
      break;
    case "webcrawl/crawl-site":
      result = await crawlWebsite(payload.url, payload);
      addSessionRecord(buildSessionRecord("crawl-site", result));
      break;
    case "webcrawl/compare-snapshot":
      result = await compareWithSnapshot(topic);
      addSessionRecord(buildSessionRecord("compare-snapshot", result));
      break;
    case "webcrawl/save-topic":
      result = {
        ok: true,
        action: "webcrawl/save-topic",
        checkedAt: nowIso(),
        topic,
        saved: saveWatchTopic(topic, {
          sourceUrl: String(payload.url || "").trim()
        }),
        confidence: "high",
        sources: [],
        failures: []
      };
      break;
    case "webcrawl/list-topics":
      result = {
        ok: true,
        action: "webcrawl/list-topics",
        checkedAt: nowIso(),
        topics: listWatchTopics(),
        confidence: "high",
        sources: [],
        failures: []
      };
      break;
    case "webcrawl/summarize":
      result = {
        ok: true,
        action: "webcrawl/summarize",
        checkedAt: nowIso(),
        summary: summarizeFindings(topic),
        confidence: "medium",
        sources: [],
        failures: []
      };
      break;
    case "webcrawl/clear-session":
      result = {
        ok: true,
        action: "webcrawl/clear-session",
        checkedAt: nowIso(),
        ...clearWebcrawlSession(),
        confidence: "high",
        sources: [],
        failures: []
      };
      break;
    case "webcrawl/rss-check":
      result = await checkRssFeed(payload.url, payload);
      addSessionRecord(buildSessionRecord("rss-check", result));
      break;
    default:
      throw new Error("Unknown webcrawl action.");
  }
  return result;
}

module.exports = {
  executeWebcrawlAction,
  assertPublicTarget,
  normalizeUrl,
  readHistory
};
