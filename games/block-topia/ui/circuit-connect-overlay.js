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

function formatEdgeLabel(edgeId = '') {
  return String(edgeId || '').replace(/\|/g, ' / ').replace(/[-_]/g, ' ').toUpperCase();
}

function objectiveTone(objective) {
  if (!objective) return 'pending';
  if (objective.complete) return 'complete';
  if ((Number(objective.timeLeftMs) || 0) <= 6000) return 'critical';
  if ((Number(objective.timeLeftMs) || 0) <= 12000) return 'warning';
  return 'pending';
}

function objectivePrefix(index, objective) {
  if (objective?.complete) return 'OK';
  return `P${index + 1}`;
}

function describeObjective(objective) {
  const from = objective?.fromId ? formatNodeLabel(objective.fromId) : '';
  const to = objective?.toId ? formatNodeLabel(objective.toId) : '';
  if (objective?.type === 'restore_critical_path' && from && to) {
    return `${objective.label} - ${from} to ${to}`;
  }
  if (objective?.type === 'reconnect_cluster' && from && to) {
    return `${objective.label} - reconnect ${from} to ${to}`;
  }
  if (objective?.type === 'stabilize_corridor' && objective?.edgeId) {
    return `${objective.label} - ${formatEdgeLabel(objective.edgeId)}`;
  }
  if (objective?.type === 'minimum_integrity') {
    return `${objective.label} - integrity floor must hold`;
  }
  return String(objective?.label || 'Stabilize the lane');
}

function getPriorityObjective(data) {
  const objectives = (data?.objectives || []).filter((objective) => !objective.complete);
  if (!objectives.length) return null;
  return objectives
    .slice()
    .sort((a, b) => {
      const aIntegrity = a.type === 'minimum_integrity' ? 1 : 0;
      const bIntegrity = b.type === 'minimum_integrity' ? 1 : 0;
      if (aIntegrity !== bIntegrity) return aIntegrity - bIntegrity;
      return (Number(a.timeLeftMs) || 0) - (Number(b.timeLeftMs) || 0);
    })[0];
}

function getTargetNodeId(data, objective) {
  const selected = String(data?.selectedNodeId || '');
  if (!objective) return selected;
  if (objective.fromId && objective.toId) {
    if (selected === objective.fromId || selected === objective.toId) return selected;
    return objective.fromId;
  }
  if (objective.fromId) return objective.fromId;
  if (objective.toId) return objective.toId;
  if (objective.edgeId) {
    const edge = (data?.links || []).find((entry) => entry.id === objective.edgeId);
    if (selected === edge?.fromId || selected === edge?.toId) return selected;
    return edge?.fromId || edge?.toId || selected;
  }
  if (selected) return selected;
  const fallbackEdge = (data?.links || []).find((entry) => entry.state === 'broken' || entry.state === 'unstable');
  return fallbackEdge?.fromId || fallbackEdge?.toId || '';
}

function getAdjacentEdges(data, nodeId) {
  if (!nodeId) return [];
  return (data?.links || []).filter((edge) => edge.fromId === nodeId || edge.toId === nodeId);
}

function getRecommendedAction(data, objective, targetNodeId) {
  const adjacent = getAdjacentEdges(data, targetNodeId);
  const hasBroken = adjacent.some((edge) => edge.state === 'broken');
  const hasUnstable = adjacent.some((edge) => edge.state === 'unstable');
  const hasActive = adjacent.some((edge) => edge.state === 'stable' || edge.state === 'bridge' || edge.state === 'reinforced');
  const integrity = Number(data?.integrity || 0);

  if (objective?.type === 'reconnect_cluster' || objective?.type === 'restore_critical_path') {
    if (hasBroken) return 'reconnectLink';
    if (hasUnstable) return 'stabilizeLink';
    return integrity < 72 ? 'rerouteNode' : 'reinforceConnection';
  }
  if (objective?.type === 'stabilize_corridor') {
    if (hasUnstable || hasBroken) return 'stabilizeLink';
    return integrity < 72 ? 'rerouteNode' : 'reinforceConnection';
  }
  if (objective?.type === 'minimum_integrity') {
    if (integrity < 72) return 'rerouteNode';
    if (hasBroken && Number(data?.supportCharges || 0) > 0) return 'deployBridge';
    if (hasUnstable) return 'stabilizeLink';
    if (hasActive) return 'reinforceConnection';
  }
  if (hasBroken) return 'reconnectLink';
  if (hasUnstable) return 'stabilizeLink';
  if (integrity < 72) return 'rerouteNode';
  if (hasActive) return 'reinforceConnection';
  return 'rerouteNode';
}

