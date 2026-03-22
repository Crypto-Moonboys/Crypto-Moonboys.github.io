/**
 * Crypto Moonboys Wiki — Main JavaScript
 * Client-side search, sidebar toggle, UI helpers.
 */

/* ── SEARCH INDEX ──────────────────────────────────────────────────────────
   Articles are registered here so the search box can find them.
   When the AI agent adds a new article, it should also add an entry below.
   ─────────────────────────────────────────────────────────────────────── */
const WIKI_INDEX = [
  {
    title: "Bitcoin (BTC)",
    url: "wiki/bitcoin.html",
    desc: "The original cryptocurrency and largest by market cap. A peer-to-peer electronic cash system created by Satoshi Nakamoto.",
    category: "Cryptocurrencies",
    emoji: "₿",
    tags: ["bitcoin", "btc", "satoshi", "crypto", "blockchain", "digital gold"]
  },
  {
    title: "Ethereum (ETH)",
    url: "wiki/ethereum.html",
    desc: "A decentralised platform enabling smart contracts and decentralised applications (dApps).",
    category: "Cryptocurrencies",
    emoji: "Ξ",
    tags: ["ethereum", "eth", "smart contracts", "dapps", "defi", "vitalik"]
  },
  {
    title: "DeFi (Decentralised Finance)",
    url: "wiki/defi.html",
    desc: "An ecosystem of financial applications built on blockchain networks, removing traditional intermediaries.",
    category: "Concepts",
    emoji: "🏦",
    tags: ["defi", "decentralised finance", "yield farming", "liquidity", "amm"]
  },
  {
    title: "NFTs (Non-Fungible Tokens)",
    url: "wiki/nfts.html",
    desc: "Unique digital assets verified using blockchain technology representing ownership of digital or physical items.",
    category: "Concepts",
    emoji: "🎨",
    tags: ["nft", "non-fungible token", "digital art", "opensea", "collectibles"]
  },
  {
    title: "Altcoins",
    url: "wiki/altcoins.html",
    desc: "All cryptocurrencies other than Bitcoin. Includes Ethereum, Solana, Cardano and thousands more.",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["altcoins", "alts", "sol", "ada", "bnb", "shitcoin", "moonshot"]
  },
  {
    title: "Blockchain Technology",
    url: "wiki/blockchain.html",
    desc: "A distributed ledger technology that records transactions across many computers in an immutable, transparent way.",
    category: "Technology",
    emoji: "⛓️",
    tags: ["blockchain", "distributed ledger", "consensus", "nodes", "decentralised"]
  },
  {
    title: "Crypto Wallets",
    url: "wiki/wallets.html",
    desc: "Software or hardware that stores private and public keys, allowing users to send and receive crypto.",
    category: "Tools",
    emoji: "👛",
    tags: ["wallet", "metamask", "ledger", "cold storage", "seed phrase", "private key"]
  },
  {
    title: "Crypto Exchanges",
    url: "wiki/exchanges.html",
    desc: "Platforms where users can buy, sell and trade cryptocurrencies. Includes CEX and DEX varieties.",
    category: "Tools",
    emoji: "🔄",
    tags: ["exchange", "cex", "dex", "binance", "coinbase", "uniswap", "trading"]
  },
  {
    title: "Tokenomics",
    url: "wiki/tokenomics.html",
    desc: "The economics of a crypto token, including supply, distribution, utility, and incentive mechanisms.",
    category: "Concepts",
    emoji: "📊",
    tags: ["tokenomics", "supply", "circulating", "inflation", "vesting", "burn"]
  },
  {
    title: "Web3",
    url: "wiki/web3.html",
    desc: "The next generation of the internet built on blockchain technology, enabling decentralised ownership and identity.",
    category: "Technology",
    emoji: "🌐",
    tags: ["web3", "decentralised internet", "dao", "metaverse", "ownership"]
  },
  {
    title: "Solana (SOL)",
    url: "wiki/solana.html",
    desc: "A high-performance blockchain supporting fast, cheap transactions and popular with DeFi and NFT projects.",
    category: "Cryptocurrencies",
    emoji: "◎",
    tags: ["solana", "sol", "fast blockchain", "proof of history", "nft"]
  },
  {
    title: "Meme Coins",
    url: "wiki/memecoins.html",
    desc: "Cryptocurrency tokens inspired by internet memes or jokes. Includes Dogecoin, Shiba Inu, and many others.",
    category: "Cryptocurrencies",
    emoji: "🐶",
    tags: ["meme", "doge", "shib", "pepe", "memecoin", "community token", "moonboy"]
  },
  {
    title: "HODL Wars Lore$",
    url: "wiki/hodl-wars.html",
    desc: "The central mythological lore of the Crypto Moonboys — an epic saga of Diamond Hands warriors, Paper Hands betrayals, and Moon Missions.",
    category: "Lore",
    emoji: "⚔️",
    tags: ["hodl wars", "lore", "diamond hands", "paper hands", "moon mission", "wagmi", "ngmi", "crypto mythology"]
  },
  {
    title: "The HODL Warriors",
    url: "wiki/hodl-warriors.html",
    desc: "The elite fighters of the HODL Wars universe who never sell and march toward the Moon Mission.",
    category: "Lore",
    emoji: "⚔️",
    tags: ["hodl warriors", "diamond hands", "never sell", "lore", "faction"]
  },
  {
    title: "Diamond Hands",
    url: "wiki/diamond-hands.html",
    desc: "The sacred trait of holding crypto through all volatility. The mark of a true HODL Warrior.",
    category: "Lore",
    emoji: "💎",
    tags: ["diamond hands", "hold", "hodl", "never sell", "stonks", "wsb"]
  },
  {
    title: "Paper Hands",
    url: "wiki/paper-hands.html",
    desc: "The weakness of selling too early under pressure. The opposite of Diamond Hands.",
    category: "Lore",
    emoji: "🧻",
    tags: ["paper hands", "sell", "capitulate", "weak hands", "fud"]
  },
  {
    title: "The Great Dip",
    url: "wiki/the-great-dip.html",
    desc: "The recurring cataclysm of the HODL Wars — sudden market crashes that test the mettle of every warrior.",
    category: "Lore",
    emoji: "📉",
    tags: ["dip", "crash", "buy the dip", "bear market", "correction"]
  },
  {
    title: "Moon Mission",
    url: "wiki/moon-mission.html",
    desc: "The ultimate quest of HODL Warriors — the prophesied journey to infinite gains. When Lambo?",
    category: "Lore",
    emoji: "🚀",
    tags: ["moon", "lambo", "to the moon", "moon mission", "wagmi", "gains"]
  },
  {
    title: "Rug Pull Wars",
    url: "wiki/rug-pull-wars.html",
    desc: "The treacherous chapter where dev teams abandon projects and flee with investor funds.",
    category: "Lore",
    emoji: "🪤",
    tags: ["rug pull", "scam", "exit scam", "defi", "dev abandoned"]
  },
  {
    title: "The Satoshi Scroll",
    url: "wiki/satoshi-scroll.html",
    desc: "The mythologised sacred text of the HODL Wars — the Bitcoin Whitepaper elevated to legend.",
    category: "Lore",
    emoji: "📜",
    tags: ["satoshi", "bitcoin whitepaper", "sacred text", "decentralisation", "lore"]
  },
  {
    title: "The Bear Market Siege",
    url: "wiki/bear-market-siege.html",
    desc: "The prolonged dark chapter of extended market downtrends where Diamond Hands warriors are tested.",
    category: "Lore",
    emoji: "🐻",
    tags: ["bear market", "siege", "winter", "downturn", "crypto winter"]
  },
  {
    title: "The Whale Lords",
    url: "wiki/whale-lords.html",
    desc: "The powerful market-moving entities holding thousands of BTC/ETH who shape the HODL Wars.",
    category: "Lore",
    emoji: "🐳",
    tags: ["whale", "market manipulation", "big holders", "institutional", "accumulation"]
  },
  {
    title: "The FOMO Plague",
    url: "wiki/fomo-plague.html",
    desc: "The epidemic of Fear Of Missing Out that spreads through social media and turns holders into sellers.",
    category: "Lore",
    emoji: "😱",
    tags: ["fomo", "fear of missing out", "social media", "influencer", "shilling"]
  },
  {
    title: "NGMI Chronicles",
    url: "wiki/ngmi-chronicles.html",
    desc: "The cautionary records of those who fell in the HODL Wars. Not Gonna Make It.",
    category: "Lore",
    emoji: "💀",
    tags: ["ngmi", "not gonna make it", "sold the bottom", "rug", "loss"]
  },
  {
    title: "The WAGMI Prophecy",
    url: "wiki/wagmi-prophecy.html",
    desc: "The ultimate declaration of optimism — We're All Gonna Make It. The guiding star of the HODL Wars.",
    category: "Lore",
    emoji: "🌙",
    tags: ["wagmi", "we are all gonna make it", "optimism", "moon", "prophecy"]
  }
];

