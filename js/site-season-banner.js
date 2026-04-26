/* ============================================================
   site-season-banner.js — Global seasonal event banner.

   Injects a dismissible announcement strip beneath the site
   header to promote the current Moonboys Arcade season.

   Drop on any page:
     <script src="/js/site-season-banner.js"></script>

   Banner is hidden for 7 days once dismissed (localStorage).
   ============================================================ */
(function () {
  'use strict';

  var DISMISS_KEY    = 'moonboys_season_banner_dismissed';
  var DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days

  var SEASON_EPOCH_MS   = 1704067200000;  // 2024-01-01 — matches leaderboard-worker
  var SEASON_LENGTH_MS  = 90 * 24 * 60 * 60 * 1000;

  // ── Compute current season number ─────────────────────────────────────
  function currentSeason() {
    return Math.floor((Date.now() - SEASON_EPOCH_MS) / SEASON_LENGTH_MS) + 1;
  }

  // ── Check dismiss state ────────────────────────────────────────────────
  function isDismissed() {
    try {
      var raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return false;
      var ts = parseInt(raw, 10);
      return !isNaN(ts) && (Date.now() - ts) < DISMISS_TTL_MS;
    } catch (_) {
      return false;
    }
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (_) { /* ignore */ }
  }

  // ── Build banner element ───────────────────────────────────────────────
  function buildBanner(seasonNum) {
    var banner = document.createElement('div');
    banner.id   = 'season-banner';
    banner.setAttribute('role', 'complementary');
    banner.setAttribute('aria-label', 'Seasonal event announcement');

    Object.assign(banner.style, {
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      gap:             '10px',
      padding:         '8px 48px 8px 16px',
      background:      'linear-gradient(90deg, rgba(247,201,72,.12) 0%, rgba(188,140,255,.08) 100%)',
      borderBottom:    '1px solid rgba(247,201,72,.25)',
      fontSize:        '.82rem',
      color:           'var(--color-text, #e6edf3)',
      position:        'relative',
      zIndex:          '50',
      lineHeight:      '1.4',
      flexWrap:        'wrap',
    });

    var icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🏆';
    icon.style.fontSize = '1rem';

    var text = document.createElement('span');
    text.innerHTML =
      '<strong style="color:#f7c948">Arcade Season ' + seasonNum + ' — Active Now</strong>' +
      ' &nbsp;|&nbsp; Invaders 3008 is the current arcade XP &amp; leaderboard source.' +
      ' &nbsp;<a href="/games/invaders-3008/" style="color:#f7c948;text-decoration:underline">Play now →</a>';

    var closeBtn = document.createElement('button');
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('aria-label', 'Dismiss seasonal banner');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      position:   'absolute',
      right:      '10px',
      top:        '50%',
      transform:  'translateY(-50%)',
      background: 'none',
      border:     'none',
      color:      'var(--color-text-muted, #8b949e)',
      cursor:     'pointer',
      fontSize:   '.9rem',
      lineHeight: '1',
      padding:    '4px 6px',
    });
    closeBtn.addEventListener('click', function () {
      dismiss();
      banner.remove();
    });

    banner.appendChild(icon);
    banner.appendChild(text);
    banner.appendChild(closeBtn);
    return banner;
  }

  // ── Inject banner beneath the site header ─────────────────────────────
  function injectBanner() {
    if (isDismissed()) return;

    var header = document.getElementById('site-header');
    if (!header) return;

    var banner = buildBanner(currentSeason());
    header.insertAdjacentElement('afterend', banner);
  }

  // ── Wait for DOM ready ─────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBanner);
  } else {
    injectBanner();
  }
}());
