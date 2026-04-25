```diff
diff --git "a/C:\\Users\\GOD\\Downloads\\network.js" "b/C:\\Users\\GOD\\Documents\\Codex\\2026-04-25-github-plugin-github-openai-curated-you\\games\\block-topia\\network.js"
index f9bce62..e6d34ff 100644
--- "a/C:\\Users\\GOD\\Downloads\\network.js"
+++ "b/C:\\Users\\GOD\\Documents\\Codex\\2026-04-25-github-plugin-github-openai-curated-you\\games\\block-topia\\network.js"
@@ -2,10 +2,8 @@ let room = null;
 let client = null;
 let _reconnectOptions = null;
 let _reconnecting = false;
-// True while connectMultiplayer() is actively running for a reconnect.
-// Prevents concurrent reconnect attempts from both _scheduleReconnect and
-// direct callers (e.g. the node-click handler in main.js).
 let _isConnecting = false;
+let _reconnectTimer = null;
 // Set to true when the last connection attempt failed with 4211 (city not bootstrapped).
 // Prevents the onLeave handler from triggering pointless reconnect loops.
 let _cityUnavailable = false;
@@ -41,19 +39,25 @@ function isRoomNotFoundError(error) {
   );
 }
 
+function cleanupRoomInstance(targetRoom) {
+  if (!targetRoom) return;
+  try { targetRoom.removeAllListeners?.(); } catch {}
+  try { targetRoom.leave?.(); } catch {}
+}
+
 // Join an existing server-created room only. Never creates a room from the browser.
 // If the room does not exist (4211) a clean error with isCityUnavailable=true is thrown
 // so the caller can fail fast without retrying or creating a fallback room.
 async function joinCityOnly(colyseusClient, roomId, options) {
-  console.log(`[BlockTopia] join attempt → room "${roomId}"`);
+  console.log(`[BlockTopia] join attempt -> room "${roomId}"`);
   try {
     const joined = await colyseusClient.join(roomId, options);
-    console.log(`[BlockTopia] join succeeded → room "${joined.name || roomId}" session=${joined.sessionId}`);
+    console.log(`[BlockTopia] join succeeded -> room "${joined.name || roomId}" session=${joined.sessionId}`);
     return joined;
   } catch (joinError) {
     if (isRoomNotFoundError(joinError)) {
-      console.error(`[BlockTopia] Live city unavailable — server room not bootstrapped (code=${joinError?.code}).`);
-      const err = new Error('Live city unavailable — server room not bootstrapped');
+      console.error(`[BlockTopia] Live city unavailable - server room not bootstrapped (code=${joinError?.code}).`);
+      const err = new Error('Live city unavailable - server room not bootstrapped');
       err.code = ERR_ROOM_NOT_FOUND;
       err.isCityUnavailable = true;
       throw err;
@@ -101,6 +105,10 @@ export async function connectMultiplayer({
   onOperationResult,
   onCovertState,
 }) {
+  if (_isConnecting) {
+    return null;
+  }
+
   // Persist options/callbacks so reconnectMultiplayer() can reuse them.
   _reconnectOptions = {
     playerName, roomId, roomIdentity,
@@ -117,173 +125,187 @@ export async function connectMultiplayer({
   const endpoint = rawEndpoint.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
   let lastError = null;
   _cityUnavailable = false;
+  _isConnecting = true;
 
-  console.log(`[BlockTopia] Multiplayer init — endpoint: ${endpoint} | room: "${roomId}"`);
+  console.log(`[BlockTopia] Multiplayer init - endpoint: ${endpoint} | room: "${roomId}"`);
 
   if (!window.Colyseus) {
-    console.error('[BlockTopia] Colyseus client library not loaded — multiplayer unavailable.');
+    console.error('[BlockTopia] Colyseus client library not loaded - multiplayer unavailable.');
     onStatus?.({ ws: 'failed', joined: false, error: 'Colyseus not loaded', roomId });
+    _isConnecting = false;
     return null;
   }
 
-  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
-    try {
-      onStatus?.({ ws: 'connecting', joined: false, error: '', roomId });
-      console.log(`[BlockTopia] Connecting (attempt ${attempt}/${MAX_RETRIES}) → ${endpoint} room "${roomId}"`);
-      client = new window.Colyseus.Client(endpoint);
-      room = await joinCityOnly(client, roomId, {
-        name: playerName,
-        faction: 'Liberators',
-        district: roomIdentity?.districtId || 'neon-slums',
-        roomIdentity,
-      });
-
-      onStatus?.({ ws: 'connected', joined: true, error: '', roomId: room.name || roomId, sessionId: room.sessionId || '' });
-      onFeed?.(`Connected to ${room.name || roomId} (${room.sessionId || 'session pending'})`);
-      console.log(`[BlockTopia] Joined room "${room.name || roomId}" session=${room.sessionId}`);
-
-      // Handle unexpected server-side disconnect after a successful join.
-      // Each room object is independent: this handler is bound to the specific room instance
-      // returned by joinCityOnly and will not accumulate across retry attempts.
-      const capturedRoomRef = room;
-      const joinedRoomName = room.name || roomId;
-      room.onLeave((code) => {
-        // Only act if this is still the active room (not already replaced by a reconnect).
-        if (room === capturedRoomRef) {
-          room = null;
+  try {
+    // Always clean up the active room reference before creating a new join flow.
+    if (room) {
+      cleanupRoomInstance(room);
+      room = null;
+    }
+
+    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
+      try {
+        onStatus?.({ ws: 'connecting', joined: false, error: '', roomId });
+        console.log(`[BlockTopia] Connecting (attempt ${attempt}/${MAX_RETRIES}) -> ${endpoint} room "${roomId}"`);
+        client = new window.Colyseus.Client(endpoint);
+        const joinedRoom = await joinCityOnly(client, roomId, {
+          name: playerName,
+          faction: 'Liberators',
+          district: roomIdentity?.districtId || 'neon-slums',
+          roomIdentity,
+        });
+
+        room = joinedRoom;
+
+        onStatus?.({ ws: 'connected', joined: true, error: '', roomId: room.name || roomId, sessionId: room.sessionId || '' });
+        onFeed?.(`Connected to ${room.name || roomId} (${room.sessionId || 'session pending'})`);
+        console.log(`[BlockTopia] Joined room "${room.name || roomId}" session=${room.sessionId}`);
+
+        // Handle unexpected server-side disconnect after a successful join.
+        // Each room object is independent: this handler is bound to the specific room instance
+        // returned by joinCityOnly and will not accumulate across retry attempts.
+        const capturedRoomRef = room;
+        const joinedRoomName = room.name || roomId;
+        room.onLeave((code) => {
+          // Always clear the active reference for the room that left.
+          if (room === capturedRoomRef) {
+            room = null;
+          }
+          console.error(`[BlockTopia] Disconnected from room "${joinedRoomName}" (code: ${code})`);
+          onStatus?.({ ws: 'disconnected', joined: false, error: `Disconnected (code: ${code})`, roomId: joinedRoomName });
+          onFeed?.(`[Network] Multiplayer connection lost (code: ${code})`);
+          // Begin a silent background reconnect attempt.
+          _scheduleReconnect();
+        });
+
+        let lastUpdate = 0;
+        room.onStateChange((state) => {
+          const now = performance.now();
+          // Throttle state fan-out to avoid per-frame UI churn on large player maps.
+          if (now - lastUpdate < STATE_CHANGE_THROTTLE_MS) return;
+          lastUpdate = now;
+          onPlayers?.(toPlayerList(state.players));
+        });
+
+        room.onMessage('system', (message) => {
+          onFeed?.(`[System] ${message?.message || 'System update'}`);
+        });
+
+        room.onMessage('districtChanged', (message) => {
+          onFeed?.(`[District] ${message?.playerId || 'Player'} entered ${message?.districtName || 'district'}`);
+        });
+
+        // Carried forward from Block Topia Revolt: award XP and report quest completion
+        // Server broadcasts { playerId, questId, title, rewardXp, totalXp } - forward questId so
+        // the client quest system can match and remove the correct active quest by id.
+        room.onMessage('questCompleted', (message) => {
+          const questId  = message?.questId  || '';
+          const title    = message?.title    || 'Quest';
+          const rewardXp = message?.rewardXp || 0;
+          onFeed?.(`[Quest] ${title} (+${rewardXp} XP)`);
+          onQuestCompleted?.({ questId, title, rewardXp });
+        });
+
+        room.onMessage('samPhaseChanged', (message) => {
+          const phaseIndex = Number(message?.phaseIndex);
+          if (Number.isFinite(phaseIndex)) {
+            onSamPhaseChanged?.({ phaseIndex });
+          }
+        });
+
+        room.onMessage('districtCaptureChanged', (message) => {
+          const districtId = message?.districtId || '';
+          const control = Number(message?.control);
+          const owner = message?.owner || message?.factionOwner || message?.faction || '';
+          if (districtId) {
+            onDistrictCaptureChanged?.({ districtId, control, owner });
+          }
+        });
+
+        room.onMessage('worldSnapshot', (data) => {
+          onWorldSnapshot?.(data);
+        });
+
+        room.onMessage('nodeInterferenceChanged', (message) => {
+          onNodeInterferenceChanged?.(message);
+        });
+        room.onMessage('districtControlStateChanged', (message) => {
+          onDistrictControlStateChanged?.(message);
+        });
+        room.onMessage('playerWarImpact', (message) => {
+          onPlayerWarImpact?.(message);
+        });
+
+        room.onMessage('duelRequested', (message) => {
+          onDuelRequested?.(message);
+        });
+
+        room.onMessage('duelStarted', (message) => {
+          onDuelStarted?.(message);
+        });
+
+        room.onMessage('duelActionSubmitted', (message) => {
+          onDuelActionSubmitted?.(message);
+        });
+
+        room.onMessage('duelResolved', (message) => {
+          onDuelResolved?.(message);
+        });
+
+        room.onMessage('duelEnded', (message) => {
+          onDuelEnded?.(message);
+        });
+
+        room.onMessage('operationStarted', (message) => {
+          onOperationStarted?.(message);
+        });
+
+        room.onMessage('operationResult', (message) => {
+          onOperationResult?.(message);
+        });
+
+        room.onMessage('covertState', (message) => {
+          onCovertState?.(message);
+        });
+
+        return room;
+      } catch (error) {
+        lastError = error;
+        const roomFull = isRoomFullError(error);
+        const cityUnavailable = error?.isCityUnavailable === true;
+        const wsState = roomFull ? 'room-full' : cityUnavailable ? 'unavailable' : 'failed';
+        console.error(
+          `[BlockTopia] Connection attempt ${attempt}/${MAX_RETRIES} failed (${wsState}):`,
+          error?.message || error,
+        );
+        onStatus?.({ ws: wsState, joined: false, error: String(error?.message || error), roomId, roomFull });
+        if (roomFull) {
+          // Room is at capacity - do not retry.
+          onFeed?.('[System] Block Topia is full (100 players). Try again later.');
+          console.warn('[BlockTopia] Room full - aborting further connection attempts.');
+          return null;
         }
-        console.error(`[BlockTopia] Disconnected from room "${joinedRoomName}" (code: ${code})`);
-        onStatus?.({ ws: 'disconnected', joined: false, error: `Disconnected (code: ${code})`, roomId: joinedRoomName });
-        onFeed?.(`⚠️ Multiplayer connection lost (code: ${code})`);
-        // Begin a silent background reconnect attempt.
-        _scheduleReconnect();
-      });
-
-      let lastUpdate = 0;
-      room.onStateChange((state) => {
-        const now = performance.now();
-        // Throttle state fan-out to avoid per-frame UI churn on large player maps.
-        if (now - lastUpdate < STATE_CHANGE_THROTTLE_MS) return;
-        lastUpdate = now;
-        onPlayers?.(toPlayerList(state.players));
-      });
-
-      room.onMessage('system', (message) => {
-        onFeed?.(`📢 ${message?.message || 'System update'}`);
-      });
-
-      room.onMessage('districtChanged', (message) => {
-        onFeed?.(`🏙️ ${message?.playerId || 'Player'} entered ${message?.districtName || 'district'}`);
-      });
-
-      // Carried forward from Block Topia Revolt: award XP and report quest completion
-      // Server broadcasts { playerId, questId, title, rewardXp, totalXp } — forward questId so
-      // the client quest system can match and remove the correct active quest by id.
-      room.onMessage('questCompleted', (message) => {
-        const questId  = message?.questId  || '';
-        const title    = message?.title    || 'Quest';
-        const rewardXp = message?.rewardXp || 0;
-        onFeed?.(`✅ ${title} (+${rewardXp} XP)`);
-        onQuestCompleted?.({ questId, title, rewardXp });
-      });
-
-      room.onMessage('samPhaseChanged', (message) => {
-        const phaseIndex = Number(message?.phaseIndex);
-        if (Number.isFinite(phaseIndex)) {
-          onSamPhaseChanged?.({ phaseIndex });
+        if (cityUnavailable) {
+          // Server room not bootstrapped - fail cleanly once, no retry, no reconnect loop.
+          _cityUnavailable = true;
+          onFeed?.('[Network] Live city unavailable - server room not bootstrapped.');
+          console.warn('[BlockTopia] City unavailable - aborting connection attempts.');
+          return null;
         }
-      });
-
-      room.onMessage('districtCaptureChanged', (message) => {
-        const districtId = message?.districtId || '';
-        const control = Number(message?.control);
-        const owner = message?.owner || message?.factionOwner || message?.faction || '';
-        if (districtId) {
-          onDistrictCaptureChanged?.({ districtId, control, owner });
+        if (attempt < MAX_RETRIES) {
+          await wait(2500);
         }
-      });
-
-      room.onMessage('worldSnapshot', (data) => {
-        onWorldSnapshot?.(data);
-      });
-
-      room.onMessage('nodeInterferenceChanged', (message) => {
-        onNodeInterferenceChanged?.(message);
-      });
-      room.onMessage('districtControlStateChanged', (message) => {
-        onDistrictControlStateChanged?.(message);
-      });
-      room.onMessage('playerWarImpact', (message) => {
-        onPlayerWarImpact?.(message);
-      });
-
-      room.onMessage('duelRequested', (message) => {
-        onDuelRequested?.(message);
-      });
-
-      room.onMessage('duelStarted', (message) => {
-        onDuelStarted?.(message);
-      });
-
-      room.onMessage('duelActionSubmitted', (message) => {
-        onDuelActionSubmitted?.(message);
-      });
-
-      room.onMessage('duelResolved', (message) => {
-        onDuelResolved?.(message);
-      });
-
-      room.onMessage('duelEnded', (message) => {
-        onDuelEnded?.(message);
-      });
-
-      room.onMessage('operationStarted', (message) => {
-        onOperationStarted?.(message);
-      });
-
-      room.onMessage('operationResult', (message) => {
-        onOperationResult?.(message);
-      });
-
-      room.onMessage('covertState', (message) => {
-        onCovertState?.(message);
-      });
-
-      return room;
-    } catch (error) {
-      lastError = error;
-      const roomFull = isRoomFullError(error);
-      const cityUnavailable = error?.isCityUnavailable === true;
-      const wsState = roomFull ? 'room-full' : cityUnavailable ? 'unavailable' : 'failed';
-      console.error(
-        `[BlockTopia] Connection attempt ${attempt}/${MAX_RETRIES} failed (${wsState}):`,
-        error?.message || error,
-      );
-      onStatus?.({ ws: wsState, joined: false, error: String(error?.message || error), roomId, roomFull });
-      if (roomFull) {
-        // Room is at capacity — do not retry.
-        onFeed?.('⛔ Block Topia is full (100 players). Try again later.');
-        console.warn('[BlockTopia] Room full — aborting further connection attempts.');
-        return null;
-      }
-      if (cityUnavailable) {
-        // Server room not bootstrapped — fail cleanly once, no retry, no reconnect loop.
-        _cityUnavailable = true;
-        onFeed?.('⚠️ Live city unavailable — server room not bootstrapped.');
-        console.warn('[BlockTopia] City unavailable — aborting connection attempts.');
-        return null;
-      }
-      if (attempt < MAX_RETRIES) {
-        await wait(2500);
       }
     }
-  }
 
-  console.error(`[BlockTopia] All ${MAX_RETRIES} connection attempts exhausted. endpoint=${endpoint} room="${roomId}" error:`, lastError?.message || lastError);
-  onFeed?.(`⚠️ Multiplayer unavailable: ${String(lastError?.message || lastError || 'unknown error')}`);
-  // city_status_fix rule 1: signal the UI that all retries are exhausted — marks live city unavailable.
-  onStatus?.({ ws: 'disconnected', joined: false, error: String(lastError?.message || lastError || 'unknown error'), roomId });
-  return null;
+    console.error(`[BlockTopia] All ${MAX_RETRIES} connection attempts exhausted. endpoint=${endpoint} room="${roomId}" error:`, lastError?.message || lastError);
+    onFeed?.(`[Network] Multiplayer unavailable: ${String(lastError?.message || lastError || 'unknown error')}`);
+    // city_status_fix rule 1: signal the UI that all retries are exhausted - marks live city unavailable.
+    onStatus?.({ ws: 'disconnected', joined: false, error: String(lastError?.message || lastError || 'unknown error'), roomId });
+    return null;
+  } finally {
+    _isConnecting = false;
+  }
 }
 
 /**
@@ -396,17 +418,17 @@ export function submitDuelAction(duelId, action) {
   return true;
 }
 
-/** sendDuelChallenge — spec-required alias of challengePlayer */
+/** sendDuelChallenge - spec-required alias of challengePlayer */
 export function sendDuelChallenge(targetId) {
   return challengePlayer(targetId);
 }
 
-/** sendDuelAccept — spec-required alias of acceptDuel */
+/** sendDuelAccept - spec-required alias of acceptDuel */
 export function sendDuelAccept(duelId) {
   return acceptDuel(duelId);
 }
 
-/** sendDuelAction — spec-required alias of submitDuelAction */
+/** sendDuelAction - spec-required alias of submitDuelAction */
 export function sendDuelAction(duelId, action) {
   return submitDuelAction(duelId, action);
 }
@@ -421,6 +443,14 @@ export function sendDeployOperative(nodeId) {
   return true;
 }
 
+async function _runReconnectNow() {
+  if (!_reconnectOptions) return null;
+  if (isRoomOpen()) return null;
+  if (_isConnecting) return null;
+  if (_cityUnavailable) return null;
+  return connectMultiplayer(_reconnectOptions);
+}
+
 /**
  * Schedule a silent background reconnect after a short delay.
  * Guards against concurrent reconnect attempts.
@@ -428,13 +458,21 @@ export function sendDeployOperative(nodeId) {
 function _scheduleReconnect() {
   if (_reconnecting || !_reconnectOptions) return;
   if (_cityUnavailable) {
-    console.warn('[BlockTopia] _scheduleReconnect: city unavailable — not scheduling reconnect.');
+    console.warn('[BlockTopia] _scheduleReconnect: city unavailable - not scheduling reconnect.');
     return;
   }
+
   _reconnecting = true;
-  // Wait 2.5 s before trying — gives the server time to clean up the old session.
-  setTimeout(() => {
-    reconnectMultiplayer().finally(() => {
+
+  if (_reconnectTimer) {
+    clearTimeout(_reconnectTimer);
+    _reconnectTimer = null;
+  }
+
+  // Wait 2.5 s before trying - gives the server time to clean up the old session.
+  _reconnectTimer = setTimeout(() => {
+    _reconnectTimer = null;
+    _runReconnectNow().finally(() => {
       _reconnecting = false;
     });
   }, 2500);
@@ -447,23 +485,19 @@ function _scheduleReconnect() {
  */
 export async function reconnectMultiplayer() {
   if (!_reconnectOptions) {
-    console.warn('[BlockTopia] reconnectMultiplayer: no saved connection options — ignoring.');
+    console.warn('[BlockTopia] reconnectMultiplayer: no saved connection options - ignoring.');
     return null;
   }
   if (isRoomOpen()) {
-    // Already connected — nothing to do.
+    // Already connected - nothing to do.
     return null;
   }
-  if (_isConnecting) {
-    // A reconnect attempt is already in flight (from _scheduleReconnect or another caller).
-    console.log('[BlockTopia] reconnectMultiplayer: reconnect already in progress — ignoring duplicate call.');
+  if (_reconnecting || _isConnecting) {
+    // A reconnect attempt is already in flight.
     return null;
   }
-  _isConnecting = true;
-  console.log('[BlockTopia] reconnectMultiplayer: attempting silent reconnect…');
-  try {
-    return await connectMultiplayer(_reconnectOptions);
-  } finally {
-    _isConnecting = false;
-  }
+
+  // Always route through scheduler so gameplay events cannot force immediate reconnect loops.
+  _scheduleReconnect();
+  return null;
 }
```