/* ── CATEGORY INDEX ────────────────────────────────────────────────────────
   All wiki categories are registered here.
   When a new category page is added, also add its name to this list so the
   category count on the home page updates automatically.
   ─────────────────────────────────────────────────────────────────────── */
const CATEGORY_LIST = [
  "Cryptocurrencies",
  "Concepts",
  "Technology",
  "Tools & Platforms",
  "Lore",
  "Crypto Designer Toys",
  "Guerilla Marketing",
  "Graffiti & Street Art",
  "NFTs & Digital Art",
  "Punk Culture",
  "Gaming",
  "Community & People",
  "Media & Publishing",
  "Art & Creativity",
  "Activism & Counter-Culture"
];

/* ── DOM READY ──────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initSearch();
  initStatArticles();
  initStatCategories();
  initBackToTop();
  initActiveNav();
  initTOC();
});

/* ── SIDEBAR TOGGLE ─────────────────────────────────────────────────────── */
function initSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  if (!hamburger || !sidebar) return;

  hamburger.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', open);
  });

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  }

  // Close on ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ── SEARCH ─────────────────────────────────────────────────────────────── */
function initSearch() {
  // Header search
  const input   = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (input && results) {
    input.addEventListener('input',  () => runSearch(input.value, results, input));
    input.addEventListener('focus',  () => { if (input.value) runSearch(input.value, results, input); });
    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !results.contains(e.target)) {
        results.classList.remove('open');
      }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = input.value.trim();
        if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
      }
    });
    // Header search button
    const btn = document.getElementById('search-btn');
    if (btn) btn.addEventListener('click', () => {
      const q = input.value.trim();
      if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
    });
  }

  // Home page search
  const homeInput = document.getElementById('home-search-input');
  const homeBtn   = document.getElementById('home-search-btn');
  if (homeInput) {
    homeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = homeInput.value.trim();
        if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
      }
    });
  }
  if (homeBtn && homeInput) {
    homeBtn.addEventListener('click', () => {
      const q = homeInput.value.trim();
      if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
    });
  }

  // Search page
  const searchPage = document.getElementById('search-page-input');
  if (searchPage) {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q') || '';
    searchPage.value = q;
    if (q) renderSearchPage(q);
    searchPage.addEventListener('input', () => renderSearchPage(searchPage.value));
    searchPage.addEventListener('keydown', e => {
      if (e.key === 'Enter') renderSearchPage(searchPage.value);
    });
  }
}

