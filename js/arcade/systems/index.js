import * as upgrade from '/js/arcade/systems/upgrade-system.js';
import * as director from '/js/arcade/systems/director-system.js';
import * as event from '/js/arcade/systems/event-system.js';
import * as mutation from '/js/arcade/systems/mutation-system.js';
import * as boss from '/js/arcade/systems/boss-system.js';
import * as risk from '/js/arcade/systems/risk-system.js';
import * as meta from '/js/arcade/systems/meta-system.js';
import * as feedback from '/js/arcade/systems/feedback-system.js';
import * as factionEffect from '/js/arcade/systems/faction-effect-system.js';
import * as factionWar from '/js/arcade/systems/faction-war-system.js';
import * as globalRotation from '/js/arcade/systems/global-rotation-system.js';
import * as factionMissions from '/js/arcade/systems/faction-missions.js';
import * as factionStreaks from '/js/arcade/systems/faction-streaks.js';
import * as liveActivity from '/js/arcade/systems/live-activity.js';
import * as factionRanks from '/js/arcade/systems/faction-ranks.js';

export * from '/js/arcade/systems/cross-game-modifier-system.js';
export * from '/js/arcade/systems/faction-effect-system.js';

function createPassthroughSystem(name, apiModule) {
  return function () {
    return {
      name: name,
      api: apiModule,
      init: function (context) {
        context.systems = context.systems || {};
        context.systems[name] = apiModule;
      },
    };
  };
}

export const createUpgradeSystem = createPassthroughSystem('upgrade', upgrade);
export const createDirectorSystem = createPassthroughSystem('director', director);
export const createEventSystem = createPassthroughSystem('event', event);
export const createMutationSystem = createPassthroughSystem('mutation', mutation);
export const createBossSystem = createPassthroughSystem('boss', boss);
export const createRiskSystem = createPassthroughSystem('risk', risk);
export const createMetaSystem = createPassthroughSystem('meta', meta);
export const createFeedbackSystem = createPassthroughSystem('feedback', feedback);