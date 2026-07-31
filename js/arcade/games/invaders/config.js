/**
 * config.js — Meme Swarm 3008 game metadata and configuration.
 */

export var INVADERS_CONFIG = Object.freeze({
  /** Leaderboard / ArcadeSync key. */
  id: 'meme-swarm-3008',

  /** Display label used by GameRegistry. */
  label: '👾 Meme Swarm 3008',

  /** Cross-game modifier compatibility tags. */
  crossGameTags: Object.freeze(['shooter']),
});

// The game page predates the shared manifest and contains a large inline visual
// runtime. Correct its public metadata without disturbing that gameplay layer.
if (typeof document !== 'undefined') {
  const applyBranding = () => {
    document.title = '👾 Meme Swarm 3008 — Crypto Moonboys Arcade';
    const breadcrumb = document.querySelector('.breadcrumb [aria-current="page"]');
    if (breadcrumb) breadcrumb.textContent = 'Meme Swarm 3008';
    const heading = document.querySelector('.category-header .page-title');
    if (heading) heading.textContent = '₿ Meme Swarm 3008: Meme Wars';
    const canvas = document.getElementById('invCanvas');
    if (canvas) canvas.setAttribute('aria-label', 'Meme Swarm 3008 game');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyBranding, { once: true });
  else applyBranding();
}
