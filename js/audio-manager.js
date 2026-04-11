export class AudioManager {
  constructor() {
    this.sounds = {};
    this.music = null;
    this.volume = 0.5;
  }

  loadSound(name, path) {
    const audio = new Audio(path);
    audio.volume = this.volume;
    this.sounds[name] = audio;
  }

  playSound(name) {
    const sound = this.sounds[name];
    if (sound) {
      sound.currentTime = 0;
      sound.play();
    }
  }

  playMusic(path, loop = true) {
    if (this.music) this.music.pause();
    this.music = new Audio(path);
    this.music.loop = loop;
    this.music.volume = this.volume;
    this.music.play();
  }

  stopMusic() {
    if (this.music) this.music.pause();
  }

  setVolume(level) {
    this.volume = level;
    Object.values(this.sounds).forEach(s => (s.volume = level));
    if (this.music) this.music.volume = level;
  }
}