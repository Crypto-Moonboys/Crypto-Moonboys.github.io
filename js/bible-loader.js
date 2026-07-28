/**
 * Bible Loader — dynamically loads specialist bible JSON for entities with 5+ mentions
 * Called from wiki article pages that have a data-entity-slug attribute
 */

(function() {
  const BIBLES_PATH = '/wiki/bibles/';
  const SWARMSY_REPO = 'https://github.com/Crypto-Moonboys/SWARMSY-Ai';

  function loadBible(slug) {
    const container = document.getElementById('bible-content');
    if (!container) return;

    fetch(BIBLES_PATH + slug + '.json')
      .then(r => {
        if (!r.ok) return null;
        return r.json();
      })
      .then(bible => {
        if (!bible) return;
        renderBible(bible, container);
      })
      .catch(() => {});
  }

  function renderBible(bible, container) {
    let html = '';

    if (bible.timeline && bible.timeline.length > 0) {
      html += '<div class="bible-section bible-timeline">';
      html += '<h3>📅 Timeline</h3><ul>';
      bible.timeline.forEach(entry => {
        const date = entry.date || '';
        const text = entry.text || entry.value || JSON.stringify(entry);
        html += `<li><span class="timeline-date">${date}</span> ${text}</li>`;
      });
      html += '</ul></div>';
    }

    if (bible.relationships && bible.relationships.length > 0) {
      html += '<div class="bible-section bible-relationships">';
      html += '<h3>🔗 Relationships</h3><ul>';
      bible.relationships.forEach(rel => {
        const relText = typeof rel === 'string' ? rel : JSON.stringify(rel);
        html += `<li>${relText}</li>`;
      });
      html += '</ul></div>';
    }

    if (bible.cross_links && bible.cross_links.length > 0) {
      html += '<div class="bible-section bible-crosslinks">';
      html += '<h3>🌐 Connected Entities</h3><ul>';
      bible.cross_links.forEach(link => {
        const slug = link.entity.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        html += `<li><a href="/wiki/${slug}.html">${link.entity}</a> <span class="crosslink-count">(${link.shared_count} shared facts)</span></li>`;
      });
      html += '</ul></div>';
    }

    if (html) {
      container.innerHTML = html;
      container.style.display = 'block';
    }
  }

  function updateCryptoMoonboysSwarmsySection() {
    const article = document.querySelector('[data-entity-slug="crypto-moonboys"]');
    if (!article || document.getElementById('swarmsy-current')) return;

    const swarmsyPath = article.querySelector('#path-swarmsy');
    if (!swarmsyPath) return;

    const helpItems = swarmsyPath.querySelectorAll('.cm-steps li');
    if (helpItems[3]) {
      helpItems[3].textContent = 'Approved SPARKY Truths and Proof Review: keep rough ideas separate from confirmed decisions, preserve user-scoped project truth and separate claims from evidence.';
    }

    const pathActions = swarmsyPath.querySelector('.cm-actions');
    if (pathActions && !pathActions.querySelector('[data-swarmsy-repo-link]')) {
      const repoLink = document.createElement('a');
      repoLink.className = 'cm-button cm-button--secondary';
      repoLink.href = SWARMSY_REPO;
      repoLink.target = '_blank';
      repoLink.rel = 'noopener noreferrer';
      repoLink.dataset.swarmsyRepoLink = 'true';
      repoLink.textContent = 'Open SWARMSY-Ai source';
      pathActions.appendChild(repoLink);
    }

    const section = document.createElement('section');
    section.className = 'cm-section';
    section.id = 'swarmsy-current';
    section.innerHTML = `
      <p class="cm-kicker">Current SWARMSY-Ai implementation</p>
      <h2>WHAT IS IMPLEMENTED NOW</h2>
      <p>SWARMSY is a customised AnythingLLM fork. AnythingLLM supplies the workspace, document, retrieval, model-provider, agent and API foundation. SPARKY remains the permanent visible operator for the guided creator journey.</p>
      <div class="cm-role-grid">
        <div class="cm-role-card"><strong>Fixed protected SPARKY workspace</strong><p>The canonical SPARKY workspace is created automatically when missing, appears as a fixed “Continue with SPARKY” entry and is protected from normal rename, update and deletion routes.</p></div>
        <div class="cm-role-card"><strong>Starter journey</strong><p>New users receive three starter routes: shape a project idea, build a project identity, or turn an idea into an action plan.</p></div>
        <div class="cm-role-card"><strong>Approved SPARKY Truths</strong><p>Confirmed facts and decisions are stored separately from rough ideas, scoped by workspace and user, injected into later prompts and available for archiving.</p></div>
        <div class="cm-role-card"><strong>Normal thread controls</strong><p>The fixed SPARKY entry keeps normal AnythingLLM thread history and New Thread controls.</p></div>
      </div>
      <h3>Eight current core packs</h3>
      <p>OG SPARKY Contract, Project Manager Protocol, Identity Questionnaire, Do It For Me Prompts, Approved Decisions, Action Confirmation, Tasks and Schedule, and Proof Review.</p>
      <h3>Creative controls</h3>
      <p>SAFE and WTF act as creative-intensity modes. MESSAGE, DOODAD and PLACEMENT help define what people remember, the recognisable device and the context that makes the idea land.</p>
      <p class="cm-highlight">The repository proves the implemented source and workflows. It does not by itself prove that hosted releases, finished installers, automatic pack ingestion or external actions are live.</p>
      <div class="cm-actions"><a class="cm-button" href="${SWARMSY_REPO}" target="_blank" rel="noopener noreferrer">View current SWARMSY-Ai repository</a><a class="cm-button cm-button--secondary" href="/swarmsy.html">Open SWARMSY page</a></div>
    `;

    const ownershipSection = article.querySelector('#ownership-and-canon');
    if (ownershipSection) ownershipSection.before(section);
    else swarmsyPath.parentElement.after(section);

    const roleCards = article.querySelectorAll('#how-the-parts-fit .cm-role-card');
    roleCards.forEach(card => {
      const strong = card.querySelector('strong');
      if (!strong) return;
      if (strong.textContent.includes('Wiki Packs / Memory Locks / Proof Review')) {
        strong.textContent = 'Core Packs / Approved SPARKY Truths / Proof Review';
        const description = card.querySelector('p');
        if (description) description.textContent = 'Local SPARKY protocols, user-scoped approved continuity and claim discipline that help creators avoid drift and fake authority.';
      }
    });
  }

  function appendBlockTopiaRelatedPaths() {
    const article = document.querySelector('article[data-entity-slug="block-topia"]');
    if (!article || document.querySelector('[data-related-wiki-paths="true"]')) return;

    const section = document.createElement('section');
    section.className = 'wiki-section related-wiki-paths';
    section.setAttribute('data-related-wiki-paths', 'true');
    section.setAttribute('data-related-wiki-paths-runtime', 'block-topia');
    section.innerHTML = `
      <h2>Related Wiki Paths</h2>
      <p class="lore-paragraph">Continue through the connected factions, lore, live game and wider Crypto Moonboys architecture.</p>
      <div class="wiki-rabbit-group" data-related-group="Block Topia Connections">
        <h3>Block Topia Connections</h3>
        <div class="wiki-rabbit-grid" role="list">
          <a class="wiki-rabbit-card" href="/wiki/crypto-moonboys.html" role="listitem"><span class="wiki-rabbit-card-title">Crypto Moonboys</span><span class="wiki-rabbit-card-desc">The creator umbrella and full system architecture.</span></a>
          <a class="wiki-rabbit-card" href="/wiki/graffpunks.html" role="listitem"><span class="wiki-rabbit-card-title">GraffPUNKS</span><span class="wiki-rabbit-card-desc">The resistance culture fighting the Authority through memory and public marks.</span></a>
          <a class="wiki-rabbit-card" href="/wiki/hodl-wars.html" role="listitem"><span class="wiki-rabbit-card-title">HODL WARS</span><span class="wiki-rabbit-card-desc">The wider faction conflict surrounding the city and the Grid.</span></a>
          <a class="wiki-rabbit-card" href="/games/block-topia/" role="listitem"><span class="wiki-rabbit-card-title">Play Block Topia</span><span class="wiki-rabbit-card-desc">The current playable runtime, kept separate from lore claims.</span></a>
          <a class="wiki-rabbit-card" href="/battle-chamber/factions/" role="listitem"><span class="wiki-rabbit-card-title">Faction Directory</span><span class="wiki-rabbit-card-desc">Current faction routes and Battle Chamber activity.</span></a>
          <a class="wiki-rabbit-card" href="/categories/lore.html" role="listitem"><span class="wiki-rabbit-card-title">Lore</span><span class="wiki-rabbit-card-desc">Explore the wider Year 3008 mythology and connected worlds.</span></a>
        </div>
      </div>`;
    article.appendChild(section);
  }

  function appendWaxpProjectWorlds() {
    const article = document.querySelector('article[data-entity-slug="waxp"]');
    if (!article || document.getElementById('waxp-gk-worlds')) return;

    const section = document.createElement('section');
    section.className = 'wiki-section';
    section.id = 'waxp-gk-worlds';
    section.innerHTML = `
      <h2>Graffiti Kings and Crypto Moonboys on WAX</h2>
      <p>WAX became the main on-chain home for a large connected family of Graffiti Kings, GKniftyHEADS, GraffPUNKS, Crypto Moonboys and No Ball Games assets. These projects do not all perform the same job. Some collections preserve artist history, some establish character identities, some support factions and story worlds, some act as game or progression items, and others provide experimental token, staking, burn or community systems.</p>
      <p>WAXP is the common settlement asset beneath those separate worlds. It is used when collectors buy and sell NFTs, when creators fund drops and contract activity, when accounts need resources, when marketplaces settle trades and when project treasuries manage WAX-native operations. Project tokens such as <a href="/wiki/nbg.html">$NBG</a> or <a href="/wiki/punk-token.html">$PUNK</a> can add specialised utility, but they operate inside an ecosystem whose accounts, NFT standards, resources and marketplace activity ultimately depend on WAX.</p>
      <h3>Graffiti Kings: the physical-culture foundation</h3>
      <p><a href="/wiki/darren-cullen.html">Graffiti Kings</a> supplies the real-world cultural root: decades of graffiti, crews, public walls, music, street reputation and collaborative production. On WAX, that history could be recorded as verifiable digital editions rather than disappearing into social-media posts or untraceable image files. The chain provides a permanent public record of collection names, asset IDs, templates, ownership transfers and marketplace history.</p>
      <p>This does not make the blockchain the source of the culture. The culture existed first. WAX acts as the ownership and distribution rail that allows the physical Graffiti Kings world to continue through digital collectibles, character archives, creator collaborations and connected community economies.</p>
      <h3>GKniftyHEADS: the main character and faction architecture</h3>
      <p><a href="/wiki/gkniftyheads.html">GKniftyHEADS</a> is the primary WAX character system linking Graffiti Kings identities, Moonboys, Moongirls, artists, collectors and fictional factions. Its NFTs are organised through the WAX collection, schema and template model, allowing one-of-one characters, editions, faction pieces and related artefacts to remain individually traceable.</p>
      <p>For GKniftyHEADS collectors, WAXP is the marketplace currency most directly associated with acquiring and trading these assets. For the project, WAX infrastructure supports minting, transfers, burns, blends, template indexing and ownership history. The value of a GKniftyHEAD is therefore not limited to its image: its WAX record identifies the issuing collection, template, mint and ownership chain.</p>
      <h3>Crypto Moonboys: the umbrella world</h3>
      <p><a href="/wiki/crypto-moonboys.html">Crypto Moonboys</a> connects the character collections to a broader public universe of games, factions, lore, creator identities, community progression and Web3 experiments. Within this structure, WAX assets can function as art, identity markers, game-recognised objects, burn ingredients, access items, historical records or proof that a collector participated in a specific stage of the project.</p>
      <p>Not every Crypto Moonboys feature is automatically on-chain, and holding a WAX NFT does not automatically activate every website or game feature. Each integration must be verified from the current live interface and published rules. WAX provides the ownership layer; the website, games and community systems decide how that ownership is interpreted.</p>
      <h3>GraffPUNKS: art, music and cultural resistance</h3>
      <p><a href="/wiki/graffpunks.html">GraffPUNKS</a> carries the art, music, radio and rebellion side of the network. Its WAX presence connects graffiti imagery, digital editions, radio culture, Rave Relics, $PUNK concepts and the wider Year 3008 story.</p>
      <h3>No Ball Games: art, games and independent token systems</h3>
      <p><a href="/wiki/nbg.html">No Ball Games</a> is Charlie Buster's connected art, NFT, game and token world. Its WAX activity includes the <strong>noballgamess</strong> collection, $NBG-related assets and experiments around staking, burns, progression, liquidity and game utility.</p>
      <h3>Connected WAX collections</h3>
      <div class="internal-link-grid">
        <a href="/wiki/gkniftyheads.html"><strong>gkniftyheads</strong>Main GKniftyHEADS character, faction and cultural collection.</a>
        <a href="/wiki/crypto-moonboys.html"><strong>hodlmoonboys</strong>Crypto Moonboys and Moonboy-linked digital identity assets.</a>
        <a href="/wiki/graffpunks.html"><strong>graffk1ngsuk</strong>Graffiti Kings and GraffPUNKS-linked WAX history.</a>
        <a href="/wiki/graffpunks.html"><strong>graffiti.r2</strong>Graffiti-focused digital art and connected project assets.</a>
        <a href="/wiki/bitcoin-kids.html"><strong>dabitcoinkid</strong>Bitcoin Kid and related character-world assets.</a>
        <a href="/wiki/darren-cullen.html"><strong>gr4ffitiking</strong>Graffiti King identity and artist-linked works.</a>
        <a href="/wiki/nbg.html"><strong>noballgamess</strong>No Ball Games art, games, token and progression assets.</a>
      </div>
      <div class="callout-note"><strong>Core distinction:</strong> Graffiti Kings provides the culture; GKniftyHEADS organises the character and faction identity; Crypto Moonboys connects the wider public universe; GraffPUNKS carries the art, music and rebel signal; No Ball Games develops its own NFT, game and token systems; WAX supplies the blockchain infrastructure, and WAXP is the common native asset beneath them.</div>
    `;

    const risks = article.querySelector('#risks');
    if (risks) risks.before(section);
    else article.appendChild(section);
  }

  function appendWeb3CryptoMoonboysCaseStudy() {
    const article = document.querySelector('article.wiki-content');
    if (!article || document.getElementById('web3-crypto-moonboys')) return;
    if (!document.querySelector('[data-page-id="web3"]')) return;

    const section = document.createElement('section');
    section.className = 'wiki-section';
    section.id = 'web3-crypto-moonboys';
    section.innerHTML = `
      <h2>Web3 beyond tokens: ownership, participation and portable culture</h2>
      <p>Web3 is most useful when it adds capabilities that a normal website cannot provide cleanly on its own. Those capabilities include publicly verifiable ownership, assets that can move between compatible applications, transparent transaction history, programmable rules, community participation and the ability to connect a wallet without asking a platform to create another closed account.</p>
      <p>A Web3 application does not need to place every action on a blockchain. Good architecture separates responsibilities. The blockchain can record ownership, token balances, transfers and contract-controlled actions. A normal database can handle fast gameplay, private profiles, moderation, notifications and information that should not be public. The website can provide the interface, explanation and community experience.</p>
      <h3>The practical Web3 stack</h3>
      <ul>
        <li><strong>Wallet and identity:</strong> a wallet can prove control of an address and sign an authentication message without exposing the private key.</li>
        <li><strong>Blockchain:</strong> a public network records assets, balances, transfers and smart-contract actions.</li>
        <li><strong>NFT and token standards:</strong> common standards allow marketplaces, games and explorers to interpret the same asset records.</li>
        <li><strong>Application layer:</strong> websites, games, bots and dashboards turn raw blockchain records into usable experiences.</li>
        <li><strong>Off-chain services:</strong> databases, APIs, search indexes and media storage provide speed, privacy and richer features.</li>
        <li><strong>Community layer:</strong> social spaces, governance, creative collaboration and reputation give the technology a reason to exist.</li>
      </ul>
      <h2>Crypto Moonboys as a detailed Web3 project example</h2>
      <p><a href="/wiki/crypto-moonboys.html">Crypto Moonboys</a> is a connected creator, culture, character, lore and gaming ecosystem built from the real-world foundation of <a href="/wiki/darren-cullen.html">Graffiti Kings</a>. It combines public web pages, WAX blockchain assets, community identity, games, Telegram-linked progression, fictional worlds and creator tools.</p>
      <h3>Real culture before blockchain</h3>
      <p>Graffiti Kings supplies the physical history: graffiti, walls, crews, public art, music, events and decades of cultural relationships. Web3 gives parts of the archive and its later character worlds verifiable digital provenance and transferable ownership records.</p>
      <h3>WAX assets as the ownership layer</h3>
      <p>Crypto Moonboys and its connected worlds use the <a href="/wiki/wax-blockchain.html">WAX blockchain</a>, with <a href="/wiki/waxp.html">WAXP</a> as the chain's native asset. WAX collections, schemas, templates, mint numbers and asset IDs allow character art and related collectibles to be distinguished from ordinary copied images.</p>
      <h3>GKniftyHEADS and portable character identity</h3>
      <p><a href="/wiki/gkniftyheads.html">GKniftyHEADS</a> turns artists, collectors, characters and factions into traceable WAX assets. A game or website must still deliberately add support for a collection.</p>
      <h3>Lore, games and off-chain progression</h3>
      <p>The project connects assets to factions, HODL WARS, Block Topia, GraffPUNKS, Bitcoin Kids and the Year 3008 universe. Arcade games, Telegram-linked identity, XP, quests, seasonal leaderboards, pet progression and daily activity remain better suited to fast off-chain systems.</p>
      <h3>Creator tools and clear status labels</h3>
      <p>SWARMSY-Ai supports project development, while the wiki separates what is live, historical, in beta, planned or fictional lore. A token existing on-chain does not prove that every proposed utility is active.</p>
      <div class="callout-note"><strong>Core lesson:</strong> Web3 is not simply adding a token to a website. It is designing a clear relationship between users, wallets, assets, applications, culture and governance.</div>
    `;

    const risks = article.querySelector('#risks');
    if (risks) risks.before(section);
    else article.appendChild(section);
  }

  function standardiseWikiEngagementCard() {
    if (!window.location.pathname.startsWith('/wiki/')) return;

    const apply = () => {
      document.querySelectorAll('.wiki-engagement-module').forEach(module => {
        const deck = module.querySelector('.battle-engagement-deck');
        const missions = deck && deck.querySelector('.battle-shell--missions');
        if (!deck || !missions || deck.classList.contains('battle-engagement-deck--collection')) return;

        deck.querySelectorAll('.battle-shell').forEach(shell => {
          if (shell !== missions) shell.remove();
        });

        deck.style.gridTemplateColumns = 'minmax(280px, 360px)';
        deck.style.justifyContent = 'end';
        deck.style.marginLeft = 'auto';
        module.style.width = '100%';

        const inner = missions.querySelector('.battle-shell-inner');
        const like = document.querySelector('.page-like-widget');
        if (inner && like && !like.closest('.battle-shell--missions')) {
          let row = inner.querySelector('.mission-like-row');
          if (!row) {
            row = document.createElement('div');
            row.className = 'mission-like-row';
            row.setAttribute('role', 'group');
            row.setAttribute('aria-label', 'Article signal');
            const heat = inner.querySelector('.battle-heat-summary');
            inner.insertBefore(row, heat ? heat.nextSibling : inner.firstChild);
          }
          row.appendChild(like);
        }

        module.dataset.compactEngagementReady = '1';
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 10000);
  }

  document.addEventListener('DOMContentLoaded', function() {
    const el = document.querySelector('[data-entity-slug]');
    if (el) loadBible(el.getAttribute('data-entity-slug'));
    updateCryptoMoonboysSwarmsySection();
    appendBlockTopiaRelatedPaths();
    appendWaxpProjectWorlds();
    appendWeb3CryptoMoonboysCaseStudy();
    standardiseWikiEngagementCard();
  });

  window.loadBible = loadBible;
})();