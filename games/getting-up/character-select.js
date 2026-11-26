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

  function readSelection() {
    var requested = new URLSearchParams(window.location.search).get('fighter');
    if (CHARACTERS[requested]) return { id: requested, committed: true };
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (CHARACTERS[saved]) return { id: saved, committed: true };
    } catch (_) {}
    return { id: 'bird', committed: false };
  }

  var initialSelection = readSelection();
  var selectedId = initialSelection.id;
  var selectionCommitted = initialSelection.committed;
  var diedSinceSelection = false;
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

  function setChooserVisible(visible) {
    var chooser = document.getElementById('fighter-select');
    if (!chooser) return;
    chooser.hidden = !visible;
    chooser.setAttribute('aria-hidden', String(!visible));
  }

  function commitCurrentSelection() {
    selectionCommitted = true;
    try { localStorage.setItem(STORAGE_KEY, selectedId); } catch (_) {}
    setChooserVisible(false);
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
      if (!CHARACTERS[nextId]) return;
      if (nextId === selectedId) {
        commitCurrentSelection();
        return;
      }
      try { localStorage.setItem(STORAGE_KEY, nextId); } catch (_) {}
      var url = new URL(window.location.href);
      url.searchParams.set('fighter', nextId);
      window.location.assign(url.toString());
    });
  });

  window.addEventListener('nbg-level-started', function () {
    commitCurrentSelection();
    syncButtons(true);
  });
  window.addEventListener('nbg-game-over', function () {
    diedSinceSelection = true;
  });
  window.addEventListener('nbg-level-reset', function () {
    syncButtons(false);
    if (diedSinceSelection) {
      diedSinceSelection = false;
      selectionCommitted = false;
      setChooserVisible(true);
    } else {
      setChooserVisible(!selectionCommitted);
    }
  });
  syncButtons(false);
  setChooserVisible(!selectionCommitted);

  window.GettingUpCharacters = {
    selected: selected,
    all: CHARACTERS
  };
})();