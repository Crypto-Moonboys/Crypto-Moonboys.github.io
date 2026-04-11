
// Moonboys Arcade - Audio Manager
export class AudioManager {
  constructor() {
    this.tracks = {};
    this.muted = localStorage.getItem("audioMuted") === "true";
  }

  load(name, src, loop = true) {
    const audio = new Audio(src);
    audio.loop = loop;
    this.tracks[name] = audio;
  }

  play(name) {
    if (!this.muted && this.tracks[name]) {
      this.tracks[name].play();
    }
  }

  stop(name) {
    if (this.tracks[name]) {
      this.tracks[name].pause();
      this.tracks[name].currentTime = 0;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem("audioMuted", this.muted);
  }
}
