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

    // Timeline section
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

    // Relationships section
    if (bible.relationships && bible.relationships.length > 0) {
      html += '<div class="bible-section bible-relationships">';
      html += '<h3>🔗 Relationships</h3><ul>';
      bible.relationships.forEach(rel => {
        const relText = typeof rel === 'string' ? rel : JSON.stringify(rel);
        html += `<li>${relText}</li>`;
      });
      html += '</ul></div>';
    }

    // Cross-links section
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

  // Auto-init: check for data-entity-slug on body or article element
  document.addEventListener('DOMContentLoaded', function() {
    const el = document.querySelector('[data-entity-slug]');
    if (el) {
      loadBible(el.getAttribute('data-entity-slug'));
    }
    updateCryptoMoonboysSwarmsySection();
    appendBlockTopiaRelatedPaths();
  });

  // Expose globally for manual calls
  window.loadBible = loadBible;
})();
