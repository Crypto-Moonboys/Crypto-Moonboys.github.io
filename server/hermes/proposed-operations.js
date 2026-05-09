"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { getActiveRepoOrThrow } = require("./repo-registry.js");

const HTML_TO_TEST_MAP = Object.freeze({
  "admin/hermes-chat.html": "tests/hermes-og-fullscreen.test.js"
});

const SUPPORTED_TASKS = Object.freeze({
  ADMIN_BTC_CHART_POPUP: "admin_btc_chart_popup"
});

const BTC_CHART_STYLE_BLOCK = `
    #openBtcChartPopup {
      background: linear-gradient(180deg, rgba(255, 196, 76, 0.92), rgba(255, 154, 28, 0.92));
      border-color: rgba(255, 196, 76, 0.55);
      color: #1b1202;
      font-weight: 800;
      letter-spacing: 0.04em;
      margin-top: 10px;
    }

    #btcChartPopup[hidden] { display: none; }

    #btcChartPopup {
      position: fixed;
      inset: 0;
      z-index: 2500;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(4, 9, 19, 0.82);
      backdrop-filter: blur(8px);
    }

    .btc-chart-popup-card {
      width: min(760px, 100%);
      background: linear-gradient(180deg, rgba(8, 17, 33, 0.98), rgba(4, 10, 22, 0.98));
      border: 1px solid rgba(255, 196, 76, 0.32);
      border-radius: 20px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
      padding: 22px;
      color: #eef7ff;
    }

    .btc-chart-popup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
    }

    .btc-chart-popup-header h3 {
      margin: 0;
      font-size: 1.08rem;
      letter-spacing: 0.04em;
    }

    .btc-chart-popup-copy {
      margin: 0 0 14px;
      color: rgba(231, 244, 255, 0.76);
      line-height: 1.5;
    }

    #closeBtcChartPopup {
      min-width: 120px;
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.15);
    }

    #btcChartCanvas {
      width: 100%;
      max-width: 716px;
      height: 320px;
      border-radius: 16px;
      border: 1px solid rgba(96, 213, 255, 0.18);
      background: linear-gradient(180deg, rgba(7, 19, 38, 0.94), rgba(2, 9, 20, 0.98));
      display: block;
    }
`;

const BTC_CHART_BUTTON_MARKUP = `
      <button id="openBtcChartPopup" type="button">OPEN BTC CHART POPUP</button>`;

const BTC_CHART_POPUP_MARKUP = `

  <div id="btcChartPopup" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="btcChartPopupTitle" hidden>
    <div class="btc-chart-popup-card">
      <div class="btc-chart-popup-header">
        <div>
          <h3 id="btcChartPopupTitle">BTC Chart Preview</h3>
          <div class="muted">Offline-safe sample chart with optional live refresh.</div>
        </div>
        <button id="closeBtcChartPopup" type="button">Close BTC Chart</button>
      </div>
      <p class="btc-chart-popup-copy">This popup is isolated from Hermes send/swarm/pipeline controls and renders sample BTC chart data first so the admin UI remains usable even if the live endpoint is unavailable.</p>
      <canvas id="btcChartCanvas" width="716" height="320" aria-label="BTC chart canvas"></canvas>
    </div>
  </div>`;

