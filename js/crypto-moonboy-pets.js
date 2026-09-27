(function () {
  'use strict';

  var cfg = window.MOONBOYS_API || {};
  var BASE = cfg.BASE_URL || null;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function resolveTelegramId() {
    try {
      if (window.MOONBOYS_IDENTITY && typeof window.MOONBOYS_IDENTITY.getTelegramId === 'function') {
        var id = window.MOONBOYS_IDENTITY.getTelegramId();
        if (id) return String(id);
      }
    } catch (_) {}
    return null;
  }

  function apiFetch(path) {
    if (!BASE) return Promise.resolve(null);
    return fetch(BASE + path, { cache: 'no-store' }).then(function (res) {
      return res.ok ? res.json() : null;
    }).catch(function () { return null; });
  }

  function formatLoadoutValue(value, fallback) {
    return escapeHtml(value || fallback);
  }

  function petSummaryHtml(pet) {
    if (!pet) {
      return '<div class="community-empty">No Crypto Moonboy Pet yet. Open Telegram and use <code>/adopt</code>.</div>';
    }
    return '<div class="tg-profile-card crypto-pets-card">' +
      '<div class="tg-profile-avatar" aria-hidden="true">🐾</div>' +
      '<div class="tg-profile-info">' +
        '<div class="tg-profile-name">' + escapeHtml(pet.display_name || 'UNKNOWN') + '</div>' +
        '<div class="tg-profile-badges">' +
          '<span class="tg-badge tg-badge-linked">' + escapeHtml(pet.stage || 'egg') + '</span>' +
          '<span class="tg-badge tg-badge-faction">Level ' + escapeHtml(pet.level || 1) + '</span>' +
        '</div>' +
        '<div class="tg-profile-xp">Pet XP: ' + escapeHtml(pet.pet_xp || 0) + ' · Health: ' + escapeHtml(pet.health || 0) + '/100 · Streak: ' + escapeHtml(pet.streak_days || 0) + '</div>' +
        '<div class="tg-profile-xp">Gold: ' + escapeHtml(pet.moon_gold || 0) + ' · Crystals: ' + escapeHtml(pet.moon_crystals || 0) + ' · Style: ' + escapeHtml(pet.style_tokens || 0) + '</div>' +
        '<div class="tg-profile-xp"><strong>Care Loadout</strong> · Food: ' + formatLoadoutValue(pet.equipped_food, 'basic') + ' · Toy: ' + formatLoadoutValue(pet.equipped_toy, 'basic') + ' · Outfit: ' + formatLoadoutValue(pet.equipped_outfit, 'none') + '</div>' +
        '<div class="tg-profile-xp"><strong>Battle Loadout</strong> · Armor: ' + formatLoadoutValue(pet.equipped_armor, 'none') + ' · Weapon: ' + formatLoadoutValue(pet.equipped_weapon, 'none') + ' · Charm: ' + formatLoadoutValue(pet.equipped_charm, 'none') + '</div>' +
      '</div>' +
    '</div>';
  }

  function initPetSummary(el) {
    var telegramId = resolveTelegramId();
    if (!telegramId) {
      el.innerHTML = '<div class="community-empty">Link Telegram with <code>/gklink</code>, then use <code>/adopt</code> in the bot.</div>';
      return;
    }
    el.innerHTML = '<div class="community-loading">Loading Crypto Moonboy Pet…</div>';
    apiFetch('/telegram-pets/state?telegram_id=' + encodeURIComponent(telegramId)).then(function (data) {
      el.innerHTML = petSummaryHtml(data && data.pet);
    });
  }

  function initPetLeaderboard(el) {
    var period = el.getAttribute('data-period') || 'seasonal';
    if (!el.dataset.loaded) el.innerHTML = '<div class="community-loading">Loading pet leaderboard…</div>';
    return apiFetch('/telegram-pets/leaderboard?period=' + encodeURIComponent(period) + '&limit=25').then(function (data) {
      if (!data || !Array.isArray(data.entries)) { showSyncFailure(el); return; }
      el.dataset.loaded = 'true';
      if (!data.entries.length) {
        el.innerHTML = '<div class="community-empty">No Pet XP entries for this period yet.</div>';
        return;
      }
      var rows = data.entries.map(function (entry) {
        return '<tr>' +
          '<td>' + escapeHtml(entry.rank) + '</td>' +
          '<td>' + escapeHtml(entry.player_display_name || entry.username || 'Moonboy') + '</td>' +
          '<td>' + escapeHtml(entry.pet_xp || 0) + '</td>' +
          '<td>' + escapeHtml(entry.display_name || 'UNKNOWN') + '</td>' +
          '<td>' + escapeHtml(entry.stage || 'egg') + '</td>' +
          '<td>' + escapeHtml(entry.level || 1) + '</td>' +
          '<td>' + escapeHtml(entry.streak_days || 0) + '</td>' +
        '</tr>';
      }).join('');
      el.innerHTML = '<div class="pets-leaderboard-scroll" role="region" aria-label="' + escapeHtml(period.replace('_', ' ')) + ' pet rankings" tabindex="0" style="max-width:100%;overflow-x:auto"><table class="guide-table pets-leaderboard-table">' +
        '<thead><tr><th>Rank</th><th>Player</th><th>Pet XP</th><th>Identity</th><th>Stage</th><th>Level</th><th>Streak</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>';
    });
  }

  function showSyncFailure(el) {
    var warning = '<div class="community-empty pets-sync-warning" role="status">Rankings or activity could not refresh. ' + (el.dataset.loaded ? 'Showing the last loaded data. ' : '') + '<button type="button" data-crypto-pets-retry>Retry refresh</button></div>';
    var oldWarning = el.querySelector('.pets-sync-warning');
    if (oldWarning) oldWarning.remove();
    el.innerHTML = warning + (el.dataset.loaded ? el.innerHTML : '');
  }

  function initPetActivity(el) {
    if (!el.dataset.loaded) el.innerHTML = '<div class="community-loading">Loading recorded activity…</div>';
    return apiFetch('/telegram-pets/activity?limit=10').then(function (data) {
      if (!data || !Array.isArray(data.items)) { showSyncFailure(el); return; }
      el.dataset.loaded = 'true';
      el.innerHTML = data.items.length ? '<ul>' + data.items.map(function (item) {
        return '<li>' + escapeHtml(item.text) + ' <small>' + escapeHtml(item.time_ago) + '</small></li>';
      }).join('') + '</ul>' : '<div class="community-empty">No recorded pet activity yet.</div>';
    });
  }

  var refreshPending = null, lastRefresh = 0;
  function refreshPetRanks(force) {
    if (refreshPending || (force !== true && Date.now() - lastRefresh < 30000)) return refreshPending;
    lastRefresh = Date.now();
    var buttons = document.querySelectorAll('[data-crypto-pets-refresh], [data-crypto-pets-retry]');
    buttons.forEach(function (button) { button.disabled = true; });
    var requests = [];
    document.querySelectorAll('[data-crypto-pets-leaderboard]').forEach(function (el) { requests.push(initPetLeaderboard(el)); });
    document.querySelectorAll('[data-crypto-pets-activity]').forEach(function (el) { requests.push(initPetActivity(el)); });
    refreshPending = Promise.all(requests).finally(function () {
      refreshPending = null;
      buttons.forEach(function (button) { button.disabled = false; });
    });
    return refreshPending;
  }

  function initPetMissions(el) {
    var telegramId = resolveTelegramId();
    if (!telegramId) {
      el.innerHTML = '<div class="community-empty">Link Telegram to see your pet missions.</div>';
      return;
    }
    apiFetch('/telegram-pets/missions?telegram_id=' + encodeURIComponent(telegramId)).then(function (data) {
      var daily = data && data.missions && data.missions.daily;
      if (!daily || !daily.length) {
        el.innerHTML = '<div class="community-empty">No pet missions available.</div>';
        return;
      }
      el.innerHTML = daily.map(function (mission) {
        return '<div class="guide-card"><strong>' + (mission.completed ? '✓ ' : '') + escapeHtml(mission.title) + '</strong></div>';
      }).join('');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-crypto-pets-summary]').forEach(initPetSummary);
    refreshPetRanks(true);
    document.querySelectorAll('[data-crypto-pets-missions]').forEach(initPetMissions);
  });
  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-crypto-pets-refresh], [data-crypto-pets-retry]')) refreshPetRanks(true);
  });
  window.addEventListener('focus', function () { refreshPetRanks(false); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshPetRanks(false); });
}());
