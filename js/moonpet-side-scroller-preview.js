(() => {
  const canvas = document.getElementById("moonbot-stage");
  const ctx = canvas.getContext("2d");
  const buttons = Array.from(document.querySelectorAll("[data-action]"));
  const debugMode = document.getElementById("debug-mode");
  const debugPhase = document.getElementById("debug-phase");
  const debugPosition = document.getElementById("debug-position");

  const spots = {
    center: 480,
    food: 740,
    toy: 250,
    clean: 705,
    bed: 160,
    train: 800
  };

  const state = {
    action: "idle",
    phase: "idle",
    x: spots.center,
    y: 382,
    facing: 1,
    flow: [],
    phaseIndex: 0,
    phaseStartedAt: performance.now(),
    fromX: spots.center,
    toX: spots.center
  };

  const flows = {
    idle: [
      { phase: "idle", to: "center", duration: Infinity, locomotion: "idle" }
    ],
    eat: [
      { phase: "walk_to_food", to: "food", duration: 1500, locomotion: "walk" },
      { phase: "eat", to: "food", duration: 1900, locomotion: "eat" },
      { phase: "return_idle", to: "center", duration: 1600, locomotion: "walk" },
      { phase: "idle", to: "center", duration: Infinity, locomotion: "idle" }
    ],
    play: [
      { phase: "run_to_toy", to: "toy", duration: 1050, locomotion: "run" },
      { phase: "play", to: "toy", duration: 2200, locomotion: "play" },
      { phase: "return_idle", to: "center", duration: 1250, locomotion: "run" },
      { phase: "idle", to: "center", duration: Infinity, locomotion: "idle" }
    ],
    clean: [
      { phase: "walk_to_clean_spot", to: "clean", duration: 1450, locomotion: "walk" },
      { phase: "clean", to: "clean", duration: 2300, locomotion: "clean" },
      { phase: "return_idle", to: "center", duration: 1500, locomotion: "walk" },
      { phase: "idle", to: "center", duration: Infinity, locomotion: "idle" }
    ],
    sleep: [
      { phase: "walk_to_bed", to: "bed", duration: 1700, locomotion: "walk" },
      { phase: "sleep", to: "bed", duration: Infinity, locomotion: "sleep" }
    ],
    train: [
      { phase: "walk_to_training_spot", to: "train", duration: 1650, locomotion: "walk" },
      { phase: "train", to: "train", duration: 2400, locomotion: "train" },
      { phase: "return_idle", to: "center", duration: 1650, locomotion: "walk" },
      { phase: "idle", to: "center", duration: Infinity, locomotion: "idle" }
    ]
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  function setActiveButton(action) {
    buttons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.action === action);
    });
  }

  function startAction(action) {
    state.action = action;
    state.flow = flows[action] || flows.idle;
    state.phaseIndex = 0;
    state.phaseStartedAt = performance.now();
    state.fromX = state.x;
    state.toX = spots[state.flow[0].to] || spots.center;
    state.phase = state.flow[0].phase;
    if (state.toX !== state.x) state.facing = state.toX > state.x ? 1 : -1;
    setActiveButton(action);
  }

  function advancePhase(now) {
    const current = state.flow[state.phaseIndex];
    if (!current || current.duration === Infinity) return current;
    const elapsed = now - state.phaseStartedAt;
    if (elapsed < current.duration) return current;

    state.x = state.toX;
    state.phaseIndex = Math.min(state.phaseIndex + 1, state.flow.length - 1);
    const next = state.flow[state.phaseIndex];
    state.phaseStartedAt = now;
    state.fromX = state.x;
    state.toX = spots[next.to] || spots.center;
    state.phase = next.phase;
    if (state.toX !== state.x) state.facing = state.toX > state.x ? 1 : -1;
    if (next.phase === "idle") {
      state.action = "idle";
      setActiveButton("idle");
    }
    return next;
  }

  function updateAction(now) {
    const current = advancePhase(now) || flows.idle[0];
    if (current.duration !== Infinity) {
      const t = clamp((now - state.phaseStartedAt) / current.duration, 0, 1);
      state.x = state.fromX + (state.toX - state.fromX) * smoothstep(t);
    } else {
      state.x = state.toX;
    }
    state.x = clamp(state.x, 96, 860);
    debugMode.textContent = state.action;
    debugPhase.textContent = current.phase;
    debugPosition.textContent = `${Math.round(state.x)}px`;
    return current;
  }

  function drawStage(time) {
    const w = canvas.width;
    const h = canvas.height;
    const pulse = (Math.sin(time / 700) + 1) / 2;
    ctx.clearRect(0, 0, w, h);

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#101a34");
    sky.addColorStop(0.55, "#141424");
    sky.addColorStop(1, "#080b12");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(245, 247, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(700, 72, 36, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 12; i += 1) {
      const x = i * 92 - 18;
      const bh = 80 + (i % 5) * 22;
      ctx.fillStyle = i % 2 ? "#121a2a" : "#151d2e";
      ctx.fillRect(x, 330 - bh, 68, bh);
      ctx.fillStyle = i % 3 ? "#5de1ff" : "#ff4fc3";
      for (let y = 344 - bh; y < 315; y += 20) {
        ctx.fillRect(x + 12, y, 7, 5);
        ctx.fillRect(x + 38, y + 8, 7, 5);
      }
    }

    ctx.fillStyle = "#111823";
    ctx.fillRect(0, 384, w, 156);
    ctx.fillStyle = "#222d3f";
    ctx.fillRect(0, 382, w, 10);
    ctx.fillStyle = `rgba(255, 79, 195, ${0.42 + pulse * 0.25})`;
    ctx.fillRect(0, 394, w, 4);
    ctx.strokeStyle = `rgba(93, 225, 255, ${0.12 + pulse * 0.12})`;
    ctx.lineWidth = 2;
    for (let x = -60; x < w + 120; x += 86) {
      ctx.beginPath();
      ctx.moveTo(x, 392);
      ctx.lineTo(x + 130, h);
      ctx.stroke();
    }
    for (let y = 422; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  function drawProps(time) {
    const bob = Math.sin(time / 240) * 3;
    drawFoodSpot(spots.food, 382);
    drawToy(spots.toy, 382 + bob);
    drawCleanSpot(spots.clean, 382);
    drawBed(spots.bed, 382);
    drawTrainingSpot(spots.train, 382);
  }

  function drawFoodSpot(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#242f3e";
    ctx.fillRect(-26, 4, 52, 12);
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.ellipse(0, 4, 28, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff4fc3";
    ctx.fillRect(-8, -14, 16, 18);
    ctx.restore();
  }

  function drawToy(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#5de1ff";
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ff4fc3";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0.3, Math.PI * 1.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawCleanSpot(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#1e2b3a";
    ctx.fillRect(-24, 10, 48, 10);
    ctx.fillStyle = "#5de1ff";
    ctx.beginPath();
    ctx.arc(-8, 2, 8, 0, Math.PI * 2);
    ctx.arc(9, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBed(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#263244";
    ctx.fillRect(-46, -4, 92, 28);
    ctx.fillStyle = "#ff4fc3";
    ctx.fillRect(-42, -16, 32, 18);
    ctx.fillStyle = "#5de1ff";
    ctx.fillRect(-46, 18, 92, 5);
    ctx.restore();
  }

  function drawTrainingSpot(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#ff4fc3";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-28, 2);
    ctx.lineTo(28, 2);
    ctx.stroke();
    ctx.fillStyle = "#5de1ff";
    ctx.fillRect(-42, -10, 14, 24);
    ctx.fillRect(28, -10, 14, 24);
    ctx.restore();
  }

  function drawMoonbot(time, phase) {
    if (phase.locomotion === "sleep") {
      drawSleepingMoonbot(state.x, state.y, time);
      return;
    }

    const moveBob = ["walk", "run", "play", "train"].includes(phase.locomotion)
      ? Math.sin(time / (phase.locomotion === "run" ? 70 : 110)) * 7
      : Math.sin(time / 420) * 2;
    const hop = phase.locomotion === "play" ? Math.max(0, Math.sin(time / 180)) * 18 : 0;
    const jump = phase.locomotion === "jump" ? Math.max(0, Math.sin(time / 180)) * 24 : 0;
    drawStandingMoonbot(state.x, state.y - hop - jump + moveBob, time, phase.locomotion);
  }

  function drawStandingMoonbot(x, y, time, locomotion) {
    const eyePulse = 0.75 + (Math.sin(time / 180) + 1) * 0.15;
    const armSwing = ["walk", "run"].includes(locomotion) ? Math.sin(time / 100) * 12 : 0;
    const legSwing = ["walk", "run"].includes(locomotion) ? Math.sin(time / 90) * 13 : 0;
    const eatArm = locomotion === "eat" ? Math.sin(time / 160) * 8 - 16 : 0;
    const polish = locomotion === "clean" ? Math.sin(time / 120) * 12 : 0;
    const trainLift = locomotion === "train" ? Math.sin(time / 130) * 18 : 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(state.facing, 1);

    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 26, 68, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#edf4fa";
    roundRect(-34, -64, 70, 84, 30);
    ctx.fill();
    const bodyGlow = ctx.createLinearGradient(-34, -64, 30, 20);
    bodyGlow.addColorStop(0, "rgba(255,255,255,0.92)");
    bodyGlow.addColorStop(1, "rgba(190,208,220,0.28)");
    ctx.fillStyle = bodyGlow;
    roundRect(-28, -58, 48, 54, 20);
    ctx.fill();

    ctx.fillStyle = "#f7fbff";
    roundRect(-18, 8, 42, 60, 20);
    ctx.fill();

    ctx.fillStyle = "#dce7ef";
    roundRect(-33, 24 + armSwing + eatArm + polish - trainLift, 18, 46, 12);
    ctx.fill();
    roundRect(14, 24 - armSwing - trainLift, 18, 46, 12);
    ctx.fill();

    if (locomotion === "train") {
      ctx.strokeStyle = "#ff4fc3";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-44, 26 - trainLift);
      ctx.lineTo(42, 26 - trainLift);
      ctx.stroke();
    }

    ctx.fillStyle = "#e8f0f5";
    roundRect(-22 + legSwing * 0.25, 62, 24, 18, 8);
    ctx.fill();
    roundRect(8 - legSwing * 0.25, 62, 24, 18, 8);
    ctx.fill();

    ctx.fillStyle = "#111722";
    roundRect(-4, -32, 42, 34, 17);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 79, 195, ${eyePulse})`;
    ctx.fillRect(18, -18, 7, 10);

    if (locomotion === "eat") {
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.arc(48, -8 + Math.sin(time / 160) * 3, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    if (locomotion === "clean") {
      ctx.fillStyle = "rgba(93, 225, 255, 0.72)";
      for (let i = 0; i < 5; i += 1) {
        const bx = -48 + i * 18;
        const by = -28 - ((time / 12 + i * 13) % 52);
        ctx.beginPath();
        ctx.arc(bx, by, 4 + (i % 2) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (locomotion === "play") {
      ctx.strokeStyle = "rgba(255, 79, 195, 0.75)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -16, 54, -0.4, 0.7);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawSleepingMoonbot(x, y, time) {
    ctx.save();
    ctx.translate(x, y + 18);
    ctx.scale(state.facing, 1);
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 48, 78, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5f9fc";
    ctx.beginPath();
    ctx.ellipse(8, 12, 62, 35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#101722";
    roundRect(36, -2, 38, 24, 12);
    ctx.fill();
    ctx.fillStyle = "#ff4fc3";
    ctx.fillRect(48, 8, 18, 3);
    ctx.fillStyle = "#dfe9f0";
    ctx.beginPath();
    ctx.ellipse(-44, 34, 28, 18, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff4fc3";
    ctx.font = "bold 22px system-ui";
    ctx.fillText("Z", 76, -22 - Math.sin(time / 360) * 5);
    ctx.font = "bold 16px system-ui";
    ctx.fillText("z", 100, -38 - Math.sin(time / 420) * 4);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function frame(time) {
    const phase = updateAction(time);
    drawStage(time);
    drawProps(time);
    drawMoonbot(time, phase);
    requestAnimationFrame(frame);
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => startAction(button.dataset.action));
  });

  startAction("idle");
  requestAnimationFrame(frame);
})();