function buildPriorityCopy(data, objective, targetNodeId, recommendedActionId) {
  const targetLabel = formatNodeLabel(targetNodeId);
  if (!targetNodeId) {
    return 'Lock the highlighted target node, then follow the highlighted action.';
  }
  if (recommendedActionId === 'reconnectLink') {
    return `Reconnect the broken lane at ${targetLabel} before pressure spreads.`;
  }
  if (recommendedActionId === 'stabilizeLink') {
    return `Stabilize the unstable corridor touching ${targetLabel} right now.`;
  }
  if (recommendedActionId === 'rerouteNode') {
    return objective?.type === 'minimum_integrity'
      ? `Restore integrity at ${targetLabel} before the breach floor collapses.`
      : `Restore signal flow through ${targetLabel} to keep the route alive.`;
  }
  if (recommendedActionId === 'deployBridge') {
    return `Spend a bridge charge at ${targetLabel} to cross the broken gap fast.`;
  }
  if (recommendedActionId === 'reinforceConnection') {
    return `Reinforce the live lane at ${targetLabel} to hold the network together.`;
  }
  return `Protect ${targetLabel} and clear the next live objective.`;
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
      detail: 'Collapse risk is live. Broken corridors or low integrity can end the breach immediately.',
    };
  }
  if (integrity <= 52 || unstable >= 5 || incomplete >= 3) {
    return {
      tone: 'warning',
      title: 'Pressure rising',
      detail: 'Instability is climbing. Clear the highlighted target before the timer and fracture count snowball.',
    };
  }
  if (fractures > 0 || incomplete > 0) {
    return {
      tone: 'watch',
      title: 'Signal under watch',
      detail: 'The breach is still active. Keep integrity above the floor and finish the priority path.',
    };
  }
  return {
    tone: 'stable',
    title: 'Network stable',
    detail: 'Core lanes are holding. Reinforce and keep the integrity floor protected for a clean win.',
  };
}

function buildActionCatalog(data, targetNodeId) {
  const targetLocked = Boolean(targetNodeId);
  return [
    {
      id: 'reconnectLink',
      primaryKey: '1',
      legacyKey: 'A',
      label: 'Reconnect Node',
      detail: targetLocked
        ? `Repair a broken adjacent lane from ${formatNodeLabel(targetNodeId)}.`
        : 'Lock a target node first, then repair a broken adjacent lane.',
      disabled: !targetLocked,
    },
    {
      id: 'rerouteNode',
      primaryKey: '2',
      legacyKey: 'D',
      label: 'Restore Path',
      detail: targetLocked
        ? `Push traffic through ${formatNodeLabel(targetNodeId)} to recover integrity and reduce pressure.`
        : 'Lock a target node first, then reroute pressure away from the breach.',
      disabled: !targetLocked,
    },
    {
      id: 'stabilizeLink',
      primaryKey: '3',
      legacyKey: 'S',
      label: 'Stabilize Link',
      detail: targetLocked
        ? `Convert unstable corridors near ${formatNodeLabel(targetNodeId)} back into stable links.`
        : 'Lock a target node first, then stabilize an unstable corridor.',
      disabled: !targetLocked,
    },
  ];
}

