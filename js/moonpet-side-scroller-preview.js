(() => {
  const canvas = document.getElementById("moonbot-stage");
  const ctx = canvas.getContext("2d");
  const buttons = Array.from(document.querySelectorAll("[data-action]"));
  const debugMode = document.getElementById("debug-mode");
  const debugPhase = document.getElementById("debug-phase");
  const debugPosition = document.getElementById("debug-position");

  const spots = {
    start: 170,
    center: 470,
    food: 790,
    toy: 180,
    clean: 720,
    bed: 135,
    train: 820
  };

  const state = {
    action: "idle",
    phase: "idle",
    x: spots.center,
    y: 370,
    facing: 1,
    flow: [],
    phaseIndex: 0,
    phaseStartedAt: performance.now(),
    fromX: spots.center,
    toX: spots.center,
    giantFoodActive: false,
    swallowedAt: 0
  };

  const flows = {
    idle: [
      { phase: "idle", to: "center", duration: Infinity, locomotion: "idle" }
    ],
    eat: [
      { phase: "detect_food", to: "start", duration: 520, locomotion: "alert" },
      { phase: "walk_to_food", to: "food", duration: 1850, locomotion: "walk" },
      { phase: "giant_food_event", to: "food", duration: 1050, locomotion: "surprised" },
      { phase: "eat", to: "food", duration: 1500, locomotion: "eat" },
      { phase: "happy_reaction", to: "food", duration: 720, locomotion: "happy" },
      { phase: "return_idle", to: "center", duration: 1550, locomotion: "walk" },
      { phase: "idle", to: "center", duration: Infinity, locomotion: "idle" }
    ],
    play: [
      { phase: "run_to_toy", to: "toy", duration: 950, locomotion: "run" },
      { phase: "bounce_play", to: "toy", duration: 2350, locomotion: "play" },
      { phase: "return_idle", to: "center", duration: 1150, locomotion: "run" },
      { phase: "idle", to: "center", duration: Infinity, locomotion: "idle" }
    ],
    clean: [
      { phase: "walk_to_clean_spot", to: "clean", duration: 1500, locomotion: "walk" },
      { phase: "bubble_polish", to: "clean", duration: 2450, locomotion: "clean" },
      { phase: "shine_reaction", to: "clean", duration: 700, locomotion: "happy" },
      { phase: "return_idle", to: "center", duration: 1450, locomotion: "walk" },
      { phase: "idle", to: "center", duration: Infinity, locomotion: "idle" }
    ],
    sleep: [
      { phase: "walk_to_bed", to: "bed", duration: 1800, locomotion: "walk" },
      { phase: "sleep", to: "bed", duration: Infinity, locomotion: "sleep" }
    ],
    train: [
      { phase: "walk_to_training_spot", to: "train", duration: 1750, locomotion: "walk" },
      { phase: "lift_train", to: "train", duration: 2600, locomotion: "train" },
      { phase: "success_reaction", to: "train", duration: 760, locomotion: "happy" },
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
    state.giantFoodActive = action === "eat";
    state.swallowedAt = 0;
    if (state.toX !== state.x) state.facing = state.toX > state.x ? 1 : -1;
    setActiveButton(action);
  }

  function advancePhase(now) {
    const current = state.flow[state.phaseIndex];
    if (!current || current.duration === Infinity) return current;
    if (now - state.phaseStartedAt < current.duration) return current;

    state.x = state.toX;
    state.phaseIndex = Math.min(state.phaseIndex + 1, state.flow.length - 1);
    const next = state.flow[state.phaseIndex];
    state.phaseStartedAt = now;
    state.fromX = state.x;
    state.toX = spots[next.to] || spots.center;
    state.phase = next.phase;
    if (state.toX !== state.x) state.facing = state.toX > state.x ? 1 : -1;
    if (next.phase === "giant_food_event") state.swallowedAt = now + 520;
    if (next.phase === "idle") {
      state.action = "idle";
      state.giantFoodActive = false;
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
    state.x = clamp(state.x, 90, 860);
    debugMode.textContent = state.action;
    debugPhase.textContent = current.phase;
    debugPosition.textContent = `${Math.round(state.x)}px`;
    return current;
  }

  function drawStage(time) {
    const w = canvas.width;
    const h = canvas.height;
    const pulse = (Math.sin(time / 620) + 1) / 2;
    ctx.clearRect(0, 0, w, h);

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#111a34");
    sky.addColorStop(0.55, "#151328");
    sky.addColorStop(1, "#070910");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(247, 250, 255, 0.92)";
    ctx.beginPath();
    ctx.arc(655, 72, 42, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 12; i += 1) {
      const x = i * 88 - 10;
      const bh = 78 + (i % 5) * 25;
      ctx.fillStyle = i % 2 ? "#111a2a" : "#172137";
      ctx.fillRect(x, 328 - bh, 62, bh);
      ctx.fillStyle = i % 3 ? "#5de1ff" : "#ff4fc3";
      for (let y = 342 - bh; y < 310; y += 20) {
        ctx.fillRect(x + 10, y, 7, 5);
        ctx.fillRect(x + 36, y + 8, 7, 5);
      }
    }

    drawSign(38, 132, "MOONBOYS");
    drawSign(575, 124, "PLAY\\nCOLLECT\\nREPEAT");
    drawBillboard(725, 226, "TRAIN\\nLEVEL UP");

    ctx.fillStyle = "#101823";
    ctx.fillRect(0, 385, w, 155);
    ctx.fillStyle = "#25314a";
    ctx.fillRect(0, 380, w, 12);
    ctx.fillStyle = `rgba(255, 79, 195, ${0.45 + pulse * 0.25})`;
    ctx.fillRect(0, 395, w, 5);
    ctx.fillStyle = `rgba(93, 225, 255, ${0.26 + pulse * 0.24})`;
    ctx.fillRect(0, 404, w, 2);

    ctx.strokeStyle = `rgba(93, 225, 255, ${0.13 + pulse * 0.12})`;
    ctx.lineWidth = 2;
    for (let x = -70; x < w + 140; x += 84) {
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

  function drawSign(x, y, text) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(19, 29, 42, 0.9)";
    roundRect(0, 0, 150, 74, 8);
    ctx.fill();
    ctx.strokeStyle = "#5de1ff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#ff4fc3";
    ctx.font = "bold 18px system-ui";
    text.split("\\n").forEach((line, index) => ctx.fillText(line, 14, 28 + index * 20));
    ctx.restore();
  }

  function drawBillboard(x, y, text) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(19, 29, 42, 0.92)";
    roundRect(0, 0, 130, 68, 8);
    ctx.fill();
    ctx.strokeStyle = "#ff4fc3";
    ctx.stroke();
    ctx.fillStyle = "#5de1ff";
    ctx.font = "bold 16px system-ui";
    text.split("\\n").forEach((line, index) => ctx.fillText(line, 14, 26 + index * 20));
    ctx.restore();
  }

  function drawProps(time, phase) {
    drawFoodZone(time, phase);
    drawToyZone(time, phase);
    drawCleanZone(time, phase);
    drawBed(spots.bed, 380);
    drawTrainingSpot(spots.train, 380, time, phase);
    if (phase.phase === "play" || phase.phase === "bounce_play") drawFlyingToy(time);
    if (state.action === "eat") drawFoodDrones(time, phase);
  }

  function drawFoodZone(time, phase) {
    const x = spots.food;
    const y = 381;
    drawSoda(x + 78, y - 42, 0.9);
    drawPizza(x - 78, y - 18, 0.95);
    drawHotdog(x - 40, y - 6, 0.9);
    const giant = phase.phase === "giant_food_event";
    const scale = giant ? 2.7 + Math.sin(time / 110) * 0.12 : 1.12;
    drawBurger(x + (giant ? -34 : 0), y - (giant ? 66 : 10), scale, giant);
    if (phase.phase === "eat") drawDonut(x + 54, y - 16, 0.8 + Math.sin(time / 140) * 0.08);
  }

  function drawToyZone(time, phase) {
    const active = phase.phase === "bounce_play" || phase.phase === "run_to_toy";
    const bounce = active ? Math.abs(Math.sin(time / 150)) * 34 : Math.sin(time / 260) * 5;
    drawBeachBall(spots.toy, 360 - bounce, active ? 1.35 : 1.05);
    drawToyCar(spots.toy - 78, 390, 0.9);
  }

  function drawCleanZone(time, phase) {
    const active = phase.phase === "bubble_polish" || phase.phase === "shine_reaction";
    drawSponge(spots.clean + 62, 392, 1);
    drawSoap(spots.clean - 62, 376, 1);
    if (active) {
      for (let i = 0; i < 16; i += 1) {
        const bx = spots.clean - 95 + i * 13;
        const by = 360 - ((time / 11 + i * 17) % 95);
        drawBubble(bx, by, 5 + (i % 4) * 2);
      }
    }
  }

  function drawTrainingSpot(x, y, time, phase) {
    drawDumbbell(x + 44, y - 2, 1.15);
    if (phase.phase === "lift_train") {
      const punch = Math.sin(time / 160) * 8;
      ctx.save();
      ctx.translate(x - 64, y - 78 + punch);
      ctx.fillStyle = "#ff4fc3";
      roundRect(-18, 0, 36, 64, 16);
      ctx.fill();
      ctx.strokeStyle = "#5de1ff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFoodDrones(time, phase) {
    const active = phase.phase === "detect_food" || phase.phase === "walk_to_food" || phase.phase === "giant_food_event";
    if (!active) return;
    const baseY = 170 + Math.sin(time / 220) * 12;
    drawDrone(190 + Math.sin(time / 260) * 35, baseY, "burger");
    drawDrone(485 + Math.sin(time / 240 + 1) * 44, baseY + 22, "pizza");
    drawDrone(715 + Math.sin(time / 210 + 2) * 32, baseY - 8, "soda");
  }

  function drawFlyingToy(time) {
    drawBeachBall(430 + Math.sin(time / 240) * 130, 245 + Math.cos(time / 160) * 42, 0.75);
    drawDonut(595 + Math.cos(time / 250) * 92, 285 + Math.sin(time / 180) * 26, 0.55);
  }

  function drawMoonbot(time, phase) {
    const swallowed = phase.phase === "giant_food_event" && state.swallowedAt && time > state.swallowedAt && time < state.swallowedAt + 390;
    if (swallowed) {
      drawSwallowedHint(state.x, state.y, time);
      return;
    }
    if (phase.locomotion === "sleep") {
      drawSleepingMoonbot(state.x, state.y, time);
      return;
    }

    const moveBob = ["walk", "run", "play", "train"].includes(phase.locomotion)
      ? Math.sin(time / (phase.locomotion === "run" ? 62 : 100)) * 10
      : Math.sin(time / 380) * 3;
    const hop = phase.locomotion === "play" ? Math.max(0, Math.sin(time / 170)) * 34 : 0;
    drawStandingMoonbot(state.x, state.y - hop + moveBob, time, phase.locomotion);
  }

  function drawStandingMoonbot(x, y, time, locomotion) {
    const eyePulse = 0.72 + (Math.sin(time / 170) + 1) * 0.16;
    const armSwing = ["walk", "run"].includes(locomotion) ? Math.sin(time / 90) * 18 : 0;
    const legSwing = ["walk", "run"].includes(locomotion) ? Math.sin(time / 80) * 16 : 0;
    const eatArm = locomotion === "eat" ? Math.sin(time / 140) * 13 - 22 : 0;
    const polish = locomotion === "clean" ? Math.sin(time / 100) * 14 : 0;
    const trainLift = locomotion === "train" ? Math.sin(time / 115) * 26 : 0;
    const happyHop = locomotion === "happy" ? Math.abs(Math.sin(time / 150)) * 20 : 0;

    ctx.save();
    ctx.translate(x, y - happyHop);
    ctx.scale(state.facing, 1);

    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.beginPath();
    ctx.ellipse(4, 44, 86, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f0f6fb";
    roundRect(-52, -118, 114, 120, 48);
    ctx.fill();
    const headGlow = ctx.createLinearGradient(-52, -118, 48, -10);
    headGlow.addColorStop(0, "rgba(255,255,255,0.95)");
    headGlow.addColorStop(1, "rgba(186,205,218,0.24)");
    ctx.fillStyle = headGlow;
    roundRect(-42, -108, 72, 70, 34);
    ctx.fill();

    ctx.fillStyle = "#f8fbff";
    roundRect(-26, 2, 58, 76, 26);
    ctx.fill();

    ctx.fillStyle = "#dce8ef";
    roundRect(-52, 22 + armSwing + eatArm + polish - trainLift, 24, 60, 14);
    ctx.fill();
    roundRect(24, 22 - armSwing - trainLift, 24, 60, 14);
    ctx.fill();

    if (locomotion === "train") drawDumbbell(0, 22 - trainLift, 0.85);

    ctx.fillStyle = "#e8f0f5";
    roundRect(-32 + legSwing * 0.25, 72, 34, 24, 10);
    ctx.fill();
    roundRect(10 - legSwing * 0.25, 72, 34, 24, 10);
    ctx.fill();

    ctx.fillStyle = "#101722";
    roundRect(0, -68, 58, 42, 20);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 79, 195, ${eyePulse})`;
    if (locomotion === "happy") {
      ctx.fillRect(24, -50, 8, 8);
      ctx.fillRect(38, -50, 8, 8);
    } else {
      ctx.fillRect(30, -54, 9, 13);
    }

    if (locomotion === "eat") drawBurger(70, -24 + Math.sin(time / 140) * 5, 0.5, false);
    if (locomotion === "clean") {
      for (let i = 0; i < 8; i += 1) drawBubble(-70 + i * 20, -62 - ((time / 12 + i * 15) % 80), 5 + (i % 3));
    }
    if (locomotion === "play") {
      ctx.strokeStyle = "rgba(255, 79, 195, 0.8)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, -28, 72, -0.6, 0.8);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawSleepingMoonbot(x, y, time) {
    ctx.save();
    ctx.translate(x, y + 34);
    ctx.scale(state.facing, 1);
    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.beginPath();
    ctx.ellipse(0, 54, 98, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f7fbff";
    ctx.beginPath();
    ctx.ellipse(10, 12, 82, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#101722";
    roundRect(42, -2, 50, 30, 14);
    ctx.fill();
    ctx.fillStyle = "#ff4fc3";
    ctx.fillRect(56, 10, 24, 4);
    ctx.fillStyle = "#dfe9f0";
    ctx.beginPath();
    ctx.ellipse(-58, 42, 38, 22, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff4fc3";
    ctx.font = "bold 28px system-ui";
    ctx.fillText("Z", 95, -34 - Math.sin(time / 360) * 6);
    ctx.font = "bold 19px system-ui";
    ctx.fillText("z", 128, -54 - Math.sin(time / 420) * 5);
    ctx.restore();
  }

  function drawSwallowedHint(x, y, time) {
    ctx.save();
    ctx.translate(x, y - 64);
    ctx.fillStyle = "#ff4fc3";
    ctx.font = "bold 28px system-ui";
    ctx.fillText("NOM!", -42, -72 + Math.sin(time / 90) * 4);
    ctx.restore();
  }

  function drawBurger(x, y, scale, giant) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#f4a52d";
    ctx.beginPath();
    ctx.ellipse(0, -16, 42, 22, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    for (let i = -22; i <= 22; i += 14) ctx.fillRect(i, -31, 4, 4);
    ctx.fillStyle = "#35d06f";
    ctx.fillRect(-38, -13, 76, 8);
    ctx.fillStyle = "#7a3b1f";
    ctx.fillRect(-34, -5, 68, 14);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(-36, 8, 72, 8);
    ctx.fillStyle = "#f0a033";
    ctx.beginPath();
    ctx.ellipse(0, 20, 40, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    if (giant) {
      ctx.fillStyle = "#101722";
      ctx.beginPath();
      ctx.arc(-16, -14, 8, 0, Math.PI * 2);
      ctx.arc(16, -14, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f7c6d9";
      ctx.beginPath();
      ctx.ellipse(0, 4, 24, 11, 0, 0, Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPizza(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffcf5a";
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(42, 34);
    ctx.lineTo(-34, 20);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#e74d45";
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.fillStyle = "#ff4fc3";
    ctx.beginPath();
    ctx.arc(6, -2, 5, 0, Math.PI * 2);
    ctx.arc(20, 16, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHotdog(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#e69a36";
    roundRect(-42, -12, 84, 24, 12);
    ctx.fill();
    ctx.fillStyle = "#b84b31";
    roundRect(-34, -8, 68, 16, 8);
    ctx.fill();
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-28, -2);
    for (let i = -20; i < 32; i += 12) ctx.lineTo(i, i % 24 === 0 ? 5 : -5);
    ctx.stroke();
    ctx.restore();
  }

  function drawSoda(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#5de1ff";
    roundRect(-16, -32, 32, 58, 8);
    ctx.fill();
    ctx.fillStyle = "#ff4fc3";
    ctx.fillRect(-12, -5, 24, 17);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(2, -34);
    ctx.lineTo(20, -54);
    ctx.stroke();
    ctx.restore();
  }

  function drawDonut(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#d58b36";
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff4fc3";
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#101722";
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBeachBall(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#f7fbff";
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff4fc3";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 28, -0.2, 1.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5de1ff";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 28, 2.2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawToyCar(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ff4fc3";
    roundRect(-38, -20, 76, 30, 10);
    ctx.fill();
    ctx.fillStyle = "#5de1ff";
    roundRect(-18, -34, 32, 18, 8);
    ctx.fill();
    ctx.fillStyle = "#111823";
    ctx.beginPath();
    ctx.arc(-22, 12, 9, 0, Math.PI * 2);
    ctx.arc(24, 12, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSponge(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffd166";
    roundRect(-26, -14, 52, 28, 8);
    ctx.fill();
    ctx.fillStyle = "#ff4fc3";
    for (let i = -16; i <= 16; i += 16) {
      ctx.beginPath();
      ctx.arc(i, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSoap(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#5de1ff";
    roundRect(-20, -12, 40, 24, 10);
    ctx.fill();
    ctx.fillStyle = "#f7fbff";
    ctx.fillRect(-10, -2, 20, 4);
    ctx.restore();
  }

  function drawDumbbell(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = "#ff4fc3";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-44, 0);
    ctx.lineTo(44, 0);
    ctx.stroke();
    ctx.fillStyle = "#5de1ff";
    ctx.fillRect(-58, -18, 18, 36);
    ctx.fillRect(40, -18, 18, 36);
    ctx.restore();
  }

  function drawBed(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#263244";
    roundRect(-70, -18, 140, 48, 12);
    ctx.fill();
    ctx.fillStyle = "#ff4fc3";
    roundRect(-65, -36, 48, 28, 12);
    ctx.fill();
    ctx.fillStyle = "#5de1ff";
    ctx.fillRect(-70, 22, 140, 6);
    ctx.restore();
  }

  function drawBubble(x, y, r) {
    ctx.save();
    ctx.strokeStyle = "rgba(93, 225, 255, 0.78)";
    ctx.fillStyle = "rgba(93, 225, 255, 0.16)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawDrone(x, y, type) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#5de1ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-24, -16);
    ctx.lineTo(24, -16);
    ctx.stroke();
    ctx.fillStyle = "#ff4fc3";
    ctx.beginPath();
    ctx.arc(-28, -16, 8, 0, Math.PI * 2);
    ctx.arc(28, -16, 8, 0, Math.PI * 2);
    ctx.fill();
    if (type === "pizza") drawPizza(0, 10, 0.48);
    else if (type === "soda") drawSoda(0, 16, 0.55);
    else drawBurger(0, 12, 0.48, false);
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
    drawProps(time, phase);
    drawMoonbot(time, phase);
    requestAnimationFrame(frame);
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => startAction(button.dataset.action));
  });

  startAction("idle");
  requestAnimationFrame(frame);
})();
