export const ArcadeSync = {
  getProjectedXpFromScore(score) {
    const safeScore = Number(score);
    if (!Number.isFinite(safeScore) || safeScore < 0) return 0;
    // Local preview only; backend remains authoritative.
    return Math.min(Math.floor(safeScore / 1000), 100);
  },

  getTelegramAuth() {
    if (typeof window === "undefined") return null;
    if (window.MOONBOYS_IDENTITY && typeof window.MOONBOYS_IDENTITY.getTelegramAuth === "function") {
      return window.MOONBOYS_IDENTITY.getTelegramAuth();
    }
    try {
      const raw = localStorage.getItem("moonboys_tg_auth");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  getApiBase() {
    if (typeof window === "undefined") return null;
    const cfg = window.MOONBOYS_API || {};
    return cfg.BASE_URL ? String(cfg.BASE_URL).replace(/\/$/, "") : null;
  },

  getPlayer() {
    let player = localStorage.getItem("moonboys_player");
    if (!player) {
      player = `Player_${Math.floor(Math.random() * 10000)}`;
      localStorage.setItem("moonboys_player", player);
    }
    return player;
  },

  setPlayer(name) {
    localStorage.setItem("moonboys_player", name);
  },

  getHighScore(game) {
    const n = parseInt(localStorage.getItem(`highscore_${game}`) || "0", 10);
    return isNaN(n) ? 0 : n;
  },

  setHighScore(game, score) {
    if (typeof score !== "number" || !isFinite(score) || score < 0) {
      console.warn("[arcade-sync] Invalid score; not persisted:", score);
      return;
    }
    const current = this.getHighScore(game);
    if (Math.floor(score) > current) {
      localStorage.setItem(`highscore_${game}`, Math.floor(score));
    }
  },

  async syncBlockTopiaProgressionOnAcceptedScore(score, game = "blocktopia") {
    const safeScore = Number(score);
    if (!Number.isFinite(safeScore) || safeScore < 0) return null;
    const apiBase = this.getApiBase();
    if (!apiBase) return null;

    const telegram_auth = this.getTelegramAuth();
    if (!telegram_auth || !telegram_auth.hash || !telegram_auth.auth_date) {
      return null;
    }

    const previewXp = this.getProjectedXpFromScore(safeScore);
    try {
      localStorage.setItem("blocktopia_xp_preview", String(previewXp));
    } catch {}

    const response = await fetch(`${apiBase}/blocktopia/progression/mini-game`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "arcade_score",
        game: String(game || "blocktopia").toLowerCase(),
        score: Math.floor(safeScore),
        telegram_auth,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return response.json().catch(() => null);
  }
};
