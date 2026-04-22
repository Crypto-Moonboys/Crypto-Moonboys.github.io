function seconds(ms) {
  return Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatNodeLabel(nodeId) {
  const raw = String(nodeId || '').trim();
  if (!raw) return 'NO NODE LOCK';
  return raw.replace(/[-_]/g, ' ').toUpperCase();
}

function objectiveTone(objective) {
  if (!objective) return 'pending';
  if (objective.complete) return 'complete';
  if ((Number(objective.timeLeftMs) || 0) <= 6000) return 'critical';
  if (objective.connected === false) return 'warning';
  return 'pending';
}

function objectivePrefix(index, objective) {
  if (objective?.complete) return 'DONE';
  return `P${index + 1}`;
}

function describeObjective(objective) {
  const from = objective?.fromId ? formatNodeLabel(objective.fromId) : '';
  const to = objective?.toId ? formatNodeLabel(objective.toId) : '';
  if (objective?.type === 'restore_critical_path' && from && to) {
    return `${objective.label} - ${from} to ${to}`;
  }
  if (objective?.type === 'reconnect_cluster' && from) {
    return `${objective.label} - anchor ${from}`;
  }
  if (objective?.type === 'stabilize_corridor' && from && to) {
    return `${objective.label} - corridor ${from} to ${to}`;
  }
  return String(objective?.label || 'Stabilize the lane');
}

function buildPressureSummary(data) {
  const unstable = Number(data?.linkStates?.unstable || 0);
  const broken = Number(data?.linkStates?.broken || 0);
  const fractures = Number(data?.fractureTypes?.length || 0);
  const incomplete = (data?.objectives || []).filter((objective) => !objective.complete && objective.id !== 'integrity_floor').length;
  const integrity = Number(data?.integrity || 0);

  if (integrity <= 34 || broken >= 4) {
    return {
      tone: 'critical',
      title: 'Pressure critical',
      detail: 'Network collapse risk is live. Broken corridors or low integrity will end the breach fast.',
    };
  }
  if (integrity <= 52 || unstable >= 5 || incomplete >= 3) {
    return {
      tone: 'warning',
      title: 'Pressure rising',
      detail: 'Instability is climbing. Restore key paths before timeout pressure turns into a hard fail.',
    };
  }
  if (fractures > 0 || incomplete > 0) {
    return {
      tone: 'watch',
      title: 'Signal under watch',
      detail: 'You are still inside the danger window. Keep integrity above the floor and finish the priority list.',
    };
  }
  return {
    tone: 'stable',
    title: 'Network stable',
    detail: 'Core lanes are holding. Keep pressure low and protect the integrity floor for a clean win.',
  };
}

function buildActionCatalog(data) {
  const selectedLocked = Boolean(data?.selectedNodeId);
  return [
    {
      id: 'reconnectLink',
      primaryKey: '1',
      legacyKey: 'A',
      label: 'Reconnect Node',
      detail: 'Reconnect broken adjacent links from the locked node.',
      disabled: !selectedLocked,
    },
    {
      id: 'rerouteNode',
      primaryKey: '2',
      legacyKey: 'D',
      label: 'Restore Path',
      detail: 'Reduce spread pressure and recover integrity through reroute control.',
      disabled: !selectedLocked,
    },
    {
      id: 'stabilizeLink',
      primaryKey: '3',
      legacyKey: 'S',
      label: 'Stabilize Link',
      detail: 'Convert unstable corridors back into stable signal lanes.',
      disabled: !selectedLocked,
    },
  ];
}

function buildSupportActions(data) {
  const selectedLocked = Boolean(data?.selectedNodeId);
  const supportCharges = Number(data?.supportCharges || 0);
  return [
    {
      id: 'deployBridge',
      key: 'F',
      label: 'Deploy Bridge',
      detail: supportCharges > 0
        ? `${supportCharges} recruiter bridge charge${supportCharges === 1 ? '' : 's'} available.`
        : 'No bridge charges available until recruiter support lands.',
      disabled: !selectedLocked || supportCharges <= 0,
    },
    {
      id: 'reinforceConnection',
      key: 'G',
      label: 'Reinforce Link',
      detail: 'Fortify stable or bridged adjacent lanes to preserve integrity.',
      disabled: !selectedLocked,
    },
  ];
}

function sanitizeResult(result) {
  if (!result || typeof result !== 'object') return null;
  return result;
}

export function createCircuitConnectOverlay(doc, { onAction, onSkip } = {}) {
  const style = doc.createElement('style');
  style.textContent = `
    #circuit-connect-overlay.hidden { display: none; }
    #circuit-connect-overlay {
      position: fixed;
      inset: 0;
      z-index: 881;
      pointer-events: none;
      font-family: "Segoe UI", Tahoma, sans-serif;
    }
    #circuit-connect-overlay .circuit-dim {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 82% 16%, rgba(94,242,255,0.12), transparent 22%),
        linear-gradient(180deg, rgba(3,8,18,0.06), rgba(3,8,18,0.22));
      backdrop-filter: blur(1px);
    }
    #circuit-connect-overlay .circuit-shell {
      position: absolute;
      top: 92px;
      right: 14px;
      width: min(420px, calc(100vw - 28px));
      max-height: min(72vh, 760px);
      overflow: auto;
      padding: 11px 11px 12px;
      border: 1px solid rgba(122, 230, 255, 0.3);
      border-radius: 4px;
      background:
        linear-gradient(180deg, rgba(4, 14, 30, 0.94), rgba(3, 10, 21, 0.9)),
        rgba(5, 11, 22, 0.88);
      box-shadow: 0 26px 58px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255,255,255,0.05);
      color: #def7ff;
      pointer-events: auto;
    }
    #circuit-connect-overlay .circuit-header {
      display: grid;
      gap: 8px;
      padding-bottom: 9px;
      border-bottom: 1px solid rgba(122, 230, 255, 0.12);
    }
    #circuit-connect-overlay .circuit-header-top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
    }
    #circuit-connect-overlay .circuit-chip {
      margin: 0;
      color: #ff6fa7;
      letter-spacing: 0.1em;
      font-size: 12px;
      font-weight: 800;
    }
    #circuit-connect-overlay .circuit-threat {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(163, 224, 244, 0.72);
    }
    #circuit-connect-overlay .circuit-headline {
      display: grid;
      gap: 4px;
    }
    #circuit-connect-overlay .circuit-node {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #f2fbff;
    }
    #circuit-connect-overlay .circuit-sub {
      font-size: 12px;
      color: rgba(191, 234, 247, 0.84);
    }
    #circuit-connect-overlay .circuit-meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    #circuit-connect-overlay .circuit-meta-card,
    #circuit-connect-overlay .circuit-status-card,
    #circuit-connect-overlay .circuit-stakes,
    #circuit-connect-overlay .circuit-feedback,
    #circuit-connect-overlay .circuit-log-shell {
      border: 1px solid rgba(122, 230, 255, 0.14);
      background: linear-gradient(180deg, rgba(10, 23, 46, 0.9), rgba(7, 16, 33, 0.78));
      border-radius: 4px;
    }
    #circuit-connect-overlay .circuit-meta-card {
      padding: 7px 8px;
      min-width: 0;
    }
    #circuit-connect-overlay .circuit-meta-card span {
      display: block;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(160, 225, 241, 0.66);
    }
    #circuit-connect-overlay .circuit-meta-card strong {
      display: block;
      margin-top: 3px;
      font-size: 15px;
      color: #f2fbff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #circuit-connect-overlay .circuit-grid {
      display: grid;
      gap: 9px;
      margin-top: 10px;
    }
    #circuit-connect-overlay .circuit-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 6px;
    }
    #circuit-connect-overlay .circuit-section-head h3 {
      margin: 0;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #92efff;
    }
    #circuit-connect-overlay .circuit-section-head span {
      font-size: 10px;
      color: rgba(176, 236, 250, 0.66);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    #circuit-connect-overlay .circuit-objectives {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 6px;
    }
    #circuit-connect-overlay .circuit-objective {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 8px;
      align-items: start;
      padding: 7px 8px;
      border: 1px solid rgba(122, 230, 255, 0.14);
      border-radius: 4px;
      background: rgba(6, 16, 32, 0.78);
    }
    #circuit-connect-overlay .circuit-objective[data-tone="complete"] {
      border-color: rgba(141, 255, 106, 0.36);
      background: linear-gradient(180deg, rgba(10, 26, 27, 0.92), rgba(8, 20, 24, 0.78));
    }
    #circuit-connect-overlay .circuit-objective[data-tone="warning"] {
      border-color: rgba(255, 181, 92, 0.32);
    }
    #circuit-connect-overlay .circuit-objective[data-tone="critical"] {
      border-color: rgba(255, 95, 133, 0.48);
      box-shadow: inset 0 0 0 1px rgba(255, 95, 133, 0.1);
    }
    #circuit-connect-overlay .circuit-objective-mark {
      width: 26px;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #dffaff;
      background: rgba(94, 242, 255, 0.12);
      border: 1px solid rgba(94, 242, 255, 0.16);
    }
    #circuit-connect-overlay .circuit-objective[data-tone="complete"] .circuit-objective-mark {
      background: rgba(141, 255, 106, 0.14);
      border-color: rgba(141, 255, 106, 0.2);
      color: #b8ff9d;
    }
    #circuit-connect-overlay .circuit-objective-body {
      min-width: 0;
    }
    #circuit-connect-overlay .circuit-objective-title {
      font-size: 12px;
      color: #e7fbff;
      line-height: 1.34;
    }
    #circuit-connect-overlay .circuit-objective-detail {
      display: block;
      margin-top: 3px;
      font-size: 10px;
      color: rgba(171, 229, 243, 0.72);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    #circuit-connect-overlay .circuit-objective-time {
      font-size: 11px;
      font-weight: 700;
      color: #9ef3ff;
      white-space: nowrap;
    }
    #circuit-connect-overlay .circuit-actions-shell {
      display: grid;
      gap: 7px;
    }
    #circuit-connect-overlay .circuit-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    #circuit-connect-overlay .circuit-support-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    #circuit-connect-overlay button {
      border: 1px solid rgba(122, 230, 255, 0.24);
      border-radius: 4px;
      background: linear-gradient(180deg, rgba(9, 30, 57, 0.94), rgba(8, 22, 42, 0.82));
      color: #e4faff;
      padding: 8px 9px;
      text-align: left;
      cursor: pointer;
      display: grid;
      gap: 3px;
      min-height: 60px;
      transition: border-color 120ms ease, transform 120ms ease, background 120ms ease;
    }
    #circuit-connect-overlay button:hover:not(:disabled),
    #circuit-connect-overlay button:focus-visible:not(:disabled) {
      border-color: rgba(122, 230, 255, 0.5);
      background: linear-gradient(180deg, rgba(12, 36, 68, 0.96), rgba(10, 27, 52, 0.86));
      transform: translateY(-1px);
      outline: none;
    }
    #circuit-connect-overlay button:disabled {
      cursor: not-allowed;
      opacity: 0.48;
    }
    #circuit-connect-overlay .circuit-action-key {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #7deaff;
      font-weight: 800;
    }
    #circuit-connect-overlay .circuit-action-label {
      font-size: 13px;
      color: #f3fcff;
      font-weight: 700;
    }
    #circuit-connect-overlay .circuit-action-copy {
      font-size: 10px;
      color: rgba(186, 232, 243, 0.76);
      line-height: 1.34;
    }
    #circuit-connect-overlay .circuit-skip {
      border-color: rgba(255, 111, 167, 0.28);
      background: linear-gradient(180deg, rgba(52, 14, 34, 0.94), rgba(30, 10, 20, 0.84));
    }
    #circuit-connect-overlay .circuit-skip .circuit-action-key,
    #circuit-connect-overlay .circuit-skip .circuit-action-label {
      color: #ffb7cf;
    }
    #circuit-connect-overlay .circuit-status-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    #circuit-connect-overlay .circuit-status-card {
      padding: 7px 8px;
    }
    #circuit-connect-overlay .circuit-status-card span {
      display: block;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(163, 224, 244, 0.64);
    }
    #circuit-connect-overlay .circuit-status-card strong {
      display: block;
      margin-top: 3px;
      font-size: 14px;
      color: #f0fbff;
    }
    #circuit-connect-overlay .circuit-bar {
      height: 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      overflow: hidden;
      margin-top: 8px;
      border: 1px solid rgba(122, 230, 255, 0.12);
    }
    #circuit-connect-overlay .circuit-bar i {
      display: block;
      height: 100%;
      width: 0;
      background: linear-gradient(90deg, #54f1ff, #ffc861 54%, #ff5f85);
      transition: width 140ms ease;
    }
    #circuit-connect-overlay .circuit-stakes,
    #circuit-connect-overlay .circuit-feedback,
    #circuit-connect-overlay .circuit-log-shell {
      padding: 8px 9px;
    }
    #circuit-connect-overlay .circuit-stakes[data-tone="critical"] {
      border-color: rgba(255, 95, 133, 0.36);
    }
    #circuit-connect-overlay .circuit-stakes[data-tone="warning"] {
      border-color: rgba(255, 181, 92, 0.28);
    }
    #circuit-connect-overlay .circuit-stakes[data-tone="stable"] {
      border-color: rgba(141, 255, 106, 0.22);
    }
    #circuit-connect-overlay .circuit-stakes-title,
    #circuit-connect-overlay .circuit-feedback-title,
    #circuit-connect-overlay .circuit-log-title {
      margin: 0 0 4px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      color: rgba(147, 231, 248, 0.82);
    }
    #circuit-connect-overlay .circuit-stakes-copy,
    #circuit-connect-overlay .circuit-feedback-copy {
      font-size: 12px;
      line-height: 1.42;
      color: #def6ff;
    }
    #circuit-connect-overlay .circuit-feedback[data-tone="warning"] {
      border-color: rgba(255, 181, 92, 0.28);
    }
    #circuit-connect-overlay .circuit-feedback[data-tone="critical"] {
      border-color: rgba(255, 95, 133, 0.32);
    }
    #circuit-connect-overlay .circuit-log {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 4px;
      max-height: 90px;
      overflow: auto;
    }
    #circuit-connect-overlay .circuit-log li {
      font-size: 11px;
      color: #abdff3;
      line-height: 1.35;
      padding-top: 4px;
      border-top: 1px solid rgba(122, 230, 255, 0.08);
    }
    #circuit-connect-overlay .circuit-log li:first-child {
      border-top: 0;
      padding-top: 0;
      color: #def9ff;
    }
    @media (max-width: 720px) {
      #circuit-connect-overlay .circuit-shell {
        left: 8px;
        right: 8px;
        top: 188px;
        width: auto;
        max-height: min(52vh, 520px);
      }
      #circuit-connect-overlay .circuit-meta,
      #circuit-connect-overlay .circuit-status-grid,
      #circuit-connect-overlay .circuit-actions,
      #circuit-connect-overlay .circuit-support-actions {
        grid-template-columns: 1fr;
      }
    }
  `;
  doc.head.appendChild(style);

  const root = doc.createElement('section');
  root.id = 'circuit-connect-overlay';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="circuit-dim"></div>
    <div class="circuit-shell" role="dialog" aria-live="assertive" aria-label="Circuit Breach">
      <header class="circuit-header">
        <div class="circuit-header-top">
          <p class="circuit-chip">CIRCUIT BREACH</p>
          <span class="circuit-threat" id="circuit-threat">Signal corridor under attack</span>
        </div>
        <div class="circuit-headline">
          <strong class="circuit-node" id="circuit-node">NO NODE LOCK</strong>
          <span class="circuit-sub" id="circuit-sub">Click a control node on the map to lock a repair target.</span>
        </div>
        <div class="circuit-meta">
          <div class="circuit-meta-card">
            <span>Time Remaining</span>
            <strong id="circuit-time">0s</strong>
          </div>
          <div class="circuit-meta-card">
            <span>Integrity</span>
            <strong id="circuit-integrity-copy">0%</strong>
          </div>
          <div class="circuit-meta-card">
            <span>Support</span>
            <strong id="circuit-support">0 charges</strong>
          </div>
        </div>
      </header>

      <div class="circuit-grid">
        <section>
          <div class="circuit-section-head">
            <h3>Objectives</h3>
            <span id="circuit-objective-summary">0 active</span>
          </div>
          <ul class="circuit-objectives" id="circuit-objectives"></ul>
        </section>

        <section class="circuit-actions-shell">
          <div class="circuit-section-head">
            <h3>Actions</h3>
            <span id="circuit-action-summary">Mouse-first controls live</span>
          </div>
          <div class="circuit-actions" id="circuit-actions"></div>
          <div class="circuit-support-actions" id="circuit-support-actions"></div>
        </section>

        <section>
          <div class="circuit-section-head">
            <h3>Status</h3>
            <span id="circuit-status-summary">Integrity watch</span>
          </div>
          <div class="circuit-status-grid" id="circuit-status-grid"></div>
          <div class="circuit-bar"><i id="circuit-integrity"></i></div>
        </section>

        <section class="circuit-stakes" id="circuit-stakes">
          <p class="circuit-stakes-title" id="circuit-stakes-title">Pressure watch</p>
          <div class="circuit-stakes-copy" id="circuit-stakes-copy"></div>
        </section>

        <section class="circuit-feedback" id="circuit-feedback" aria-live="polite">
          <p class="circuit-feedback-title">Latest Response</p>
          <div class="circuit-feedback-copy" id="circuit-feedback-copy">Lock a node and choose a repair action to begin.</div>
        </section>

        <section class="circuit-log-shell">
          <p class="circuit-log-title">Latest Circuit Feed</p>
          <ul class="circuit-log" id="circuit-log"></ul>
        </section>
      </div>
    </div>
  `;
  doc.body.appendChild(root);

  const nodeEl = root.querySelector('#circuit-node');
  const threatEl = root.querySelector('#circuit-threat');
  const subEl = root.querySelector('#circuit-sub');
  const timeEl = root.querySelector('#circuit-time');
  const integrityCopyEl = root.querySelector('#circuit-integrity-copy');
  const supportEl = root.querySelector('#circuit-support');
  const objectiveSummaryEl = root.querySelector('#circuit-objective-summary');
  const actionSummaryEl = root.querySelector('#circuit-action-summary');
  const statusSummaryEl = root.querySelector('#circuit-status-summary');
  const objectiveEl = root.querySelector('#circuit-objectives');
  const actionsEl = root.querySelector('#circuit-actions');
  const supportActionsEl = root.querySelector('#circuit-support-actions');
  const statusGridEl = root.querySelector('#circuit-status-grid');
  const integrityEl = root.querySelector('#circuit-integrity');
  const stakesEl = root.querySelector('#circuit-stakes');
  const stakesTitleEl = root.querySelector('#circuit-stakes-title');
  const stakesCopyEl = root.querySelector('#circuit-stakes-copy');
  const feedbackEl = root.querySelector('#circuit-feedback');
  const feedbackCopyEl = root.querySelector('#circuit-feedback-copy');
  const logEl = root.querySelector('#circuit-log');

  let lastFeedbackText = 'Lock a node and choose a repair action to begin.';
  let lastFeedbackTone = 'info';

  function setFeedback(message, tone = 'info') {
    const text = String(message || '').trim() || 'Circuit command updated.';
    lastFeedbackText = text;
    lastFeedbackTone = tone;
    feedbackEl.dataset.tone = tone;
    feedbackCopyEl.textContent = text;
  }

  function setFeedbackFromResult(result, fallbackSuccess) {
    const safe = sanitizeResult(result);
    if (safe?.ok === false && safe.reason) {
      setFeedback(safe.reason, 'warning');
      return;
    }
    if (safe?.ok === true) {
      setFeedback(fallbackSuccess, 'success');
    }
  }

  async function triggerAction(actionId, fallbackSuccess) {
    if (typeof onAction !== 'function') return;
    setFeedback(`Command queued: ${fallbackSuccess}`, 'info');
    const result = await Promise.resolve(onAction(actionId));
    setFeedbackFromResult(result, fallbackSuccess);
  }

  async function triggerSkip() {
    if (typeof onSkip !== 'function') return;
    setFeedback('Skip requested. Syncing circuit breach outcome...', 'warning');
    await Promise.resolve(onSkip());
  }

  function createActionButton(config) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.action = config.id;
    button.disabled = Boolean(config.disabled);
    button.innerHTML = `
      <span class="circuit-action-key">[${config.primaryKey}] [${config.legacyKey}]</span>
      <span class="circuit-action-label">${config.label}</span>
      <span class="circuit-action-copy">${config.detail}</span>
    `;
    button.addEventListener('click', () => {
      triggerAction(config.id, `${config.label} executed.`);
    });
    return button;
  }

  function createSupportButton(config) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.action = config.id;
    button.disabled = Boolean(config.disabled);
    button.innerHTML = `
      <span class="circuit-action-key">[${config.key}]</span>
      <span class="circuit-action-label">${config.label}</span>
      <span class="circuit-action-copy">${config.detail}</span>
    `;
    button.addEventListener('click', () => {
      triggerAction(config.id, `${config.label} executed.`);
    });
    return button;
  }

  const skipButton = doc.createElement('button');
  skipButton.type = 'button';
  skipButton.className = 'circuit-skip';
  skipButton.innerHTML = `
    <span class="circuit-action-key">[K]</span>
    <span class="circuit-action-label">Skip</span>
    <span class="circuit-action-copy">Spend skip cost, increase danger, and exit the breach under live pressure rules.</span>
  `;
  skipButton.addEventListener('click', () => {
    triggerSkip();
  });

  function render(data = {}) {
    const active = Boolean(data.active);
    root.classList.toggle('hidden', !active);
    if (!active) return;

    const selectedNode = formatNodeLabel(data.selectedNodeId);
    const selectedLocked = Boolean(data.selectedNodeId);
    const timeRemaining = seconds(data.timeLeftMs);
    const integrity = Math.round(Number(data.integrity || 0));
    const supportCharges = Number(data.supportCharges || 0);
    const incompleteObjectives = (data.objectives || []).filter((objective) => !objective.complete).length;
    const pressure = buildPressureSummary(data);
    const stable = Number(data?.linkStates?.stable || 0);
    const unstable = Number(data?.linkStates?.unstable || 0);
    const broken = Number(data?.linkStates?.broken || 0);
    const bridge = Number(data?.linkStates?.bridge || 0);
    const reinforced = Number(data?.linkStates?.reinforced || 0);
    const fractures = Number(data?.fractureTypes?.length || 0);
    const npcActors = Number(data?.npcActors?.length || 0);

    nodeEl.textContent = selectedNode;
    threatEl.textContent = pressure.title;
    subEl.textContent = selectedLocked
      ? `Locked node ${selectedNode}. Keep integrity above the win floor while clearing priority repairs.`
      : 'Click a control node on the map to lock a repair target before issuing commands.';
    timeEl.textContent = `${timeRemaining}s`;
    integrityCopyEl.textContent = `${integrity}%`;
    supportEl.textContent = `${supportCharges} charge${supportCharges === 1 ? '' : 's'}`;
    objectiveSummaryEl.textContent = `${incompleteObjectives} active target${incompleteObjectives === 1 ? '' : 's'}`;
    actionSummaryEl.textContent = selectedLocked
      ? 'Mouse controls live. Legacy keys stay active.'
      : 'Node lock required before repair commands.';
    statusSummaryEl.textContent = `${stable} stable / ${unstable + broken} unstable`;

    objectiveEl.replaceChildren();
    (data.objectives || []).forEach((objective, index) => {
      const li = doc.createElement('li');
      const tone = objectiveTone(objective);
      li.className = 'circuit-objective';
      li.dataset.tone = tone;
      li.innerHTML = `
        <span class="circuit-objective-mark">${objectivePrefix(index, objective)}</span>
        <div class="circuit-objective-body">
          <div class="circuit-objective-title">${describeObjective(objective)}</div>
          <span class="circuit-objective-detail">${objective.complete ? 'Resolved' : 'Time pressure active'}</span>
        </div>
        <span class="circuit-objective-time">${objective.complete ? 'OK' : `${seconds(objective.timeLeftMs)}s`}</span>
      `;
      objectiveEl.appendChild(li);
    });

    actionsEl.replaceChildren();
    buildActionCatalog(data).forEach((config) => {
      actionsEl.appendChild(createActionButton(config));
    });
    actionsEl.appendChild(skipButton);

    supportActionsEl.replaceChildren();
    buildSupportActions(data).forEach((config) => {
      supportActionsEl.appendChild(createSupportButton(config));
    });

    statusGridEl.innerHTML = [
      { label: 'Stable Links', value: stable },
      { label: 'Unstable Links', value: unstable },
      { label: 'Broken Links', value: broken },
      { label: 'Bridge or Reinforced', value: bridge + reinforced },
      { label: 'Fracture Types', value: fractures },
      { label: 'NPC Assist Teams', value: npcActors },
    ].map((item) => `
      <div class="circuit-status-card">
        <span>${item.label}</span>
        <strong>${item.value}</strong>
      </div>
    `).join('');

    integrityEl.style.width = `${clamp(integrity, 0, 100)}%`;

    stakesEl.dataset.tone = pressure.tone;
    stakesTitleEl.textContent = pressure.title;
    stakesCopyEl.textContent = pressure.detail;

    const latestLog = (data.logs || [])[0]?.text || '';
    if (latestLog) {
      const keepWarning = lastFeedbackTone === 'warning' && lastFeedbackText;
      if (!keepWarning) {
        setFeedback(latestLog, pressure.tone === 'critical' ? 'critical' : 'info');
      }
    } else if (!lastFeedbackText) {
      setFeedback('Lock a node and choose a repair action to begin.', 'info');
    }

    logEl.replaceChildren();
    (data.logs || []).slice(0, 5).forEach((entry) => {
      const li = doc.createElement('li');
      li.textContent = entry.text;
      logEl.appendChild(li);
    });
  }

  return { render };
}