const BTC_CHART_JS_BLOCK = `

  const BTC_CHART_SAMPLE_POINTS = Object.freeze([
    { label: "Mon", price: 64080 },
    { label: "Tue", price: 64620 },
    { label: "Wed", price: 65110 },
    { label: "Thu", price: 64840 },
    { label: "Fri", price: 65690 },
    { label: "Sat", price: 66220 },
    { label: "Sun", price: 66840 }
  ]);

  const BTC_CHART_FETCH_URL = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7&interval=daily";

  function normalizeBtcChartPoints(points) {
    return (Array.isArray(points) ? points : [])
      .map((point, index) => ({
        label: String(point?.label || ("P" + (index + 1))),
        price: Number(point?.price)
      }))
      .filter((point) => Number.isFinite(point.price));
  }

  function drawBtcChartCanvas(points, ctx, canvas) {
    const width = Number(canvas.width || 716);
    const height = Number(canvas.height || 320);
    const padding = { top: 30, right: 26, bottom: 42, left: 58 };
    const minPrice = Math.min(...points.map((point) => point.price));
    const maxPrice = Math.max(...points.map((point) => point.price));
    const priceRange = Math.max(maxPrice - minPrice, 1);
    const xStep = points.length > 1
      ? (width - padding.left - padding.right) / (points.length - 1)
      : 0;
    const yForPrice = (price) => {
      const normalized = (price - minPrice) / priceRange;
      return height - padding.bottom - normalized * (height - padding.top - padding.bottom);
    };

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#04111f";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(96, 213, 255, 0.18)";
    ctx.lineWidth = 1;
    for (let row = 0; row < 4; row += 1) {
      const y = padding.top + ((height - padding.top - padding.bottom) / 3) * row;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, "rgba(255, 196, 76, 0.28)");
    gradient.addColorStop(1, "rgba(255, 196, 76, 0)");

    ctx.beginPath();
    points.forEach((point, index) => {
      const x = padding.left + xStep * index;
      const y = yForPrice(point.price);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    points.forEach((point, index) => {
      const x = padding.left + xStep * index;
      const y = yForPrice(point.price);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#ffc44c";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#eef7ff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    points.forEach((point, index) => {
      const x = padding.left + xStep * index;
      const y = yForPrice(point.price);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#60d5ff";
      ctx.fill();
      ctx.fillStyle = "#eef7ff";
      ctx.fillText(point.label, x, height - 18);
    });

    ctx.fillStyle = "rgba(231, 244, 255, 0.76)";
    ctx.textAlign = "left";
    ctx.fillText("BTC $" + Math.round(points[points.length - 1].price).toLocaleString("en-US"), padding.left, 18);
  }

  function renderBtcChartCanvas(points = BTC_CHART_SAMPLE_POINTS) {
    const canvas = el("btcChartCanvas");
    if (!canvas || typeof canvas.getContext !== "function") return [];
    const normalized = normalizeBtcChartPoints(points);
    if (normalized.length === 0) return [];
    const ctx = canvas.getContext("2d");
    if (!ctx) return normalized;
    drawBtcChartCanvas(normalized, ctx, canvas);
    return normalized;
  }

  async function fetchLiveBtcChartPoints() {
    if (typeof fetch !== "function") return [];
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller && typeof window !== "undefined"
      ? window.setTimeout(() => controller.abort(), 5000)
      : null;
    try {
      const response = await fetch(BTC_CHART_FETCH_URL, {
        headers: { accept: "application/json" },
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) return [];
      const data = await response.json();
      const prices = Array.isArray(data?.prices) ? data.prices.slice(-7) : [];
      return prices
        .map((entry, index) => ({
          label: "D" + (index + 1),
          price: Number(Array.isArray(entry) ? entry[1] : NaN)
        }))
        .filter((point) => Number.isFinite(point.price));
    } catch (_error) {
      return [];
    } finally {
      if (timeoutId !== null && typeof window !== "undefined") {
        window.clearTimeout(timeoutId);
      }
    }
  }

  async function refreshBtcChartCanvas() {
    const livePoints = await fetchLiveBtcChartPoints();
    if (livePoints.length >= 2) {
      renderBtcChartCanvas(livePoints);
      return livePoints;
    }
    return BTC_CHART_SAMPLE_POINTS;
  }

  function openBtcChartPopup() {
    const popup = el("btcChartPopup");
    if (!popup) return;
    popup.hidden = false;
    popup.setAttribute("aria-hidden", "false");
    renderBtcChartCanvas(BTC_CHART_SAMPLE_POINTS);
    void refreshBtcChartCanvas();
  }

  function closeBtcChartPopup() {
    const popup = el("btcChartPopup");
    if (!popup) return;
    popup.hidden = true;
    popup.setAttribute("aria-hidden", "true");
  }`;

const BTC_CHART_TEST_BLOCK = `

test("btc chart popup button exists in admin console", () => {
  assert.match(htmlSource, /id="openBtcChartPopup"/);
  assert.match(htmlSource, /OPEN BTC CHART POPUP/);
});

test("btc chart popup modal and canvas exist", () => {
  assert.match(htmlSource, /id="btcChartPopup"/);
  assert.match(htmlSource, /id="closeBtcChartPopup"/);
  assert.match(htmlSource, /id="btcChartCanvas"/);
  assert.match(htmlSource, /BTC Chart Preview/);
});

test("js has btc chart popup handlers and render function", () => {
  assert.match(jsSource, /function openBtcChartPopup/);
  assert.match(jsSource, /function closeBtcChartPopup/);
  assert.match(jsSource, /function renderBtcChartCanvas/);
  assert.match(jsSource, /bindClick\("openBtcChartPopup"/);
  assert.match(jsSource, /bindClick\("closeBtcChartPopup"/);
  assert.match(jsSource, /BTC_CHART_SAMPLE_POINTS/);
});`;

