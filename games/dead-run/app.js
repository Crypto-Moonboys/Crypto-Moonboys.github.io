(() => {
  'use strict';

  const tg = window.Telegram?.WebApp || null;
  const API_BASE = (window.MOONBOYS_API?.BASE_URL || 'https://api.cryptomoonboys.com').replace(/\/$/, '');
  const DEFAULT_POS = { lat: 51.5074, lng: -0.1278 };
  const PICKUP_CLIENT_RADIUS_M = 18;
  const ZOMBIE_KILL_RADIUS_M = 15;
  const CHARGE_METERS = 300;
  const MAX_AMMO = 6;

  try {
    tg?.ready();
    tg?.expand();
    tg?.setHeaderColor?.('#05070a');
    tg?.setBackgroundColor?.('#05070a');
  } catch (_) {}

  const $ = (id) => document.getElementById(id);
  const ui = {
    time: $('timeText'), timeLabel: $('timeLabel'), distance: $('distanceText'), nearest: $('nearestText'), ammo: $('ammoText'),
    chargeFill: $('chargeFill'), shove: $('shoveBtn'), banner: $('banner'), start: $('startPanel'), gameOver: $('gameOverPanel'),
    gameOverTitle: $('gameOverTitle'), finalStats: $('finalStats'), xpResult: $('xpResult'), slowCount: $('slowCount'), gpsStatus: $('gpsStatus'),
    account: $('accountStrip'), horde: $('hordeStrip'), risk: $('riskBadge'), safety: $('safetyCheck'), resume: $('resumeBtn'),
    leaderboard: $('leaderboardPanel'), leaderboardRows: $('leaderboardRows')
  };

  let map;
  let mapLoaded = false;
  let playerMarker;
  let routeWaypointMarkers = [];
  let pickupMarkers = [];
  let zombieMarkers = [];
  let watchId = null;
  let wakeLock = null;
  let player = { ...DEFAULT_POS };
  let gameActive = false;
  let demoMode = false;
  let session = null;
  let profile = null;
  let activeSessionFromProfile = null;
  let serverState = null;
  let routePlan = null;
  let combatPlan = null;
  let difficulty = null;
  let zombies = [];
  let pickups = [];
  let slowUntilLocal = 0;
  let hordeStarted = false;
  let gameLoop = 0;
  let timeTimer = 0;
  let lastTickAt = 0;
  let startTimeMs = 0;
  let finishInFlight = false;
  let telemetryQueue = [];
  let telemetryTimer = 0;
  let gpsSeq = 1;
  let demoDistance = 0;
  let demoAmmo = 3;
  let demoCharge = 0;
  let demoSlow = 0;
  let demoKills = 0;
  let demoCrates = 0;
  let demoShoves = 0;
  let collectedPending = new Set();
  let actionBusy = new Set();
  let leaderboardMetric = 'score';

  function initData() {
    return String(tg?.initData || new URLSearchParams(location.hash.replace(/^#/, '')).get('tgWebAppData') || '');
  }

  function haptic(kind = 'impact') {
    try {
      if (kind === 'success') tg?.HapticFeedback?.notificationOccurred('success');
      else if (kind === 'error') tg?.HapticFeedback?.notificationOccurred('error');
      else tg?.HapticFeedback?.impactOccurred('medium');
    } catch (_) {}
  }

  function setBanner(text, ms = 1700) {
    ui.banner.textContent = text;
    ui.banner.classList.remove('hidden');
    clearTimeout(setBanner.timer);
    setBanner.timer = setTimeout(() => ui.banner.classList.add('hidden'), ms);
  }

  function actionId(prefix) {
    const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}:${id}`;
  }

  async function apiPost(path, payload = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init_data: initData(), ...payload }),
      cache: 'no-store',
    });
    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok || !data?.ok) {
      const error = new Error(data?.detail || data?.error || `HTTP ${response.status}`);
      error.code = data?.error || `http_${response.status}`;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function apiGet(path) {
    const response = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  function toRad(value) { return value * Math.PI / 180; }
  function toDeg(value) { return value * 180 / Math.PI; }
  function distanceMeters(a, b) {
    const R = 6371000;
    const dLat = toRad(Number(b.lat) - Number(a.lat));
    const dLng = toRad(Number(b.lng) - Number(a.lng));
    const lat1 = toRad(Number(a.lat));
    const lat2 = toRad(Number(b.lat));
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function movePoint(origin, bearingDeg, meters) {
    const R = 6371000;
    const bearing = toRad(bearingDeg);
    const lat1 = toRad(origin.lat);
    const lon1 = toRad(origin.lng);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(meters / R) + Math.cos(lat1) * Math.sin(meters / R) * Math.cos(bearing));
    const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(meters / R) * Math.cos(lat1), Math.cos(meters / R) - Math.sin(lat1) * Math.sin(lat2));
    return { lat: toDeg(lat2), lng: toDeg(lon2) };
  }
  function bearingBetween(a, b) {
    const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
    const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }
  function randomPointAround(origin, minM, maxM) {
    return movePoint(origin, Math.random() * 360, minM + Math.random() * (maxM - minM));
  }

  function makeMap() {
    map = new maplibregl.Map({
      container: 'map',
      center: [player.lng, player.lat],
      zoom: 16.5,
      pitch: 0,
      bearing: 0,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -1, 'raster-contrast': 0.28, 'raster-brightness-max': 0.6 } }]
      }
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.on('load', () => {
      mapLoaded = true;
      initPlayerMarker();
      renderRouteLine();
    });
  }

  function initPlayerMarker() {
    if (playerMarker || !mapLoaded) return;
    const el = document.createElement('div');
    el.className = 'player-marker';
    playerMarker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([player.lng, player.lat]).addTo(map);
  }

  function markerElement(className, text) {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    return el;
  }

  function clearRouteVisuals() {
    routeWaypointMarkers.forEach((marker) => marker.remove());
    routeWaypointMarkers = [];
    if (mapLoaded && map.getLayer('dead-run-route')) map.removeLayer('dead-run-route');
    if (mapLoaded && map.getSource('dead-run-route')) map.removeSource('dead-run-route');
  }

  function renderRouteLine() {
    if (!mapLoaded || !routePlan?.waypoints?.length) return;
    clearRouteVisuals();
    const coords = [[player.lng, player.lat], ...routePlan.waypoints.map((point) => [point.lng, point.lat])];
    map.addSource('dead-run-route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({ id: 'dead-run-route', type: 'line', source: 'dead-run-route', paint: { 'line-color': '#37f3ff', 'line-opacity': 0.35, 'line-width': 3, 'line-dasharray': [2, 2] } });
    routePlan.waypoints.forEach((point) => {
      const el = document.createElement('div');
      el.className = 'route-waypoint';
      routeWaypointMarkers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([point.lng, point.lat]).addTo(map));
    });
  }

  function clearWorld() {
    zombieMarkers.forEach((marker) => marker.remove());
    zombieMarkers = [];
    pickupMarkers.forEach((marker) => marker.remove());
    pickupMarkers = [];
    clearRouteVisuals();
    zombies = [];
    pickups = [];
    collectedPending.clear();
    actionBusy.clear();
  }

  function buildPickupMarkers() {
    pickupMarkers.forEach((marker) => marker.remove());
    pickupMarkers = [];
    const collected = new Set(serverState?.collected_targets || []);
    pickups = (routePlan?.pickups || []).map((pickup) => ({ ...pickup, active: !collected.has(pickup.id), marker: null }));
    pickups.forEach((pickup) => {
      if (!pickup.active) return;
      const el = markerElement(`pickup-marker ${pickup.type}`, pickup.type === 'ammo' ? '▣' : '⌛');
      pickup.marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([pickup.lng, pickup.lat]).addTo(map);
      pickupMarkers.push(pickup.marker);
    });
  }

  function activateWave(waveIndex) {
    zombieMarkers.forEach((marker) => marker.remove());
    zombieMarkers = [];
    const killed = new Set(serverState?.killed_targets || []);
    const wave = combatPlan?.waves?.[waveIndex];
    if (!wave) {
      setBanner('ALL SERVER WAVES CLEARED', 2400);
      zombies = [];
      return;
    }
    zombies = wave.zombies.map((source) => ({
      ...source,
      pos: { lat: Number(source.lat), lng: Number(source.lng) },
      alive: !killed.has(source.id),
      marker: null,
      el: null,
    }));
    zombies.forEach((zombie) => {
      if (!zombie.alive) return;
      const el = markerElement('zombie-marker', '☠');
      zombie.el = el;
      el.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        shootZombie(zombie);
      });
      zombie.marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([zombie.pos.lng, zombie.pos.lat]).addTo(map);
      zombieMarkers.push(zombie.marker);
    });
  }

  function applySessionPayload(payload) {
    session = payload;
    serverState = { ...(payload.state || {}) };
    routePlan = payload.route || null;
    combatPlan = payload.combat || null;
    difficulty = payload.difficulty || { tier: 1, base_speed_mps: 1.45 };
    startTimeMs = Date.parse(payload.started_at) || Date.now();
    hordeStarted = Date.now() - startTimeMs >= Number(payload.head_start_seconds || 60) * 1000;
    demoMode = false;
    gameActive = true;
    slowUntilLocal = Number(serverState.slow_until_ms) || 0;
    ui.start.classList.add('hidden');
    ui.gameOver.classList.add('hidden');
    ui.risk.classList.remove('hidden');
    if (routePlan?.waypoints?.length) renderRouteLine();
    buildPickupMarkers();
    if (hordeStarted) activateWave(Number(serverState.current_wave) || 0);
    updateHud();
    updateTime();
    startLoops();
  }

  function demoState() {
    return {
      ammo: demoAmmo,
      slow_inventory: demoSlow,
      charge_m: demoCharge,
      charge_ratio: Math.min(1, demoCharge / CHARGE_METERS),
      verified_distance_m: demoDistance,
      kills: demoKills,
      crates: demoCrates,
      shove_count: demoShoves,
      current_wave: 0,
      suspicious_points: 0,
      risk: 'demo',
    };
  }

  function currentState() { return demoMode ? demoState() : (serverState || {}); }

  function updateHud() {
    const state = currentState();
    const distance = Math.max(0, Number(state.verified_distance_m) || 0);
    ui.distance.textContent = distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(2)} km`;
    ui.ammo.textContent = `×${Math.max(0, Number(state.ammo) || 0)}`;
    ui.slowCount.textContent = Math.max(0, Number(state.slow_inventory) || 0);
    const ratio = Math.min(1, Math.max(0, Number(state.charge_ratio) || Number(state.charge_m) / CHARGE_METERS || 0));
    ui.chargeFill.style.height = `${Math.round(ratio * 100)}%`;
    ui.shove.disabled = !gameActive || ratio < 0.999;
    ui.shove.classList.toggle('ready', ratio >= 0.999);
    if (!demoMode) {
      const risk = String(state.risk || 'clean').toUpperCase();
      ui.risk.textContent = `GPS: ${risk}`;
      ui.risk.style.borderColor = risk === 'CLEAN' ? 'rgba(60,255,87,.5)' : risk === 'WATCH' ? 'rgba(255,201,61,.7)' : 'rgba(255,54,85,.75)';
    }
    const alive = zombies.filter((zombie) => zombie.alive);
    if (!hordeStarted) ui.nearest.textContent = '—';
    else if (!alive.length) ui.nearest.textContent = 'CLEAR';
    else ui.nearest.textContent = `${Math.round(Math.min(...alive.map((zombie) => distanceMeters(player, zombie.pos))))}m`;
  }

  function updateTime() {
    if (!gameActive) return;
    const headStartSeconds = Number(session?.head_start_seconds || 60);
    const elapsed = Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000));
    if (elapsed < headStartSeconds) {
      const left = headStartSeconds - elapsed;
      ui.time.textContent = `00:${String(left).padStart(2, '0')}`;
      ui.timeLabel.textContent = 'HEAD START';
      return;
    }
    if (!hordeStarted) {
      hordeStarted = true;
      if (demoMode) spawnDemoWave();
      else activateWave(Number(currentState().current_wave) || 0);
      setBanner('HORDE SPAWNED — RUN', 2600);
      haptic('error');
    }
    const survived = elapsed - headStartSeconds;
    const minutes = Math.floor(survived / 60);
    const seconds = survived % 60;
    ui.time.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    ui.timeLabel.textContent = 'SURVIVAL';
  }

  async function requestWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
  }

  function gpsFixFromPosition(position) {
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy_m: position.coords.accuracy || 10,
      speed_mps: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
      heading_deg: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
      timestamp_ms: position.timestamp || Date.now(),
    };
  }

  function getInitialGpsFix() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation is not supported on this device.'));
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(gpsFixFromPosition(position)),
        (error) => reject(new Error(error.message || 'Location permission was not granted.')),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    });
  }

  function startGpsWatch() {
    if (watchId != null || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(onGpsPosition, (error) => {
      ui.gpsStatus.textContent = `GPS: ${error.message || 'location unavailable'}`;
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 });
  }

  function stopGpsWatch() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  function onGpsPosition(position) {
    const fix = gpsFixFromPosition(position);
    player = { lat: fix.lat, lng: fix.lng };
    initPlayerMarker();
    playerMarker?.setLngLat([player.lng, player.lat]);
    if (gameActive) map.easeTo({ center: [player.lng, player.lat], duration: 320 });
    if (!demoMode && gameActive) {
      telemetryQueue.push({
        seq: gpsSeq++, timestamp_ms: fix.timestamp_ms, lat: fix.lat, lng: fix.lng,
        accuracy_m: fix.accuracy_m, speed_mps: fix.speed_mps, heading_deg: fix.heading_deg,
      });
      if (telemetryQueue.length >= 5) flushTelemetry();
    }
    checkPickups();
    updateHud();
  }

  let _telemetryInFlight = Promise.resolve();

  async function flushTelemetry(force = false) {
    if (demoMode || (!gameActive && !force) || !session?.session_id || telemetryQueue.length === 0) return;
    if (!force && telemetryQueue.length < 2) return;
    // Serialize flushes so batches always reach the server in sequence order.
    _telemetryInFlight = _telemetryInFlight.then(async () => {
      if (demoMode || (!gameActive && !force) || !session?.session_id || telemetryQueue.length === 0) return;
      const samples = telemetryQueue.splice(0, 20);
      try {
        const data = await apiPost('/api/dead-run/session/telemetry', { session_id: session.session_id, samples });
        serverState = {
          ...serverState,
          verified_distance_m: data.verified_distance_m ?? serverState.verified_distance_m,
          charge_m: data.charge_m ?? serverState.charge_m,
          charge_ratio: data.charge_ratio ?? serverState.charge_ratio,
          suspicious_points: data.suspicious_points ?? serverState.suspicious_points,
          risk: data.risk ?? serverState.risk,
        };
        if (!data.ranked && session.ranked) {
          session.ranked = false;
          setBanner('RUN MOVED TO PRACTICE — GPS CHECK', 2400);
        }
        updateHud();
      } catch (error) {
        telemetryQueue = samples.concat(telemetryQueue).slice(-24);
        if (force) setBanner(`GPS SYNC: ${error.message}`, 2200);
      }
    });
    return _telemetryInFlight;
  }

  async function sendAction(action, targetId = '') {
    if (demoMode) return null;
    const key = `${action}:${targetId || 'self'}`;
    if (actionBusy.has(key)) return null;
    actionBusy.add(key);
    try {
      await flushTelemetry(true);
      const data = await apiPost('/api/dead-run/session/action', {
        session_id: session.session_id,
        action_id: actionId(action),
        action,
        target_id: targetId || undefined,
      });
      if (data.state) serverState = { ...serverState, ...data.state };
      updateHud();
      return data;
    } finally {
      actionBusy.delete(key);
    }
  }

  async function collectPickup(pickup) {
    if (!pickup.active || collectedPending.has(pickup.id)) return;
    collectedPending.add(pickup.id);
    try {
      if (demoMode) {
        pickup.active = false;
        pickup.marker?.remove();
        if (pickup.type === 'ammo') { demoAmmo = Math.min(MAX_AMMO, demoAmmo + 3); demoCrates += 1; setBanner('+3 AMMO'); }
        else { demoSlow += 1; setBanner('+1 SLOW TIME'); }
        haptic('success');
        return;
      }
      const data = await sendAction('pickup', pickup.id);
      if (!data) return;
      pickup.active = false;
      pickup.marker?.remove();
      serverState.collected_targets = [...new Set([...(serverState.collected_targets || []), pickup.id])];
      setBanner(pickup.type === 'ammo' ? '+3 AMMO' : '+1 SLOW TIME');
      haptic('success');
    } catch (error) {
      if (error.code !== 'pickup_too_far') setBanner(error.message, 1800);
    } finally {
      collectedPending.delete(pickup.id);
      updateHud();
    }
  }

  function checkPickups() {
    if (!gameActive) return;
    pickups.forEach((pickup) => {
      if (pickup.active && distanceMeters(player, pickup) <= PICKUP_CLIENT_RADIUS_M) collectPickup(pickup);
    });
  }

  async function shootZombie(zombie) {
    if (!gameActive || !hordeStarted || !zombie.alive) return;
    const state = currentState();
    if (Number(state.ammo) <= 0) { setBanner('OUT OF AMMO'); haptic('error'); return; }
    const visualDistance = distanceMeters(player, zombie.pos);
    if (visualDistance > 170) { setBanner('ZOMBIE OUT OF RANGE'); return; }
    try {
      if (demoMode) {
        demoAmmo -= 1;
        demoKills += 1;
      } else {
        const data = await sendAction('shoot', zombie.id);
        if (!data) return;
        serverState.killed_targets = [...new Set([...(serverState.killed_targets || []), zombie.id])];
      }
      zombie.alive = false;
      zombie.el?.classList.add('dead');
      setTimeout(() => zombie.marker?.remove(), 220);
      haptic();
      setBanner(`HIT — ${Math.max(0, Number(currentState().ammo) || 0)} BULLET${Number(currentState().ammo) === 1 ? '' : 'S'} LEFT`, 900);
      const alive = zombies.some((entry) => entry.alive);
      if (!alive) {
        const nextWave = demoMode ? 0 : Number(serverState.current_wave) || 0;
        setTimeout(() => {
          if (!gameActive) return;
          if (demoMode) spawnDemoWave();
          else activateWave(nextWave);
          setBanner('NEXT HORDE INCOMING', 1400);
        }, 2500);
      }
    } catch (error) {
      const messages = {
        slow_down_to_shoot: 'STOP BEFORE SHOOTING',
        stop_to_interact: 'STOP MOVING BEFORE USING CONTROLS',
        zombie_out_of_range: 'ZOMBIE OUT OF SERVER RANGE',
        shoot_rate_limited: 'TOO FAST — RESET YOUR AIM',
        ammo_empty: 'OUT OF AMMO',
      };
      setBanner(messages[error.code] || error.message, 1900);
      haptic('error');
    }
    updateHud();
  }

  async function useSlow() {
    if (!gameActive || Number(currentState().slow_inventory) <= 0) { setBanner('FIND AN HOURGLASS FIRST'); return; }
    try {
      if (demoMode) { demoSlow -= 1; slowUntilLocal = Math.max(Date.now(), slowUntilLocal) + 15000; }
      else {
        const data = await sendAction('slow');
        if (!data) return;
        slowUntilLocal = Number(data.state?.slow_until_ms) || Date.now() + 15000;
      }
      setBanner('HORDE SLOWED — 15 SEC', 1800);
      haptic('success');
    } catch (error) { setBanner(error.message, 1700); }
    updateHud();
  }

  async function shoveHorde() {
    if (!gameActive || Number(currentState().charge_ratio) < 0.999) return;
    try {
      if (demoMode) { demoCharge = Math.max(0, demoCharge - CHARGE_METERS); demoShoves += 1; }
      else {
        const data = await sendAction('shove');
        if (!data) return;
      }
      zombies.forEach((zombie) => {
        if (!zombie.alive) return;
        const bearing = bearingBetween(player, zombie.pos);
        zombie.pos = movePoint(zombie.pos, bearing, 120);
        zombie.marker?.setLngLat([zombie.pos.lng, zombie.pos.lat]);
      });
      setBanner('HORDE SHOVED BACK 120m', 1700);
      haptic('success');
    } catch (error) { setBanner(error.message, 1700); }
    updateHud();
  }

  function tick(now) {
    if (!gameActive) return;
    const dt = lastTickAt ? Math.min(2, (now - lastTickAt) / 1000) : 0;
    lastTickAt = now;

    if (demoMode && dt > 0) {
      const demoStep = movePoint(player, 40, 2.4 * dt);
      demoDistance += distanceMeters(player, demoStep);
      demoCharge = Math.min(CHARGE_METERS * 2, demoCharge + distanceMeters(player, demoStep));
      player = demoStep;
      playerMarker?.setLngLat([player.lng, player.lat]);
      checkPickups();
    }

    if (hordeStarted && dt > 0) {
      const slowFactor = Date.now() < Math.max(slowUntilLocal, Number(currentState().slow_until_ms) || 0) ? 0.42 : 1;
      for (const zombie of zombies) {
        if (!zombie.alive) continue;
        const distance = distanceMeters(zombie.pos, player);
        if (distance <= ZOMBIE_KILL_RADIUS_M) { finishRun('caught'); return; }
        const bearing = bearingBetween(zombie.pos, player);
        zombie.pos = movePoint(zombie.pos, bearing, Number(zombie.speed_mps || difficulty?.base_speed_mps || 1.5) * slowFactor * dt);
        zombie.marker?.setLngLat([zombie.pos.lng, zombie.pos.lat]);
      }
    }
    updateHud();
    gameLoop = requestAnimationFrame(tick);
  }

  function startLoops() {
    clearInterval(timeTimer);
    timeTimer = setInterval(updateTime, 250);
    clearInterval(telemetryTimer);
    telemetryTimer = setInterval(() => flushTelemetry(), 4000);
    cancelAnimationFrame(gameLoop);
    lastTickAt = 0;
    gameLoop = requestAnimationFrame(tick);
  }

  function stopLoops() {
    clearInterval(timeTimer);
    clearInterval(telemetryTimer);
    cancelAnimationFrame(gameLoop);
    timeTimer = 0;
    telemetryTimer = 0;
    gameLoop = 0;
  }

  function buildDemoWorld() {
    routePlan = {
      waypoints: Array.from({ length: 6 }, (_, index) => {
        const point = randomPointAround(player, 90 + index * 20, 150 + index * 35);
        return { id: `dwp${index}`, ...point };
      }),
      pickups: [],
    };
    routePlan.pickups = routePlan.waypoints.map((point, index) => ({ id: `dp${index}`, type: index % 3 === 2 ? 'slow' : 'ammo', lat: point.lat, lng: point.lng }));
    combatPlan = { waves: [] };
    for (let wave = 0; wave < 8; wave += 1) {
      combatPlan.waves.push({ index: wave, zombies: Array.from({ length: 7 + Math.floor(wave / 2) }, (_, index) => {
        const pos = randomPointAround(player, 220, 420);
        return { id: `dw${wave}z${index}`, wave, ...pos, speed_mps: 1.5 + wave * 0.08 + Math.random() * 0.2 };
      }) });
    }
    difficulty = { tier: 1, base_speed_mps: 1.5 };
    renderRouteLine();
    buildPickupMarkers();
  }

  let demoWaveIndex = 0;
  function spawnDemoWave() {
    const wave = combatPlan?.waves?.[demoWaveIndex % combatPlan.waves.length];
    demoWaveIndex += 1;
    zombieMarkers.forEach((marker) => marker.remove());
    zombieMarkers = [];
    zombies = (wave?.zombies || []).map((source) => ({ ...source, pos: randomPointAround(player, 220, 420), alive: true, marker: null, el: null }));
    zombies.forEach((zombie) => {
      const el = markerElement('zombie-marker', '☠');
      zombie.el = el;
      el.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); shootZombie(zombie); });
      zombie.marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([zombie.pos.lng, zombie.pos.lat]).addTo(map);
      zombieMarkers.push(zombie.marker);
    });
  }

  async function startRealRun() {
    if (!initData()) { ui.gpsStatus.textContent = 'Open this game from its Telegram bot/menu button to start a ranked run.'; return; }
    if (!ui.safety.checked) { ui.gpsStatus.textContent = 'Confirm the pedestrian safety check before starting.'; return; }
    $('startBtn').disabled = true;
    ui.gpsStatus.textContent = 'Getting an accurate GPS fix…';
    try {
      const fix = await getInitialGpsFix();
      player = { lat: fix.lat, lng: fix.lng };
      playerMarker?.setLngLat([player.lng, player.lat]);
      map.jumpTo({ center: [player.lng, player.lat], zoom: 17 });
      const data = await apiPost('/api/dead-run/session/start', {
        position: fix,
        heading_deg: fix.heading_deg,
      });
      clearWorld();
      telemetryQueue = [];
      gpsSeq = 1;
      applySessionPayload(data.session);
      await requestWakeLock();
      startGpsWatch();
      setBanner(data.session.ranked ? 'RANKED GPS RUN LIVE' : 'PRACTICE RUN — DAILY LIMIT USED', 2200);
    } catch (error) {
      ui.gpsStatus.textContent = `Start failed: ${error.message}`;
      ui.start.classList.remove('hidden');
      gameActive = false;
    } finally {
      $('startBtn').disabled = false;
    }
  }

  async function resumeRealRun() {
    if (!activeSessionFromProfile?.session_id) return;
    if (!ui.safety.checked) { ui.gpsStatus.textContent = 'Confirm the pedestrian safety check before resuming.'; return; }
    try {
      const data = await apiPost('/api/dead-run/session/resume', { session_id: activeSessionFromProfile.session_id });
      clearWorld();
      telemetryQueue = [];
      gpsSeq = Math.max(1, (Number(data.session.state?.last_client_seq) || 0) + 1);
      applySessionPayload(data.session);
      await requestWakeLock();
      startGpsWatch();
      setBanner('ACTIVE RUN RESUMED', 1800);
    } catch (error) { ui.gpsStatus.textContent = `Resume failed: ${error.message}`; }
  }

  async function startDemo() {
    clearWorld();
    stopGpsWatch();
    demoMode = true;
    serverState = null;
    gameActive = true;
    session = { head_start_seconds: 60, started_at: new Date().toISOString(), ranked: false };
    startTimeMs = Date.now();
    hordeStarted = false;
    demoDistance = 0; demoAmmo = 3; demoCharge = 0; demoSlow = 0; demoKills = 0; demoCrates = 0; demoShoves = 0; demoWaveIndex = 0;
    player = { ...DEFAULT_POS };
    ui.start.classList.add('hidden');
    ui.gameOver.classList.add('hidden');
    ui.risk.classList.add('hidden');
    initPlayerMarker();
    playerMarker?.setLngLat([player.lng, player.lat]);
    map.jumpTo({ center: [player.lng, player.lat], zoom: 17 });
    buildDemoWorld();
    updateHud();
    await requestWakeLock();
    startLoops();
    setBanner('DEMO — NO ACCOUNT XP', 1800);
  }

  async function finishRun(reason = 'ended') {
    if (!gameActive || finishInFlight) return;
    finishInFlight = true;
    if (!demoMode) await flushTelemetry(true);
    gameActive = false;
    stopLoops();
    stopGpsWatch();
    try {
      if (demoMode) {
        const survived = Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000) - 60);
        ui.gameOverTitle.textContent = reason === 'caught' ? 'YOU GOT CAUGHT' : 'DEMO ENDED';
        ui.finalStats.textContent = `Survived ${Math.floor(survived / 60)}:${String(survived % 60).padStart(2, '0')} · ${Math.round(demoDistance)}m · ${demoKills} kills.`;
        ui.xpResult.textContent = 'Demo mode does not save stats or award XP.';
      } else {
        const data = await apiPost('/api/dead-run/session/finish', { session_id: session.session_id, reason });
        const result = data.result;
        const minutes = Math.floor(result.survival_seconds / 60);
        const seconds = result.survival_seconds % 60;
        ui.gameOverTitle.textContent = reason === 'caught' ? 'YOU GOT CAUGHT' : 'RUN ENDED';
        ui.finalStats.textContent = `Score ${Number(result.score).toLocaleString()} · survived ${minutes}:${String(seconds).padStart(2, '0')} · ${Math.round(result.verified_distance_m)}m · ${result.kills} kills.`;
        ui.xpResult.textContent = result.ranked
          ? `+${result.xp_awarded} Arcade XP · GPS ${String(result.risk).toUpperCase()}`
          : `Practice/unranked · +0 XP · GPS ${String(result.risk).toUpperCase()}`;
        profile = data.player || profile;
        renderProfile();
      }
    } catch (error) {
      ui.gameOverTitle.textContent = 'RUN ENDED';
      ui.finalStats.textContent = `The run stopped, but settlement failed: ${error.message}`;
      ui.xpResult.textContent = 'Re-open the game and resume/finish the active session before starting another ranked run.';
    } finally {
      clearWorld();
      ui.gameOver.classList.remove('hidden');
      ui.risk.classList.add('hidden');
      haptic(reason === 'caught' ? 'error' : 'success');
      finishInFlight = false;
    }
  }

  function renderProfile(daily = null) {
    if (!profile) return;
    const dailyText = daily ? ` · ranked today ${daily.ranked_completed}/${daily.ranked_limit}` : '';
    ui.account.textContent = `${profile.display_name || 'Runner'} · ${Number(profile.xp_total || 0).toLocaleString()} Dead Run XP · best ${Number(profile.best_score || 0).toLocaleString()}${dailyText}`;
  }

  function renderHorde(horde) {
    if (!horde) { ui.horde.textContent = 'Global horde unavailable.'; return; }
    const pct = Math.round(Number(horde.progress || 0) * 100);
    ui.horde.textContent = `GLOBAL HORDE · ${Number(horde.kills_total || 0).toLocaleString()}/${Number(horde.target_kills || 0).toLocaleString()} kills · ${pct}% · ${Number(horde.participants || 0)} runners`;
  }

  async function loadProfile() {
    try {
      const hordeData = await apiGet('/api/dead-run/horde/current');
      renderHorde(hordeData.horde);
    } catch (_) { ui.horde.textContent = 'Global horde loads after server deployment.'; }
    if (!initData()) {
      ui.account.textContent = 'Open through Telegram for persistent stats, ranked runs and XP.';
      return;
    }
    try {
      const data = await apiPost('/api/dead-run/profile');
      profile = data.player;
      activeSessionFromProfile = data.active_session;
      renderProfile(data.daily);
      renderHorde(data.horde);
      ui.resume.classList.toggle('hidden', !activeSessionFromProfile?.session_id);
      if (activeSessionFromProfile?.session_id) ui.gpsStatus.textContent = 'An active run is waiting. Confirm safety and resume it, or continue later.';
    } catch (error) {
      ui.account.textContent = `Account unavailable: ${error.message}`;
    }
  }

  function formatLeaderboardValue(row, metric) {
    if (metric === 'survival_seconds') {
      const seconds = Number(row.survival_seconds) || 0;
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    if (metric === 'verified_distance_m') return `${Math.round(Number(row.verified_distance_m) || 0)}m`;
    return Number(row.score || 0).toLocaleString();
  }

  async function showLeaderboard(metric = leaderboardMetric) {
    leaderboardMetric = metric;
    ui.leaderboard.classList.remove('hidden');
    ui.leaderboardRows.textContent = 'Loading…';
    document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.metric === metric));
    try {
      const data = await apiGet(`/api/dead-run/leaderboard?metric=${encodeURIComponent(metric)}&period=daily&limit=30`);
      ui.leaderboardRows.innerHTML = '';
      if (!data.rows.length) { ui.leaderboardRows.textContent = 'No ranked runs yet today.'; return; }
      data.rows.forEach((row) => {
        const div = document.createElement('div');
        div.className = 'leaderboard-row';
        const rank = document.createElement('span'); rank.className = 'leaderboard-rank'; rank.textContent = `#${row.rank}`;
        const name = document.createElement('span'); name.textContent = row.display_name;
        const value = document.createElement('span'); value.className = 'leaderboard-value'; value.textContent = formatLeaderboardValue(row, data.metric);
        div.append(rank, name, value);
        ui.leaderboardRows.appendChild(div);
      });
    } catch (error) { ui.leaderboardRows.textContent = `Leaderboard unavailable: ${error.message}`; }
  }

  $('startBtn').addEventListener('click', startRealRun);
  $('resumeBtn').addEventListener('click', resumeRealRun);
  $('demoBtn').addEventListener('click', startDemo);
  $('restartBtn').addEventListener('click', () => {
    ui.gameOver.classList.add('hidden');
    ui.start.classList.remove('hidden');
    loadProfile();
  });
  $('centerBtn').addEventListener('click', () => map?.easeTo({ center: [player.lng, player.lat], zoom: 17, duration: 450 }));
  $('slowBtn').addEventListener('click', useSlow);
  ui.shove.addEventListener('click', shoveHorde);
  $('leaderboardBtn').addEventListener('click', () => showLeaderboard());
  $('gameLeaderboardBtn').addEventListener('click', () => showLeaderboard());
  $('closeLeaderboardBtn').addEventListener('click', () => ui.leaderboard.classList.add('hidden'));
  document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => showLeaderboard(button.dataset.metric)));

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && gameActive) await requestWakeLock();
  });
  window.addEventListener('pagehide', () => {
    if (!demoMode && gameActive) flushTelemetry(true);
  });

  makeMap();
  updateHud();
  loadProfile();
})();
