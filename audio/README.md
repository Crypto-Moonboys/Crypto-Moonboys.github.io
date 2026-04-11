# 🎵 Moonboys Arcade — Audio Assets

This directory holds all sound effects and music tracks for the Moonboys Arcade.

Audio is managed by `/js/audio-manager.js` (`AudioManager` class).  
Bonus sounds are triggered by `/js/bonus-engine.js` via `AUDIO_HOOK` comments in each game.

---

## Directory layout

```
audio/
├── sfx/          ← Short sound effects (OGG + MP3 dual format recommended)
│   ├── correct.ogg / correct.mp3        — Correct answer in Crystal Quest
│   ├── wrong.ogg / wrong.mp3            — Wrong answer
│   ├── eat.ogg / eat.mp3                — Snake eats food
│   ├── game_over.ogg / game_over.mp3    — Game over screen
│   ├── bonus_common.ogg                 — Common bonus popup
│   ├── bonus_uncommon.ogg               — Uncommon bonus popup
│   ├── bonus_rare.ogg                   — Rare bonus popup
│   ├── bonus_epic.ogg                   — Epic bonus popup
│   ├── bonus_legendary.ogg              — Legendary bonus popup
│   └── bonus_wtf.ogg                    — WTF-tier bonus popup (the big one)
└── music/        ← Looping background music tracks
    ├── arcade-lobby.ogg                 — Games index / leaderboard ambient
    ├── snake-theme.ogg                  — SnakeRun 3008 background loop
    ├── crystal-quest-theme.ogg          — Crystal Quest ambient
    └── block-topia-theme.ogg            — Block Topia Quest Maze theme
```

---

## How to wire audio

### Using AudioManager (class-based)

```js
import { AudioManager } from '/js/audio-manager.js';
const audio = new AudioManager();
audio.loadSound('correct', '/audio/sfx/correct.ogg');
audio.loadSound('wrong',   '/audio/sfx/wrong.ogg');
audio.playMusic('/audio/music/crystal-quest-theme.ogg');

// On correct answer:
audio.playSound('correct');
```

### Bonus sounds (auto-triggered by bonus-engine.js)

`bonus-engine.js` emits `AUDIO_HOOK: play('bonus_' + bonus.rarity)` comments.  
Wire them by replacing the comment with:

```js
audio.playSound('bonus_' + bonus.rarity);
```

---

## Format recommendations

| Format | Support          |
|--------|-----------------|
| `.ogg` | Chrome, Firefox, Edge (preferred) |
| `.mp3` | Safari + all     |

Use both for maximum compatibility. `AudioManager.loadSound()` accepts a single path —
extend it to try `.ogg` first then fall back to `.mp3` if needed:

```js
loadSound(name, basePath) {
  const ogg = new Audio(basePath + '.ogg');
  ogg.onerror = () => { this.sounds[name] = new Audio(basePath + '.mp3'); };
  this.sounds[name] = ogg;
}
```

---

## Placeholder status

All audio files are **placeholders** (empty `.gitkeep`).  
Replace with real audio assets before production launch.  
The games are fully functional without audio — all hooks degrade gracefully.