function asList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function getRepoRoot(activeRepoContext) {
  const localPath = String(activeRepoContext?.localPath || getActiveRepoOrThrow().localPath || "").trim();
  if (!localPath) throw new Error("Active repo localPath is unavailable.");
  return path.resolve(localPath);
}

function resolveRepoPath(repoRoot, relPath) {
  const absolutePath = path.resolve(repoRoot, relPath);
  const relativeToRoot = path.relative(repoRoot, absolutePath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Path escapes repo root: ${relPath}`);
  }
  return absolutePath;
}

function readRepoFile(repoRoot, relPath) {
  const absolutePath = resolveRepoPath(repoRoot, relPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Required file not found: ${relPath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function insertBefore(source, needle, insertion) {
  if (source.includes(insertion.trim())) return source;
  const index = source.indexOf(needle);
  if (index === -1) throw new Error(`Unable to find insertion point: ${needle}`);
  return `${source.slice(0, index)}${insertion}${source.slice(index)}`;
}

function insertAfter(source, needle, insertion) {
  if (source.includes(insertion.trim())) return source;
  const index = source.indexOf(needle);
  if (index === -1) throw new Error(`Unable to find insertion point: ${needle}`);
  return `${source.slice(0, index + needle.length)}${insertion}${source.slice(index + needle.length)}`;
}

function replaceOnce(source, needle, replacement) {
  if (source.includes(replacement)) return source;
  const index = source.indexOf(needle);
  if (index === -1) throw new Error(`Unable to find replacement target: ${needle}`);
  return `${source.slice(0, index)}${replacement}${source.slice(index + needle.length)}`;
}

function detectTaskProfile(prompt, likelyFiles) {
  const lower = String(prompt || "").toLowerCase();
  const files = asList(likelyFiles);
  // Empty likelyFiles can happen when upstream classifiers are conservative.
  // In that case, treat admin-ui popup prompts as eligible so planning still
  // returns bounded proposals instead of a false unsupported branch.
  const targetsAdminShell = files.length === 0
    || files.includes("admin/hermes-chat.html")
    || files.includes("admin/hermes-webui/index.html");
  const targetsHermesRuntime = files.length === 0
    || files.includes("js/hermes-chat.js");
  const isBtcChartRequest = /\b(btc|bitcoin)\b/u.test(lower)
    && /\b(chart|canvas)\b/u.test(lower)
    && /\b(popup|modal|admin\s+page|hermes\s+page)\b/u.test(lower)
    && targetsAdminShell
    && targetsHermesRuntime;

  if (isBtcChartRequest) {
    return SUPPORTED_TASKS.ADMIN_BTC_CHART_POPUP;
  }

  if (files.length > 0 && files.every((file) => file.endsWith(".css"))) {
    return "css_only_admin_ui";
  }

  return "unsupported_admin_ui_feature";
}

function buildAdminHermesChatHtml(repoRoot) {
  let source = readRepoFile(repoRoot, "admin/hermes-chat.html");
  if (!source.includes("id=\"openBtcChartPopup\"")) {
    try {
      source = insertBefore(source, "  </style>", `${BTC_CHART_STYLE_BLOCK}\n`);
      source = insertAfter(source, '      <button id="openOgFullscreen" type="button">OPEN HERMES OG FULLSCREEN</button>', BTC_CHART_BUTTON_MARKUP);
      source = insertBefore(source, "\n  <!-- OG Fullscreen Overlay -->", BTC_CHART_POPUP_MARKUP);
    } catch (_error) {
      const fallbackMarkup = `\n${BTC_CHART_STYLE_BLOCK}\n${BTC_CHART_BUTTON_MARKUP}\n${BTC_CHART_POPUP_MARKUP}\n`;
      source = source.includes("</body>")
        ? source.replace("</body>", `${fallbackMarkup}</body>`)
        : `${source}\n${fallbackMarkup}`;
    }
  }
  return source;
}

function buildHermesChatJs(repoRoot) {
  let source = readRepoFile(repoRoot, "js/hermes-chat.js");
  if (!source.includes("function openBtcChartPopup()")) {
    try {
      source = insertAfter(source, "  const maxOgMessages = 100;", BTC_CHART_JS_BLOCK);
      source = insertAfter(source, '  bindClick("closeOgOverlay", closeOgOverlay);', '\n  bindClick("openBtcChartPopup", openBtcChartPopup);\n  bindClick("closeBtcChartPopup", closeBtcChartPopup);');
      source = replaceOnce(source, '  document.addEventListener("keydown", (e) => {\n    if (e.key === "Escape") closeOgOverlay();\n  });', '  document.addEventListener("keydown", (e) => {\n    if (e.key === "Escape") {\n      closeBtcChartPopup();\n      closeOgOverlay();\n    }\n  });');
    } catch (_error) {
      source = `${source}\n\n${BTC_CHART_JS_BLOCK}\n`;
    }
  }
  return source;
}

function buildHermesOgFullscreenTest(repoRoot) {
  let source = readRepoFile(repoRoot, "tests/hermes-og-fullscreen.test.js");
  if (!source.includes('test("btc chart popup button exists in admin console"')) {
    try {
      source = insertBefore(source, "\n// ── Edit safety warning", BTC_CHART_TEST_BLOCK);
    } catch (_error) {
      source = `${source}\n${BTC_CHART_TEST_BLOCK}\n`;
    }
  }
  return source;
}

function createProposedOperationsPlan({ classification, prompt, likelyFiles, activeRepoContext } = {}) {
  if (classification !== "repo_admin_ui_operator_task") {
    return { operations: [], missingRequirements: [], taskType: "non_operator" };
  }

  const files = asList(likelyFiles);
  if (files.length === 0) {
    return {
      operations: [],
      missingRequirements: ["No likely files were identified for this admin UI task."],
      taskType: "no_likely_files"
    };
  }

  const taskType = detectTaskProfile(prompt, files);
  if (taskType === "css_only_admin_ui") {
    return {
      operations: [],
      missingRequirements: ["No concrete proposed operations generated for CSS-only admin UI requests yet."],
      taskType
    };
  }

  if (taskType !== SUPPORTED_TASKS.ADMIN_BTC_CHART_POPUP) {
    return {
      operations: [],
      missingRequirements: ["No concrete proposed operations generated for this admin UI request yet."],
      taskType
    };
  }

  try {
    const repoRoot = getRepoRoot(activeRepoContext);
    const operations = [
      {
        type: "update",
        path: "admin/hermes-chat.html",
        summary: "Add a concrete BTC chart popup button, modal, close control, and canvas to the Hermes admin console.",
        content: buildAdminHermesChatHtml(repoRoot)
      },
      {
        type: "update",
        path: "js/hermes-chat.js",
        summary: "Add concrete BTC chart popup handlers and offline-safe canvas rendering without breaking Hermes send/swarm/pipeline behavior.",
        content: buildHermesChatJs(repoRoot)
      },
      {
        type: "update",
        path: HTML_TO_TEST_MAP["admin/hermes-chat.html"],
        summary: "Add concrete BTC chart popup contract assertions for the Hermes admin UI and JS handlers.",
        content: buildHermesOgFullscreenTest(repoRoot)
      }
    ];

    return { operations, missingRequirements: [], taskType };
  } catch (error) {
    return {
      operations: [],
      missingRequirements: [`Unable to build concrete proposed operations: ${String(error?.message || error)}`],
      taskType
    };
  }
}

/**
 * Generate a bounded list of concrete proposed patch operations for supported
 * admin UI feature requests.
 *
 * @param {object} input
 * @param {string} input.classification - From tool-router operatorIntent.
 * @param {string} input.prompt - The original operator prompt.
 * @param {string[]} input.likelyFiles - Files identified by tool-router.
 * @param {object} [input.activeRepoContext] - Optional active repo metadata.
 * @returns {Array<{type: string, path: string, summary: string, content: string}>}
 */
function generateProposedOperations(input = {}) {
  return createProposedOperationsPlan(input).operations;
}

module.exports = {
  createProposedOperationsPlan,
  generateProposedOperations
};