function buildSupportActions(data, targetNodeId) {
  const targetLocked = Boolean(targetNodeId);
  const supportCharges = Number(data?.supportCharges || 0);
  return [
    {
      id: 'deployBridge',
      key: 'F',
      label: 'Deploy Bridge',
      detail: supportCharges > 0
        ? `${supportCharges} recruiter bridge charge${supportCharges === 1 ? '' : 's'} ready for a broken lane.`
        : 'No bridge charges left until recruiter support arrives again.',
      disabled: !targetLocked || supportCharges <= 0,
    },
    {
      id: 'reinforceConnection',
      key: 'G',
      label: 'Reinforce Link',
      detail: targetLocked
        ? `Fortify an active lane connected to ${formatNodeLabel(targetNodeId)}.`
        : 'Lock a target node first, then reinforce an active connection.',
      disabled: !targetLocked,
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
        radial-gradient(circle at 80% 18%, rgba(94,242,255,0.1), transparent 20%),
        linear-gradient(180deg, rgba(3,8,18,0.04), rgba(3,8,18,0.18));
      backdrop-filter: blur(1px);
    }
    #circuit-connect-overlay .circuit-shell {
      position: absolute;
      top: 92px;
      right: 14px;
      width: min(430px, calc(100vw - 28px));
      max-height: min(74vh, 760px);
      overflow: auto;
      padding: 11px 11px 12px;
      border: 1px solid rgba(122, 230, 255, 0.32);
      border-radius: 4px;
      background:
        linear-gradient(180deg, rgba(4, 14, 30, 0.95), rgba(3, 10, 21, 0.91)),
        rgba(5, 11, 22, 0.9);
      box-shadow: 0 26px 58px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255,255,255,0.05);
      color: #def7ff;
      pointer-events: auto;
      transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
    }
    #circuit-connect-overlay .circuit-shell[data-reaction="success"] {
      border-color: rgba(141, 255, 106, 0.55);
      box-shadow: 0 28px 62px rgba(0, 0, 0, 0.38), 0 0 0 1px rgba(141, 255, 106, 0.18), 0 0 24px rgba(141, 255, 106, 0.18);
      transform: translateY(-1px);
    }
    #circuit-connect-overlay .circuit-shell[data-reaction="failure"] {
      border-color: rgba(255, 95, 133, 0.58);
      box-shadow: 0 28px 62px rgba(0, 0, 0, 0.38), 0 0 0 1px rgba(255, 95, 133, 0.18), 0 0 24px rgba(255, 95, 133, 0.16);
    }
    #circuit-connect-overlay .circuit-shell[data-reaction="info"] {
      border-color: rgba(122, 230, 255, 0.42);
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
    #circuit-connect-overlay .circuit-priority {
      display: grid;
      gap: 4px;
      padding: 8px 9px;
      border: 1px solid rgba(94, 242, 255, 0.24);
      border-radius: 4px;
      background: linear-gradient(180deg, rgba(10, 23, 46, 0.92), rgba(7, 16, 33, 0.8));
    }
    #circuit-connect-overlay .circuit-priority-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #82efff;
    }
    #circuit-connect-overlay .circuit-priority-copy {
      font-size: 14px;
      font-weight: 700;
      color: #f3fcff;
      line-height: 1.34;
    }
    #circuit-connect-overlay .circuit-priority-sub {
      font-size: 11px;
      color: rgba(187, 235, 247, 0.8);
      line-height: 1.36;
    }
    #circuit-connect-overlay .circuit-headline {
      display: grid;
      gap: 4px;
    }
    #circuit-connect-overlay .circuit-node-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    #circuit-connect-overlay .circuit-node {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #f2fbff;
    }
    #circuit-connect-overlay .circuit-target-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      border-radius: 999px;
      border: 1px solid rgba(94, 242, 255, 0.3);
      background: rgba(6, 22, 42, 0.9);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #b7f7ff;
      box-shadow: 0 0 0 1px rgba(94, 242, 255, 0.08), 0 0 18px rgba(94, 242, 255, 0.12);
    }
    #circuit-connect-overlay .circuit-target-chip strong {
      color: #f6fdff;
      font-size: 11px;
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
    #circuit-connect-overlay .circuit-objective[data-priority="true"] {
      border-color: rgba(94, 242, 255, 0.46);
      box-shadow: inset 0 0 0 1px rgba(94, 242, 255, 0.12), 0 0 20px rgba(94, 242, 255, 0.08);
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
      width: 30px;
      height: 30px;
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
    #circuit-connect-overlay .circuit-actions,
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
      min-height: 66px;
      transition: border-color 120ms ease, transform 120ms ease, background 120ms ease, box-shadow 120ms ease;
    }
    #circuit-connect-overlay button:hover:not(:disabled),
    #circuit-connect-overlay button:focus-visible:not(:disabled) {
      border-color: rgba(122, 230, 255, 0.5);
      background: linear-gradient(180deg, rgba(12, 36, 68, 0.96), rgba(10, 27, 52, 0.86));
      transform: translateY(-1px);
      outline: none;
    }
    #circuit-connect-overlay button[data-recommended="true"] {
      border-color: rgba(255, 213, 102, 0.72);
      background: linear-gradient(180deg, rgba(41, 34, 10, 0.96), rgba(24, 20, 8, 0.86));
      box-shadow: 0 0 0 1px rgba(255, 213, 102, 0.16), 0 0 18px rgba(255, 213, 102, 0.24);
      animation: circuitRecommendedPulse 1400ms ease-in-out infinite;
    }
    #circuit-connect-overlay button[data-recommended="true"] .circuit-action-key {
      color: #ffd978;
    }
    #circuit-connect-overlay button[data-recommended="true"] .circuit-action-label {
      color: #fff6d4;
    }
    #circuit-connect-overlay button:disabled {
      cursor: not-allowed;
      opacity: 0.48;
      animation: none;
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
      min-height: 66px;
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
    #circuit-connect-overlay .circuit-feedback[data-tone="critical"],
    #circuit-connect-overlay .circuit-feedback[data-tone="failure"] {
      border-color: rgba(255, 95, 133, 0.32);
    }
    #circuit-connect-overlay .circuit-feedback[data-tone="success"] {
      border-color: rgba(141, 255, 106, 0.32);
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
    @keyframes circuitRecommendedPulse {
      0%, 100% {
        box-shadow: 0 0 0 1px rgba(255, 213, 102, 0.16), 0 0 18px rgba(255, 213, 102, 0.2);
      }
      50% {
        box-shadow: 0 0 0 1px rgba(255, 213, 102, 0.24), 0 0 28px rgba(255, 213, 102, 0.34);
      }
    }
    @media (max-width: 720px) {
      #circuit-connect-overlay .circuit-shell {
        left: 8px;
        right: 8px;
        top: 180px;
        width: auto;
        max-height: min(54vh, 560px);
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
        <div class="circuit-priority">
          <span class="circuit-priority-label">Priority</span>
          <strong class="circuit-priority-copy" id="circuit-priority-copy">PRIORITY: Lock the highlighted node and follow the highlighted action.</strong>
          <span class="circuit-priority-sub" id="circuit-priority-sub">Mouse-only play is live. Keyboard shortcuts remain visible as backup.</span>
        </div>
        <div class="circuit-headline">
          <div class="circuit-node-row">
            <strong class="circuit-node" id="circuit-node">NO NODE LOCK</strong>
            <span class="circuit-target-chip" id="circuit-target-chip">TARGET <strong id="circuit-target-copy">NONE</strong></span>
          </div>
          <span class="circuit-sub" id="circuit-sub">The highlighted map node is your live repair target.</span>
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

  const shellEl = root.querySelector('.circuit-shell');
  const nodeEl = root.querySelector('#circuit-node');
  const targetCopyEl = root.querySelector('#circuit-target-copy');
  const threatEl = root.querySelector('#circuit-threat');
  const priorityCopyEl = root.querySelector('#circuit-priority-copy');
  const prioritySubEl = root.querySelector('#circuit-priority-sub');
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

  let feedbackState = {
    text: 'Lock a node and choose a repair action to begin.',
    tone: 'info',
    reaction: '',
    until: 0,
  };

  function setFeedback(message, tone = 'info', reaction = '') {
    const text = String(message || '').trim() || 'Circuit command updated.';
    feedbackState = {
      text,
      tone,
      reaction,
      until: reaction ? Date.now() + 1400 : 0,
    };
    feedbackEl.dataset.tone = tone;
    feedbackCopyEl.textContent = text;
    shellEl.dataset.reaction = reaction || (tone === 'failure' ? 'failure' : '');
  }

  function syncReactionState() {
    if (feedbackState.until && Date.now() > feedbackState.until) {
      feedbackState.until = 0;
      shellEl.dataset.reaction = '';
    }
  }

  function setFeedbackFromResult(result, fallbackSuccess) {
    const safe = sanitizeResult(result);
    if (safe?.ok === false && safe.reason) {
      setFeedback(`Command failed: ${safe.reason}`, 'failure', 'failure');
      return;
    }
    if (safe?.ok === true) {
      setFeedback(`Command success: ${fallbackSuccess}`, 'success', 'success');
    }
  }

  async function triggerAction(actionId, fallbackSuccess) {
    if (typeof onAction !== 'function') return;
    setFeedback(`Command sent: ${fallbackSuccess}`, 'info', 'info');
    const result = await Promise.resolve(onAction(actionId));
    setFeedbackFromResult(result, fallbackSuccess);
  }

  async function triggerSkip() {
    if (typeof onSkip !== 'function') return;
    setFeedback('Skip requested. Applying skip cost and live pressure rules...', 'warning', 'failure');
    await Promise.resolve(onSkip());
  }

  function createActionButton(config, recommendedActionId) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.action = config.id;
    button.dataset.recommended = config.id === recommendedActionId ? 'true' : 'false';
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

  function createSupportButton(config, recommendedActionId) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.action = config.id;
    button.dataset.recommended = config.id === recommendedActionId ? 'true' : 'false';
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
    <span class="circuit-action-copy">Spend skip cost, raise danger, and exit the breach under live pressure rules.</span>
  `;
  skipButton.addEventListener('click', () => {
    triggerSkip();
  });

  function render(data = {}) {
    const active = Boolean(data.active);
    root.classList.toggle('hidden', !active);
    if (!active) return;

    syncReactionState();

    const priorityObjective = getPriorityObjective(data);
    const targetNodeId = getTargetNodeId(data, priorityObjective);
    const recommendedActionId = getRecommendedAction(data, priorityObjective, targetNodeId);
    const selectedNode = formatNodeLabel(data.selectedNodeId);
    const targetNode = formatNodeLabel(targetNodeId);
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
    targetCopyEl.textContent = targetNode;
    threatEl.textContent = pressure.title;
    priorityCopyEl.textContent = `PRIORITY: ${buildPriorityCopy(data, priorityObjective, targetNodeId, recommendedActionId)}`;
    prioritySubEl.textContent = priorityObjective
      ? `Target ${targetNode}. The highlighted button is the fastest next step.`
      : 'All core objectives are clear. Hold integrity and keep pressure from climbing again.';
    subEl.textContent = targetNodeId
      ? `Map target locked on ${targetNode}. Mouse-click buttons are primary; keyboard is backup support.`
      : 'The highlighted map node is your live repair target.';
    timeEl.textContent = `${timeRemaining}s`;
    integrityCopyEl.textContent = `${integrity}%`;
    supportEl.textContent = `${supportCharges} charge${supportCharges === 1 ? '' : 's'}`;
    objectiveSummaryEl.textContent = `${incompleteObjectives} active target${incompleteObjectives === 1 ? '' : 's'}`;
    actionSummaryEl.textContent = targetNodeId
      ? `Recommended command is highlighted for ${targetNode}.`
      : 'Target node lock required before repair commands.';
    statusSummaryEl.textContent = `${stable} stable / ${unstable + broken} unstable`;

    objectiveEl.replaceChildren();
    (data.objectives || []).forEach((objective, index) => {
      const li = doc.createElement('li');
      const tone = objectiveTone(objective);
      const isPriority = priorityObjective && objective.id === priorityObjective.id;
      li.className = 'circuit-objective';
      li.dataset.tone = tone;
      li.dataset.priority = isPriority ? 'true' : 'false';
      li.innerHTML = `
        <span class="circuit-objective-mark">${objectivePrefix(index, objective)}</span>
        <div class="circuit-objective-body">
          <div class="circuit-objective-title">${describeObjective(objective)}</div>
          <span class="circuit-objective-detail">${objective.complete ? 'Resolved' : isPriority ? `Target ${targetNode}` : 'Time pressure active'}</span>
        </div>
        <span class="circuit-objective-time">${objective.complete ? 'OK' : `${seconds(objective.timeLeftMs)}s`}</span>
      `;
      objectiveEl.appendChild(li);
    });

    actionsEl.replaceChildren();
    buildActionCatalog(data, targetNodeId).forEach((config) => {
      actionsEl.appendChild(createActionButton(config, recommendedActionId));
    });
    actionsEl.appendChild(skipButton);

    supportActionsEl.replaceChildren();
    buildSupportActions(data, targetNodeId).forEach((config) => {
      supportActionsEl.appendChild(createSupportButton(config, recommendedActionId));
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
    if (latestLog && !feedbackState.until) {
      feedbackEl.dataset.tone = pressure.tone === 'critical' ? 'critical' : 'info';
      feedbackCopyEl.textContent = latestLog;
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
