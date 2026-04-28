export const ArcadeSync = {
  PENDING_KEY: "moonboys_arcade_pending_progress_v1",
  PENDING_MAX: 250,
  PENDING_BATCH: 25,
  PRODUCTION_API_BASE: "https://moonboys-api.sercullen.workers.dev",

  getProjectedXpFromScore(score) {
    const safeScore = Number(score);
    if (!Number.isFinite(safeScore) || safeScore < 0) return 0;
    // Local preview only; backend remains authoritative.
    return Math.min(Math.floor(safeScore / 1000), 100);
  },

  async getTelegramAuth() {
    if (typeof window === "undefined") return null;
    const gate = window.MOONBOYS_IDENTITY;
    if (!gate) return null;
    if (typeof gate.getSignedTelegramAuth !== "function") return null;
    let signed = await gate.getSignedTelegramAuth();
    if (signed && signed.hash && signed.auth_date) return signed;

    const linked = typeof gate.isTelegramLinked === "function" ? !!gate.isTelegramLinked() : false;
    if (linked && typeof gate.restoreLinkedTelegramAuth === "function") {
      try {
        await gate.restoreLinkedTelegramAuth();
      } catch {}
      signed = await gate.getSignedTelegramAuth();
    }
    return signed || null;
  },

  getApiBase() {
    if (typeof window === "undefined") return null;
    const candidates = [
      { key: "window.MOONBOYS_API.BASE_URL", value: window.MOONBOYS_API && window.MOONBOYS_API.BASE_URL },
      { key: "window.API_CONFIG.BASE_URL", value: window.API_CONFIG && window.API_CONFIG.BASE_URL },
      { key: "window.MOONBOYS_CONFIG.API_BASE", value: window.MOONBOYS_CONFIG && window.MOONBOYS_CONFIG.API_BASE },
      { key: "fallback:production", value: this.PRODUCTION_API_BASE },
    ];

    for (const candidate of candidates) {
      if (!candidate.value) continue;
      const resolved = String(candidate.value).trim().replace(/\/$/, "");
      if (!resolved) continue;
      this.emitDebug("api_base_resolved", { apiBase: resolved, source: candidate.key });
      return resolved;
    }

    return null;
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

  normalizeGame(game) {
    const cleaned = String(game || "global").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const aliases = {
      "invaders-3008": "invaders",
      invaders3008: "invaders",
      "pac-chain": "pacchain",
      pac_chain: "pacchain",
      "asteroid-fork": "asteroids",
      asteroid_fork: "asteroids",
      "breakout-bullrun": "breakout",
      breakout_bullrun: "breakout",
      "tetris-block-topia": "tetris",
      tetris_block_topia: "tetris",
      "crystal-quest": "crystal",
      crystal_quest: "crystal",
      "snake-run": "snake",
      snake_run: "snake",
      "block-topia-quest-maze": "btqm",
      block_topia_quest_maze: "btqm",
      blocktopia: "btqm",
    };
    return aliases[cleaned] || cleaned || "global";
  },

  makeRunId(run = {}) {
    const game = this.normalizeGame(run.game);
    const score = Math.max(0, Math.floor(Number(run.raw_score ?? run.score) || 0));
    const points = Math.max(0, Math.floor(Number(run.meta_points) || 0));
    const ts = Number.isFinite(Number(run.timestamp)) ? Math.floor(Number(run.timestamp)) : Date.now();
    const seed = `${game}:${score}:${points}:${ts}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    return `run_${Math.abs(hash).toString(36)}_${ts.toString(36)}`;
  },

  getPendingProgress() {
    try {
      const raw = localStorage.getItem(this.PENDING_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  },

  setPendingProgress(entries) {
    try {
      localStorage.setItem(this.PENDING_KEY, JSON.stringify(Array.isArray(entries) ? entries.slice(-this.PENDING_MAX) : []));
    } catch {}
  },

  queuePendingProgress(entry = {}) {
    const game = this.normalizeGame(entry.game);
    const rawScore = Math.max(0, Math.floor(Number(entry.raw_score ?? entry.score) || 0));
    const metaPoints = Math.max(0, Math.floor(Number(entry.meta_points) || 0));
    if (!rawScore && !metaPoints) return null;
    const timestamp = Number.isFinite(Number(entry.timestamp)) ? Math.floor(Number(entry.timestamp)) : Date.now();
    const clientRunId = String(entry.client_run_id || this.makeRunId({
      game,
      raw_score: rawScore,
      meta_points: metaPoints,
      timestamp,
    }));

    const pending = this.getPendingProgress();
    if (pending.some((item) => String(item.client_run_id) === clientRunId)) return clientRunId;

    pending.push({
      client_run_id: clientRunId,
      game,
      raw_score: rawScore,
      meta_points: metaPoints,
      timestamp,
      queued_at: Date.now(),
      source: entry.source || "arcade_run",
    });
    this.setPendingProgress(pending);
    return clientRunId;
  },

  getPendingCount() {
    return this.getPendingProgress().length;
  },

  emitDebug(stage, detail = {}) {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
    const payload = { stage, ...detail, source: "arcade-sync", ts: Date.now() };
    console.info("[arcade-sync-debug]", payload);
    window.dispatchEvent(new CustomEvent("arcade:debug", { detail: payload }));
  },

  async syncPendingArcadeProgress(options = {}) {
    const pending = this.getPendingProgress();
    if (!pending.length) {
      this.emitDebug("sync_skip", { reason: "empty_queue" });
      return { synced: 0, remaining: 0, skipped: true, reason: "empty_queue" };
    }

    const apiBase = this.getApiBase();
    if (!apiBase) {
      this.emitDebug("sync_skip", { reason: "missing_api_base", pending: pending.length });
      return { synced: 0, remaining: pending.length, skipped: true, reason: "missing_api_base" };
    }
    const telegram_auth = await this.getTelegramAuth();
    if (!telegram_auth || !telegram_auth.hash || !telegram_auth.auth_date) {
      this.emitDebug("sync_skip", { reason: "missing_auth", pending: pending.length });
      return { synced: 0, remaining: pending.length, skipped: true, reason: "missing_auth" };
    }
    this.emitDebug("sync_auth_restored", { pending: pending.length, hasHash: !!telegram_auth.hash, hasAuthDate: !!telegram_auth.auth_date });

    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const keep = [];
    let synced = 0;
    let rejected = 0;

    for (let index = 0; index < pending.length; index += this.PENDING_BATCH) {
      const batch = pending.slice(index, index + this.PENDING_BATCH);
      let payload;
      try {
        this.emitDebug("sync_request_sent", { endpoint: `${apiBase}/arcade/progression/sync`, batchSize: batch.length });
        const res = await fetch(`${apiBase}/arcade/progression/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            telegram_auth,
            entries: batch,
          }),
        });
        payload = await res.json().catch(() => ({}));
        this.emitDebug("sync_response_received", { httpStatus: res.status, batchSize: batch.length, resultCount: Array.isArray(payload?.results) ? payload.results.length : 0 });
        if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
      } catch (error) {
        // Network or auth uncertainty: keep entire batch to avoid data loss.
        keep.push(...batch);
        if (onProgress) onProgress({ batch, synced, rejected, error: String(error && error.message || error) });
        continue;
      }

      const results = Array.isArray(payload?.results) ? payload.results : [];
      const byId = new Map(results.map((item) => [String(item.client_run_id || ""), item]));
      for (const run of batch) {
        const verdict = byId.get(String(run.client_run_id));
        if (!verdict) {
          keep.push(run);
          continue;
        }
        if (verdict.status === "accepted" || verdict.status === "duplicate" || verdict.status === "rejected") {
          if (verdict.status === "accepted" || verdict.status === "duplicate") synced += 1;
          else rejected += 1;
          continue;
        }
        keep.push(run);
      }
      if (onProgress) onProgress({ batch, synced, rejected, results });
    }

    this.setPendingProgress(keep);
    return {
      synced,
      rejected,
      remaining: keep.length,
      total: pending.length,
    };
  },

  async syncBlockTopiaProgressionOnAcceptedScore(score, game = "blocktopia") {
    const safeScore = Number(score);
    if (!Number.isFinite(safeScore) || safeScore < 0) return null;
    const apiBase = this.getApiBase();
    if (!apiBase) return null;

    const telegram_auth = await this.getTelegramAuth();
    if (!telegram_auth || !telegram_auth.hash || !telegram_auth.auth_date) {
      throw new Error("Telegram auth missing or expired. Re-sync required for XP conversion.");
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
    const payload = await response.json().catch(() => null);
    try {
      if (payload?.progression) {
        localStorage.setItem("blocktopia_last_progression", JSON.stringify(payload.progression));
      }
    } catch {}
    return payload;
  }
};