function scoreResult(item, query) {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  let score = 0;
  const title = item.title.toLowerCase();
  const desc  = (item.desc  || '').toLowerCase();
  const tags  = (item.tags  || []).join(' ').toLowerCase();
  const cat   = (item.category || '').toLowerCase();
  if (title === q)                    score += 100;
  if (title.startsWith(q))            score +=  60;
  if (title.includes(q))              score +=  40;
  if (tags.includes(q))               score +=  30;
  if (desc.includes(q))               score +=  15;
  if (cat.includes(q))                score +=  10;
  q.split(' ').forEach(word => {
    if (word.length > 2) {
      if (title.includes(word)) score += 8;
      if (tags.includes(word))  score += 5;
      if (desc.includes(word))  score += 3;
    }
  });
  return score;
}

function runSearch(query, resultsEl, inputEl) {
  const q = query.trim();
  if (!q) { resultsEl.classList.remove('open'); return; }

  const scored = WIKI_INDEX
    .map(item => ({ item, score: scoreResult(item, q) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  resultsEl.innerHTML = '';
  if (scored.length === 0) {
    resultsEl.innerHTML = `<div class="sr-no-results">No results for "<strong>${escHtml(q)}</strong>"</div>`;
  } else {
    scored.forEach(({ item }) => {
      const div = document.createElement('div');
      div.className = 'sr-item';
      div.innerHTML = `
        <div style="font-size:1.4rem;flex-shrink:0;width:28px;text-align:center">${item.emoji || '📄'}</div>
        <div>
          <div class="sr-title">${highlight(item.title, q)}</div>
          <div class="sr-desc">${escHtml(item.desc.slice(0, 90))}…</div>
          <div class="sr-cat">${item.category}</div>
        </div>`;
      div.addEventListener('click', () => { window.location.href = item.url; });
      resultsEl.appendChild(div);
    });
  }
  resultsEl.classList.add('open');
}

function renderSearchPage(query) {
  const container = document.getElementById('search-results-page');
  const heading   = document.getElementById('search-heading');
  if (!container) return;

  const q = query.trim();
  if (heading) heading.textContent = q ? `Results for "${q}"` : 'All Articles';

  const items = q
    ? WIKI_INDEX
        .map(item => ({ item, score: scoreResult(item, q) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
    : WIKI_INDEX.map(item => ({ item, score: 0 }));

  if (items.length === 0) {
    container.innerHTML = `<p style="color:var(--color-text-muted)">No articles found for "<strong>${escHtml(q)}</strong>". Try different keywords.</p>`;
    return;
  }

  container.innerHTML = items.map(({ item }) => `
    <a href="${item.url}" class="article-list-item">
      <div class="ali-icon">${item.emoji || '📄'}</div>
      <div>
        <div class="ali-title">${highlight(item.title, q)}</div>
        <div class="ali-desc">${escHtml(item.desc)}</div>
        <div class="ali-meta">${item.category}</div>
      </div>
    </a>`).join('');
}

function highlight(text, query) {
  if (!query) return escHtml(text);
  const safeQ = escRegex(query);
  return escHtml(text).replace(new RegExp(`(${safeQ})`, 'gi'), '<mark style="background:rgba(247,201,72,.3);color:inherit;border-radius:2px">$1</mark>');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ── BACK TO TOP ────────────────────────────────────────────────────────── */
function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ── ACTIVE NAV ─────────────────────────────────────────────────────────── */
function initActiveNav() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  document.querySelectorAll('.sidebar-nav a, .header-nav a').forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    // Resolve relative href against current page
    const abs = new URL(href, window.location.href).pathname.replace(/\/+$/, '') || '/';
    if (abs === path) link.classList.add('active');
  });
}

/* ── AUTO TABLE OF CONTENTS ─────────────────────────────────────────────── */
function initTOC() {
  const toc     = document.getElementById('toc');
  const content = document.querySelector('.wiki-content');
  if (!toc || !content) return;

  const headings = Array.from(content.querySelectorAll('h2, h3'));
  if (headings.length < 3) { toc.style.display = 'none'; return; }

  let ol = document.createElement('ol');
  let subOl = null;
  let lastH2Li = null;
  let counter = 0;

  headings.forEach(h => {
    // Ensure each heading has an ID for anchor links
    if (!h.id) {
      h.id = 'section-' + (++counter) + '-' + h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.href        = '#' + h.id;
    a.textContent = h.textContent;
    li.appendChild(a);

    if (h.tagName === 'H2') {
      subOl    = null;
      lastH2Li = li;
      ol.appendChild(li);
    } else {
      // H3 — nest under last H2
      if (!subOl) {
        subOl = document.createElement('ol');
        if (lastH2Li) lastH2Li.appendChild(subOl);
        else ol.appendChild(subOl);
      }
      subOl.appendChild(li);
    }
  });

  toc.querySelector('.toc-title') || (() => {
    const t = document.createElement('div');
    t.className = 'toc-title';
    t.textContent = '📋 Contents';
    toc.prepend(t);
  })();
  toc.appendChild(ol);
}

/* ── AUTO-SYNC ARTICLE COUNT STAT ────────────────────────────────────────── */
function initStatArticles() {
  const el = document.getElementById('stat-articles');
  if (el) el.textContent = WIKI_INDEX.length;
}

/* ── AUTO-SYNC CATEGORY COUNT STAT ──────────────────────────────────────── */
function initStatCategories() {
  const el = document.getElementById('stat-categories');
  if (el) el.textContent = CATEGORY_LIST.length;
}
