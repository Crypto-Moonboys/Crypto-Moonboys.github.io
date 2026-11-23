// Shared artwork for existing pages, generated Wiki pages and live UI.
(function () {
  'use strict';

  if (window.MOONBOYS_SITE_ICONS) return;

  // Each entry names the PNG exactly as uploaded and lists equivalent legacy glyphs.
  const artwork = {
    'about': ["AboutIconone.png", "ℹ"],
    'account-link': ["AccountLinkingProfileChainone.png"],
    'relic': ["AncientCrystalRelicone.png", "🔮"],
    'intelligence': ["Angularcircuitbrainemblemone.png", "🧠"],
    'armor': ["ArmorVestone.png", "🦺"],
    'art': ["Artcreativityone.png", "🎨"],
    'trust': ["Authoritytrustshieldone.png", "🛡"],
    'bitcoin-cash': ["BitcoinCashCoinone.png"],
    'bitcoin': ["Bitcoinone.png", "₿"],
    'block-topia': ["BlockTopiaone.png", "🏙", "🌆", "🧱", "🟦"],
    'furies-emblem': ["BlockchainFuriesone.png"],
    'blockstars-emblem': ["Blockstarsstarcubeemblemone.png"],
    'fist-shield': ["Boldfistshieldone.png", "👊", "✊"],
    'gift': ["Boldgiftboxbonusiconone.png", "🎁"],
    'comments': ["Boldoverlappingspeechbubbleemblemone.png", "💬", "🗨", "🗣"],
    'builder': ["BuilderHubWrenchHammerEmblemone.png", "🛠", "🔧"],
    'snake': ["CoiledSnakeone.png", "🐍"],
    'contributor': ["Contributorone.png", "🙋"],
    'egg': ["Crackedeggincubationone.png", "🥚", "🐣"],
    'crafting': ["CraftingHammerone.png", "⚒", "🔨"],
    'references': ["CrossReferencedPageone.png"],
    'battle': ["CrossedSwordsEmblemone.png", "⚔"],
    'graffiti': ["Crossedgraffitipainttoolsone.png", "🖌", "🖍"],
    'moon': ["Crypto Moonboys crescent icon.png", "☾", "🌙", "🌑", "🌕", "🌖", "🌘"],
    'streak': ["Dailystreakflameone.png", "🔥"],
    'fireball': ["Dynamicfireballstencilone.png", "☄", "💥"],
    'fullscreen': ["Exitfullscreenone.png", "⛶"],
    'games': ["Featuredgamescontrollerone.png", "🎮", "🕹"],
    'featured': ["Featuredstardocumenticonone.png", "🌟"],
    'recharge': ["Flattoppedshieldrechargeone.png"],
    'floor-shield': ["FloorShieldDomeone.png"],
    'graff-network': ["GraffPUNKSspraycannetworkone.png"],
    'spray': ["GraffPUNKSspraycanone.png", "🧴"],
    'marketing': ["Guerillamarketingmegaphone.png", "📢", "📣"],
    'hard-drop': ["Harddropchevronsone.png", "⏬"],
    'graph': ["HexagonalNetworkGraphone.png", "🕸"],
    'loading': ["HourglassLoadingone.png", "⌛", "⏳"],
    'chain': ["Interlockingchainlinksone.png", "🔗", "⛓"],
    'linked-pages': ["Linkedpageschainone.png"],
    'invaders': ["MemeSwarm3008alieninvaderone.png", "👾"],
    'document': ["NewDocumentone.png", "📄", "📝", "🗒", "📜"],
    'lore': ["Openbookquillone.png", "🪶"],
    'sticker': ["PeeledStarStickerone.png", "🏷"],
    'quest': ["QuestActivebullseyearrowone.png", "🎯"],
    'quest-complete': ["QuestCompleteTargetone.png"],
    'help': ["QuestionMarkone.png", "❓", "❔"],
    'right': ["Rightpointingarrowone.png", "➡", "→", "👉", "⇨"],
    'season': ["Seasonalcalendarwheelone.png"],
    'masks': ["Smilingfrowningmasksoneone.png", "🎭"],
    'materials': ["StackedCraftingIngotsone.png", "🪙"],
    'up': ["Stenciluparrowjumpcontrolone.png", "⬆", "↑", "👆"],
    'factions': ["ThreeBannerFactionsone.png", "🚩", "⚑", "🏴"],
    'timeline': ["TimelineClockone.png", "🕰", "🕐", "⏱", "⏰", "◷"],
    'trending': ["TrendingPagesone.png"],
    'trophy': ["Trophyone.png", "🏆"],
    'wax': ["WAXmoneybagone.png", "💰"],
    'weekly': ["Weeklycalendarone.png", "🗓", "📅", "📆"],
    'wiki': ["Wikibookone.png", "📖", "📕", "📗", "📘", "📚"],
    'quest-path': ["Windingquestone.png", "🗺"],
    'xrp': ["XRPcoinone.png"],
    'error': ["Xerrorone.png", "❌", "❎", "✕", "✖", "×"],
    'bell': ["belliconone.png", "🔔"],
    'jobs': ["briefcasejobsone.png", "💼"],
    'idea': ["bulbone.png", "💡"],
    'evolution': ["butterflyevolutionone.png", "🦋"],
    'checklist': ["clipboardchecklistone.png", "📋", "☷"],
    'community': ["communityONE.png", "👥", "👪"],
    'exchange': ["cryptoexchangeone.png", "🔄", "🔁", "⇄"],
    'diamond': ["diamondone.png", "💎", "♦", "◇"],
    'down': ["downarrowone.png", "⬇", "↓", "👇"],
    'forward': ["forwardmomentumarrowone.png", "↗", "⏩"],
    'dashboard': ["fourpaneldashboardstencilone.png", "📊", "▥"],
    'system': ["gearsystemone.png", "⚙"],
    'globe': ["globeiconone.png", "🌍", "🌎", "🌏", "🌐"],
    'rank': ["graffiticrownrankemblemone.png", "👑"],
    'search': ["graffitisearchemblemone.png", "🔍", "🔎", "⌕"],
    'growth': ["growthone.png", "📈"],
    'health': ["heartbeatheartone.png", "💓", "💗", "💖"],
    'heart': ["heartone.png", "❤", "♥"],
    'home': ["homestencilone.png", "🏠", "🏡", "⌂"],
    'kaiju': ["kaijuclawone.png"],
    'frog': ["kekone.png", "🐸"],
    'left': ["leftarrowone.png", "⬅", "←", "👈", "⇦"],
    'energy': ["lightningboltone.png", "⚡"],
    'market': ["marketstallone.png", "🏪"],
    'mute': ["mutespeakerone.png", "🔇"],
    'sign-in': ["opendoorone.png", "🚪"],
    'pause': ["pauseone.png", "⏸", "Ⅱ"],
    'play': ["playtriangleone.png", "▶", "▷", "►"],
    'price': ["pricetagone.png"],
    'rocket': ["rocketone.png", "🚀"],
    'shop': ["shoppingbagone.png", "🛍", "🛒"],
    'audio': ["soundonspeakerone.png", "🔊", "🔉", "🔈", "📻", "♫", "🎵"],
    'sparks': ["sparkswarmone.png", "✨", "✧", "✦", "❇"],
    'categories': ["stackedfolderscategoriesone.png", "📂", "📁", "🗂", "▦"],
    'medal': ["starmedalleaderboardone.png", "🏅", "🎖", "🥇", "🥈", "🥉", "⭐", "★"],
    'success': ["successcheckone.png", "✅", "☑", "✓", "✔"],
    'daily': ["suncalendarone.png", "☀"],
    'inventory': ["tacticalbackpackone.png", "🎒"],
    'menu': ["threebarmenuone.png", "☰", "≡"],
    'thumbs-down': ["thumbsdownone.png", "👎"],
    'thumbs-up': ["thumbsupone.png", "👍"],
    'warning': ["warningtriangleone.png", "⚠"],
  };

  const glyphs = new Map(Object.entries(artwork).flatMap(([key, [, ...symbols]]) =>
    symbols.map(symbol => [symbol, key])
  ));
  const candidates = /[\p{Extended_Pictographic}₿☾⌂⌕◷☷◇▥↗⇄⇨⇦↑↓←→×✕✖✓✧✦⚑▷►Ⅱ★≡▦⛶]/u;
  const legacyToken = /[\p{Extended_Pictographic}₿☾⌂⌕◷☷◇▥↗⇄⇨⇦↑↓←→×✕✖✓✧✦⚑▷►Ⅱ★≡▦⛶][\uFE0E\uFE0F\p{Emoji_Modifier}]*(?:\u200D\p{Extended_Pictographic}[\uFE0E\uFE0F\p{Emoji_Modifier}]*)*/gu;
  const isolatedGlyphs = new Set(Array.from('₿◇♦×Ⅱ↗⇄⇨⇦↑↓←→▷►≡'));
  const skipped = 'script,style,textarea,input,select,code,pre,svg,canvas,noscript,[contenteditable]:not([contenteditable="false"]),[data-site-icon-ignore],.site-icon-glyph';
  const slotSelector = '[data-site-icon],.ali-icon,.cat-icon,.cat-big-icon,.nav-icon,.infobox-image > span,.panel-icon,.price-card-icon,.widget-ph-icon,.activity-icon,#back-to-top,#hamburger';
  const fallbackGlyph = /^(?:[•◆◇◉◈◌◎▣▪?✣⌁⌖]+|NFT|PFP)$/u;

  const routeIcons = {
    '/': 'home', '/index.html': 'home', '/search.html': 'search',
    '/categories/index.html': 'categories', '/articles.html': 'document',
    '/timeline.html': 'timeline', '/graph.html': 'graph',
    '/dashboard.html': 'dashboard', '/about.html': 'about',
    '/community.html': 'battle', '/games/': 'games', '/swarmsy.html': 'sparks',
    '/my-moonboy.html': 'moon', '/wiki/crypto-moonboys.html': 'moon',
    '/battle-chamber/factions/': 'factions', '/battle-chamber/factions/index.html': 'factions',
    '/games/block-topia/': 'block-topia', '/how-to-play.html': 'help',
    '/wiki/graffpunks-network.html': 'graff-network', '/wiki/graffpunks.html': 'spray',
  };
  const categoryIcons = {
    'cryptocurrencies': 'bitcoin', 'concepts': 'idea', 'technology': 'system',
    'tools-platforms': 'builder', 'lore': 'lore', 'crypto-designer-toys': 'art',
    'guerilla-marketing': 'marketing', 'graffiti-street-art': 'graffiti',
    'nfts-digital-art': 'art', 'punk-culture': 'fist-shield', 'gaming': 'games',
    'community-people': 'community', 'media-publishing': 'document',
    'art-creativity': 'art', 'activism-counter-culture': 'fist-shield',
  };
  // These slots have labels beside the symbol. Use the artwork for their
  // purpose when the same old symbol represented several different things.
  const panelIcons = {
    'telegram-auth': 'account-link', 'incubation': 'egg', 'season': 'season',
    'season-slots': 'season', 'leaderboard': 'medal', 'weekly-journey': 'weekly',
    'daily-journey': 'daily', 'daily-objectives': 'daily', 'daily-completion': 'gift',
    'weekly-bounties': 'weekly', 'bonus-bounties': 'quest', 'bounties': 'quest',
    'missions': 'quest', 'contracts': 'quest-path', 'districts': 'quest-path',
    'adventure': 'quest-path', 'expedition': 'quest-path', 'inventory': 'inventory',
    'jobs': 'jobs', 'equipment': 'armor', 'equipment-sets': 'armor',
    'materials': 'materials', 'relics': 'relic', 'crafting': 'crafting',
    'vitals': 'health', 'care': 'heart', 'evolution': 'evolution', 'kaiju': 'kaiju',
    'faction': 'factions', 'pet-house': 'home', 'market': 'market', 'shop': 'shop',
    'food-shop': 'shop', 'furniture-shop': 'shop', 'alerts': 'bell', 'features': 'dashboard',
    'how-to-play': 'help', 'memories': 'timeline', 'callsign': 'document',
    'trade': 'exchange', 'tracks': 'growth', 'radio-requests': 'audio',
    'season-finale': 'trophy', 'finale-link': 'trophy', 'module-loading': 'loading',
  };

  function src(key) {
    if (!Object.hasOwn(artwork, key)) return '';
    const directory = key === 'moon' || key === 'sign-in' ? '/art/icons/web/' : '/art/icons/';
    return directory + encodeURIComponent(artwork[key][0]);
  }

  function appendGlyph(container, key, original) {
    const wrapper = document.createElement('span');
    wrapper.className = 'site-icon-glyph';
    const image = document.createElement('img');
    image.alt = '';
    image.width = image.height = 24;
    image.decoding = 'async';
    image.loading = 'lazy';
    image.src = src(key);
    wrapper.append(image);
    if (original) {
      // Keep the original text for accessible names, selection and code that
      // reads textContent (including deep links and authored NFT titles).
      const label = document.createElement('span');
      label.className = 'site-icon-original';
      label.textContent = original;
      wrapper.append(label);
    }
    container.append(wrapper);
  }

  function iconForSlot(slot, symbol) {
    if (slot.matches('#back-to-top')) return 'up';
    if (slot.matches('#hamburger')) return 'menu';
    if (slot.matches('.panel-icon')) {
      const panel = slot.closest('[data-panel]')?.dataset.panel;
      if (panel && Object.hasOwn(panelIcons, panel)) return panelIcons[panel];
    }
    const route = slot.closest('a[href]')?.getAttribute('href')?.split(/[?#]/, 1)[0];
    if (slot.matches('.nav-icon') && route && Object.hasOwn(routeIcons, route)) return routeIcons[route];
    if (slot.matches('.price-card-icon')) {
      const currency = slot.closest('[data-asset-id]')?.dataset.assetId;
      if (currency === 'bitcoin-cash') return 'bitcoin-cash';
      if (currency === 'ripple') return 'xrp';
    }
    if (slot.matches('.widget-ph-icon,.activity-icon') && slot.closest('#activity-panel') && symbol === '🔥') return 'trending';
    if (slot.matches('.ali-icon,.cat-icon,.cat-big-icon') && fallbackGlyph.test(symbol)) {
      const category = (route || location.pathname).match(/(?:^|\/)categories\/([^/]+)\.html$/)?.[1];
      return (category && categoryIcons[category]) || (symbol === 'NFT' || symbol === 'PFP' ? 'art' :
        slot.matches('.ali-icon') ? 'document' : 'categories');
    }
    return glyphs.get(symbol);
  }

  const wikiEmblems = {
    '/wiki/the-blockchain-furies.html': 'furies-emblem',
    '/wiki/the-blockstars.html': 'blockstars-emblem',
  };

  const labelledIcons = [
    [/^most cross-referenced$/i, 'references'],
    [/^(linked pages|pages linked)$/i, 'linked-pages'],
    [/^featured (pages|articles)$/i, 'featured'],
    [/^quest complete$/i, 'quest-complete'],
    [/^floor shield(?: absorbed!?)?$/i, 'floor-shield'],
    [/^shield recharge$/i, 'recharge'],
    [/^(price|market price|price history)$/i, 'price'],
  ];

  const headingSelector = 'h1,h2,h3,h4,h5,h6,[role="heading"],.section-heading,.logo-text,.gk-collection-about-kicker,.nft-template-about-kicker';

  function styleHeadingText(text) {
    const parent = text.parentElement;
    if (!text.data.trim() || !parent || parent.closest('moonboys-heading-ink,[aria-hidden="true"]')) return;
    const heading = parent.closest(headingSelector);
    if (!heading?.closest('#content,main,#site-header')) return;

    // Use an inline element distinct from the spans that style title accents.
    const ink = document.createElement('moonboys-heading-ink');
    text.replaceWith(ink);
    ink.append(text);
  }

  function renderText(text) {
    const parent = text.parentElement;
    if (!parent || parent.closest(skipped)) return;
    const value = text.data;
    const symbol = value.trim().replace(/[\uFE0E\uFE0F]/gu, '');
    if (symbol && parent.matches(slotSelector) && !parent.hasAttribute('data-site-icon') &&
        (value === parent.textContent || parent.matches('#back-to-top,#hamburger'))) {
      const key = iconForSlot(parent, symbol);
      if (key) {
        const fragment = document.createDocumentFragment();
        appendGlyph(fragment, key, value);
        text.replaceWith(fragment);
        return;
      }
    }
    if (!candidates.test(value)) {
      styleHeadingText(text);
      return;
    }
    let fragment;
    let offset = 0;
    for (const token of value.matchAll(legacyToken)) {
      const symbol = token[0].replace(/[\uFE0E\uFE0F]/gu, '');
      const leading = !value.slice(0, token.index).trim();
      const trailingLabel = leading ? value.slice(token.index + token[0].length).trim() : '';
      const emblem = leading && parent.matches('h1.page-title') && wikiEmblems[location.pathname];
      const key = emblem || (trailingLabel && labelledIcons.find(([label]) => label.test(trailingLabel))?.[1]) || glyphs.get(symbol);
      if (!key || (isolatedGlyphs.has(symbol) && value.trim() !== token[0])) continue;
      fragment ||= document.createDocumentFragment();
      fragment.append(value.slice(offset, token.index));
      appendGlyph(fragment, key, token[0]);
      offset = token.index + token[0].length;
    }
    if (fragment) {
      fragment.append(value.slice(offset));
      const runs = Array.from(fragment.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
      text.replaceWith(fragment);
      runs.forEach(styleHeadingText);
    } else {
      styleHeadingText(text);
    }
  }

  function renderSlot(slot) {
    const key = slot.dataset.siteIcon;
    if (!src(key) || slot.firstElementChild?.matches('.site-icon-glyph') || slot.closest(skipped)) return;
    if (!slot.childNodes.length) appendGlyph(slot, key);
  }

  function upgrade(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      renderText(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(skipped)) return;
    if (root.hasAttribute('data-site-icon')) renderSlot(root);
    root.querySelectorAll('[data-site-icon]').forEach(renderSlot);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          return node.matches(skipped) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    // Collect first because editing the DOM would invalidate the walker's position.
    const text = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) text.push(node);
    text.forEach(renderText);
  }

  const canvasImages = new Map();
  function drawLabel(ctx, label, x, y, size) {
    // Canvas graph labels use center/middle alignment and a leading glyph.
    const first = label.match(/^(\S+)\s+(.+)$/u);
    const key = first && glyphs.get(first[1].replace(/[\uFE0E\uFE0F]/gu, ''));
    if (!key) {
      ctx.fillText(label, x, y);
      return;
    }
    if (!canvasImages.has(key)) {
      const image = new Image();
      image.src = src(key);
      canvasImages.set(key, image);
    }
    const image = canvasImages.get(key);
    if (image.naturalWidth === 0) {
      ctx.fillText(first[2], x, y);
      return;
    }
    const gap = 3;
    const text = first[2];
    ctx.drawImage(image, x - (ctx.measureText(text).width + size + gap) / 2, y - size / 2, size, size);
    ctx.fillText(text, x + (size + gap) / 2, y);
  }

  window.MOONBOYS_SITE_ICONS = Object.freeze({ src, drawLabel });

  function boot() {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/css/site-icons.css?v=2';
    document.head.append(stylesheet);
    upgrade(document.body);
    const observer = new MutationObserver(records => {
      const roots = new Set();
      for (const record of records) {
        if (record.type === 'characterData') roots.add(record.target);
        else for (const node of record.addedNodes) roots.add(node);
      }
      for (const root of roots) {
        if (!root.isConnected) continue;
        let parent = root.parentNode;
        while (parent && !roots.has(parent)) parent = parent.parentNode;
        if (!parent) upgrade(root);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
