(function () {
  'use strict';

  var STORAGE_KEY = 'getting-up-player-character';
  var CHARACTERS = {
    bird: {
      id: 'bird',
      name: 'GraffPunks Bird',
      manifest: '/games/getting-up/graffpunks-player-animation-manifest.json',
      attack: 'SPRAY'
    },
    punk: {
      id: 'punk',
      name: 'Volcanic $PUNK',
      manifest: '/games/getting-up/volcanic-punk-player-animation-manifest.json',
      attack: 'LAVA'
    }
  };

  function readChoice() {
    var requested = new URLSearchParams(window.location.search).get('fighter');
    if (CHARACTERS[requested]) return requested;
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (CHARACTERS[saved]) return saved;
    } catch (_) {}
    return 'bird';
  }

  var selectedId = readChoice();
  var selected = CHARACTERS[selectedId];
  var canvas = document.getElementById('game');
  if (canvas) {
    canvas.dataset.nbgPlayerManifest = selected.manifest;
    canvas.dataset.nbgCharacter = selected.id;
    canvas.setAttribute('aria-label', 'Getting Up canvas — ' + selected.name);
  }
  document.body.dataset.gettingUpCharacter = selected.id;

  var label = document.getElementById('fighter-selected-name');
  if (label) label.textContent = selected.name;
  var attackButton = document.querySelector('[data-control="spray"]');
  if (attackButton) {
    attackButton.textContent = selected.attack;
    attackButton.setAttribute('aria-label', selected.id === 'punk' ? 'Fire lava' : 'Spray paint');
  }

  function syncButtons(locked) {
    document.querySelectorAll('[data-fighter]').forEach(function (button) {
      var active = button.dataset.fighter === selectedId;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
      button.disabled = !!locked;
    });
    var chooser = document.getElementById('fighter-select');
    if (chooser) chooser.dataset.locked = locked ? 'true' : 'false';
  }

  document.querySelectorAll('[data-fighter]').forEach(function (button) {
    button.addEventListener('click', function () {
      var nextId = button.dataset.fighter;
      if (!CHARACTERS[nextId] || nextId === selectedId) return;
      try { localStorage.setItem(STORAGE_KEY, nextId); } catch (_) {}
      var url = new URL(window.location.href);
      url.searchParams.set('fighter', nextId);
      window.location.assign(url.toString());
    });
  });

  window.addEventListener('nbg-level-started', function () { syncButtons(true); });
  window.addEventListener('nbg-level-reset', function () { syncButtons(false); });
  syncButtons(false);

  window.GettingUpCharacters = {
    selected: selected,
    all: CHARACTERS
  };
})();