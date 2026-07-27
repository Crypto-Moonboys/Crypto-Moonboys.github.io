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
      .catch(() => {}); // Silently fail if no bible exists yet
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
      <p><a href="/wiki/graffpunks.html">GraffPUNKS</a> carries the art, music, radio and rebellion side of the network. Its WAX presence connects graffiti imagery, digital editions, radio culture, Rave Relics, $PUNK concepts and the wider Year 3008 story. WAX works particularly well for this kind of mixed cultural output because separate collections and templates can document artworks, characters, event pieces, music-linked artefacts and community rewards without forcing them into one undifferentiated token.</p>
      <p><a href="/wiki/graffpunks-24-7-radio.html">GraffPUNKS 24/7 Radio</a> remains a real broadcast platform, while any token rewards, NFT unlocks or Listen2Earn systems must be labelled according to their actual live status. The WAX record can prove that an asset exists and who owns it; it cannot prove that a promised external feature is operating unless the application and contract are also live.</p>

      <h3>No Ball Games: art, games and independent token systems</h3>
      <p><a href="/wiki/nbg.html">No Ball Games</a> is Charlie Buster's connected art, NFT, game and token world. Its WAX activity includes the <strong>noballgamess</strong> collection, $NBG-related assets and experiments around staking, burns, progression, liquidity and game utility. WAXP serves as the external reserve and marketplace asset around those systems, while $NBG is the project-specific utility token and non-transferable game currencies can handle everyday progression where required.</p>
      <p>The distinction matters. WAXP belongs to the WAX chain and is not controlled by No Ball Games. $NBG belongs to the No Ball Games economy and should not be presented as a replacement for WAXP. WAXP funds chain activity, marketplace settlement and external liquidity; project tokens and game counters provide narrower utility inside the project.</p>

      <h3>Connected WAX collections</h3>
      <p>The wider Graffiti Kings and Crypto Moonboys family has used several WAX collection identities. The principal collection names recorded across the project include:</p>
      <div class="internal-link-grid">
        <a href="/wiki/gkniftyheads.html"><strong>gkniftyheads</strong>Main GKniftyHEADS character, faction and cultural collection.</a>
        <a href="/wiki/crypto-moonboys.html"><strong>hodlmoonboys</strong>Crypto Moonboys and Moonboy-linked digital identity assets.</a>
        <a href="/wiki/graffpunks.html"><strong>graffk1ngsuk</strong>Graffiti Kings and GraffPUNKS-linked WAX history.</a>
        <a href="/wiki/graffpunks.html"><strong>graffiti.r2</strong>Graffiti-focused digital art and connected project assets.</a>
        <a href="/wiki/bitcoin-kids.html"><strong>dabitcoinkid</strong>Bitcoin Kid and related character-world assets.</a>
        <a href="/wiki/darren-cullen.html"><strong>gr4ffitiking</strong>Graffiti King identity and artist-linked works.</a>
        <a href="/wiki/nbg.html"><strong>noballgamess</strong>No Ball Games art, games, token and progression assets.</a>
      </div>
      <p>Collection names are identifiers, not guarantees. Before buying, collectors should confirm that the collection account is the intended official issuer, inspect the schema and template, check supply and mint numbers, and verify any promised utility from the current project website or contract. Similar artwork or a familiar title does not make an NFT official.</p>

      <h3>Why WAXP matters across all of these worlds</h3>
      <p>The shared importance of WAXP is operational. It gives otherwise different projects one common chain-level economy: accounts can hold assets from multiple collections in one wallet, marketplaces can list them using the same settlement token, games can inspect ownership through the same NFT standard, and creators can build new drops without inventing a blockchain from scratch.</p>
      <p>That common infrastructure also creates responsibility. Large NFT families need clear collection verification, sustainable resource planning, transparent royalty and treasury rules, careful token emissions and accurate labels for live, historical, beta and proposed utility. WAX makes complex creator worlds possible, but long-term credibility still depends on the people operating them.</p>
      <div class="callout-note"><strong>Core distinction:</strong> Graffiti Kings provides the culture; GKniftyHEADS organises the character and faction identity; Crypto Moonboys connects the wider public universe; GraffPUNKS carries the art, music and rebel signal; No Ball Games develops its own NFT, game and token systems; WAX supplies the blockchain infrastructure, and WAXP is the common native asset beneath them.</div>
    `;

    const risks = article.querySelector('#risks');
    if (risks) risks.before(section);
    else article.appendChild(section);

    const toc = article.querySelector('.article-toc ol');
    if (toc && !toc.querySelector('a[href="#waxp-gk-worlds"]')) {
      const item = document.createElement('li');
      item.innerHTML = '<a href="#waxp-gk-worlds">Graffiti Kings and Crypto Moonboys on WAX</a>';
      const risksItem = toc.querySelector('a[href="#risks"]')?.parentElement;
      if (risksItem) toc.insertBefore(item, risksItem);
      else toc.appendChild(item);
    }
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
      <p>A Web3 application does not need to place every action on a blockchain. Good architecture separates responsibilities. The blockchain can record ownership, token balances, transfers and contract-controlled actions. A normal database can handle fast gameplay, private profiles, moderation, notifications and information that should not be public. The website can provide the interface, explanation and community experience. This hybrid model is often more practical than pretending that decentralisation requires every click to become a permanent transaction.</p>

      <h3>The practical Web3 stack</h3>
      <ul>
        <li><strong>Wallet and identity:</strong> a wallet can prove control of an address and sign an authentication message without exposing the private key.</li>
        <li><strong>Blockchain:</strong> a public network records assets, balances, transfers and smart-contract actions.</li>
        <li><strong>NFT and token standards:</strong> common standards allow marketplaces, games and explorers to interpret the same asset records.</li>
        <li><strong>Application layer:</strong> websites, games, bots and dashboards turn raw blockchain records into usable experiences.</li>
        <li><strong>Off-chain services:</strong> databases, APIs, search indexes and media storage provide speed, privacy and richer features.</li>
        <li><strong>Community layer:</strong> social spaces, governance, creative collaboration and reputation give the technology a reason to exist.</li>
      </ul>
      <p>The result is not a fully automatic replacement for every institution. It is a different trust model. Users can verify selected facts directly, while still relying on project operators for design, moderation, maintenance, legal responsibilities and delivery of off-chain promises.</p>

      <h3>What genuine digital ownership means</h3>
      <p>Owning a Web3 asset usually means controlling the blockchain record associated with a token. That record may identify a collection, asset ID, template, mint number, transfer history or contract-controlled utility. It does not automatically transfer copyright, guarantee commercial rights, promise future development or make the linked media permanently available. Those rights and dependencies must be stated separately.</p>
      <p>This distinction is central to responsible Web3 design. On-chain provenance can be strong while the surrounding project remains partly centralised. A marketplace can disappear while the token record survives. A game can stop supporting an NFT even though the wallet still owns it. Web3 improves verifiability and portability, but it does not remove project risk.</p>

      <h2>Crypto Moonboys as a detailed Web3 project example</h2>
      <p><a href="/wiki/crypto-moonboys.html">Crypto Moonboys</a> is a useful example because it is not only an NFT collection or only a game. It is a connected creator, culture, character, lore and gaming ecosystem built from the real-world foundation of <a href="/wiki/darren-cullen.html">Graffiti Kings</a>. It combines public web pages, WAX blockchain assets, community identity, games, Telegram-linked progression, fictional worlds and creator tools. Different parts use different levels of decentralisation.</p>

      <h3>1. Real culture before blockchain</h3>
      <p>Graffiti Kings supplies the physical history: graffiti, walls, crews, public art, music, events and decades of cultural relationships. Web3 did not create that history. Its role is to give parts of the archive and its later character worlds verifiable digital provenance, transferable ownership records and new ways for collectors to participate.</p>
      <p>This order matters. The strongest creator projects begin with an identity, body of work or community worth preserving. The blockchain is then used where ownership, scarcity, exchange or public verification adds something meaningful.</p>

      <h3>2. WAX assets as the ownership layer</h3>
      <p>Crypto Moonboys and its connected worlds use the <a href="/wiki/wax-blockchain.html">WAX blockchain</a>, with <a href="/wiki/waxp.html">WAXP</a> as the chain's native asset. WAX collections, schemas, templates, mint numbers and asset IDs allow character art and related collectibles to be distinguished from ordinary copied images. A wallet can hold assets from several connected collections, and compatible marketplaces can read the same public ownership records.</p>
      <p>The wider project family includes collection identities associated with GKniftyHEADS, Crypto Moonboys, Graffiti Kings, GraffPUNKS, Bitcoin Kid and No Ball Games. Each collection must still be verified by its exact WAX account. Familiar artwork or branding alone is not proof that an asset is official.</p>

      <h3>3. GKniftyHEADS and portable character identity</h3>
      <p><a href="/wiki/gkniftyheads.html">GKniftyHEADS</a> turns artists, collectors, characters and factions into traceable WAX assets. In Web3 terms, this creates a portable identity object: the asset can remain in the holder's wallet while different project interfaces recognise its collection, template or ownership state.</p>
      <p>Portability does not mean universal compatibility. A game or website must deliberately add support for a collection. Crypto Moonboys therefore treats blockchain ownership and application utility as separate layers: the chain proves the asset record, while each live product defines what that record currently does.</p>

      <h3>4. Lore and community as the participation layer</h3>
      <p>The project connects assets to factions, <a href="/wiki/hodl-wars.html">HODL WARS</a>, <a href="/wiki/block-topia.html">Block Topia</a>, GraffPUNKS, Bitcoin Kids and the Year 3008 universe. This shows how Web3 ownership can become part of a wider cultural system rather than ending at a marketplace listing. Characters can carry history, affiliation and creative meaning across articles, games and community discussions.</p>
      <p>Not all lore is blockchain data, and it should not be. Stories need room to grow without turning every sentence into an immutable record. The wiki provides the readable public canon, while blockchain records provide evidence for specific assets and transactions.</p>

      <h3>5. Games, Telegram identity and off-chain progression</h3>
      <p>Crypto Moonboys also demonstrates why Web3 projects need off-chain systems. Arcade games, Telegram-linked identity, XP, quests, seasonal leaderboards, pet progression and daily activity require fast updates, abuse controls, moderation and private account links. These are better handled by application servers and databases than by forcing every score or care action onto a public chain.</p>
      <p>The Web3 connection remains useful where a game checks wallet ownership, recognises a supported NFT, distributes a blockchain asset or uses a transparent token contract. The game state itself can remain off-chain. This hybrid approach reduces transaction friction while keeping selected ownership records independently verifiable.</p>

      <h3>6. GraffPUNKS, radio and creator media</h3>
      <p><a href="/wiki/graffpunks.html">GraffPUNKS</a> extends the ecosystem into digital street art, music, radio and resistance culture. <a href="/wiki/graffpunks-24-7-radio.html">GraffPUNKS 24/7 Radio</a> is a real media platform, while associated NFTs or token systems require separate verification. This is another Web3 lesson: a project can combine ordinary streaming, websites and social communities with blockchain collectibles without pretending the media itself must live entirely on-chain.</p>

      <h3>7. No Ball Games and specialised token economics</h3>
      <p><a href="/wiki/nbg.html">No Ball Games</a> adds an independent art, NFT, game and token world. Its $NBG token has project-specific utility, while WAXP remains the external chain asset. Non-transferable game currencies can support everyday progression without creating another freely traded financial instrument. This layered economy demonstrates that one token should not be forced to perform every job.</p>

      <h3>8. Creator tools and SWARMSY-Ai</h3>
      <p>Crypto Moonboys also includes <a href="/swarmsy.html">SWARMSY-Ai</a>, a creator operating environment built from a customised AnythingLLM foundation. SWARMSY helps users develop ideas, identities, plans and approved project truths. It is not a blockchain protocol, but it supports the human side of Web3: creating a coherent project before introducing NFTs, tokens or community systems.</p>
      <p>This separation is healthy. Artificial intelligence can assist planning and continuity; blockchains can provide public ownership and transaction records; normal software can deliver the product. None of those technologies replaces the others.</p>

      <h3>9. Transparent status labels</h3>
      <p>A credible Web3 project must distinguish what is <strong>live</strong>, <strong>historical</strong>, <strong>in beta</strong>, <strong>planned</strong> or purely <strong>fictional lore</strong>. A token existing on-chain does not prove that every proposed utility is active. An NFT image does not prove access to a game. A repository proves source code exists, but not necessarily that a hosted release is operating.</p>
      <p>Crypto Moonboys uses the wiki to separate those layers. That discipline is as important as the blockchain itself because Web3 trust depends on accurate claims, not only technical records.</p>

      <h3>Why this is a useful Web3 model</h3>
      <p>Crypto Moonboys illustrates a broad Web3 pattern: start with real culture, create recognisable digital identities, use a blockchain for selected ownership records, connect those records to useful applications, and keep high-frequency or private activity off-chain. The project can then expand through games, media, lore, community progression and creator tools without making every component dependent on one token.</p>
      <div class="callout-note"><strong>Core lesson:</strong> Web3 is not simply adding a token to a website. It is designing a clear relationship between users, wallets, assets, applications, culture and governance—then stating honestly which parts are decentralised, which are operated by the project, and which are still being built.</div>
    `;

    const risks = article.querySelector('#risks');
    if (risks) risks.before(section);
    else article.appendChild(section);
  }

  document.addEventListener('DOMContentLoaded', function() {
    const el = document.querySelector('[data-entity-slug]');
    if (el) {
      loadBible(el.getAttribute('data-entity-slug'));
    }
    updateCryptoMoonboysSwarmsySection();
    appendBlockTopiaRelatedPaths();
    appendWaxpProjectWorlds();
    appendWeb3CryptoMoonboysCaseStudy();
  });

  window.loadBible = loadBible;
})();