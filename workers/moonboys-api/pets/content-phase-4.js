function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export const PET_REGION_CONTENT = deepFreeze({
  moon_alley: {
    encounters: ['lost_delivery_drone', 'graffiti_wall_request', 'moon_crate_found'],
    boss: 'alley_king',
    reward_focus: ['scrap_metal', 'moon_fabric'],
  },
  neon_rooftops: {
    encounters: ['rooftop_race', 'signal_hijack', 'neon_storm'],
    boss: 'skyline_hunter',
    reward_focus: ['battery_cell', 'spray_core'],
  },
  rugpull_mines: {
    encounters: ['unstable_tunnel', 'abandoned_rig', 'miner_rescue'],
    boss: 'rugpull_drill_beast',
    reward_focus: ['crystal_shard', 'scrap_metal'],
  },
  blockchain_sewers: {
    encounters: ['toxic_flow', 'hidden_node', 'data_leech_swarm'],
    boss: 'sewer_validator',
    reward_focus: ['battery_cell', 'crystal_shard'],
  },
  kaiju_district: {
    encounters: ['evacuation_route', 'kaiju_footprint', 'collapsed_arcade'],
    boss: 'district_destroyer',
    reward_focus: ['kaiju_fragment', 'arena_token'],
  },
  moon_citadel: {
    encounters: ['citadel_gate', 'royal_archive', 'zero_gravity_trial'],
    boss: 'moon_warlord_prime',
    reward_focus: ['arena_token', 'spray_core', 'kaiju_fragment'],
  },
});

export const PET_DISTRICT_APPROACHES = deepFreeze({
  "bold": {
    "label": "PRESS THE ADVANTAGE",
    "detail": "Highest mastery and payout; mistakes hit harder.",
    "risk_delta": 12,
    "mastery_success": 30,
    "mastery_setback": 12,
    "reward_multiplier": 1.18
  },
  "tactical": {
    "label": "READ THE STREET",
    "detail": "Balanced odds, mastery and district rewards.",
    "risk_delta": 0,
    "mastery_success": 25,
    "mastery_setback": 12,
    "reward_multiplier": 1
  },
  "careful": {
    "label": "TAKE THE CLEAN ROUTE",
    "detail": "Safer execution with a smaller reward ceiling.",
    "risk_delta": -12,
    "mastery_success": 20,
    "mastery_setback": 10,
    "reward_multiplier": 0.88
  }
});

export const PET_DISTRICT_ENCOUNTERS = deepFreeze({
  "lost_delivery_drone": {
    "title": "Drone Down",
    "intro": "A courier drone sparks beneath a fresh tag while three crews close in.",
    "objective": "Recover its memory core before the alley decides who owns it.",
    "threat": 2,
    "opponent": {
      "name": "Patchwire Jackals",
      "role": "salvage crew",
      "intro": "Patchwire Jackals controls this district pressure point."
    }
  },
  "graffiti_wall_request": {
    "title": "The Living Wall",
    "intro": "A blank shutter requests a crew mark through a corrupted display.",
    "objective": "Finish the mural before rival code overwrites it.",
    "threat": 1,
    "opponent": {
      "name": "Null Taggers",
      "role": "rival artists",
      "intro": "Null Taggers controls this district pressure point."
    }
  },
  "moon_crate_found": {
    "title": "Crate 77",
    "intro": "An unregistered Moon Crate pulses behind a locked noodle bar.",
    "objective": "Secure the crate before its beacon wakes.",
    "threat": 3,
    "opponent": {
      "name": "Latchkey Twins",
      "role": "crate runners",
      "intro": "Latchkey Twins controls this district pressure point."
    }
  },
  "rooftop_race": {
    "title": "Above The Grid",
    "intro": "A courier relay opens across rain-slick neon roofs.",
    "objective": "Carry the relay key through the skyline checkpoint.",
    "threat": 3,
    "opponent": {
      "name": "Vanta Dash",
      "role": "roof runner",
      "intro": "Vanta Dash controls this district pressure point."
    }
  },
  "signal_hijack": {
    "title": "Dead Air Crown",
    "intro": "A pirate loop has replaced every rooftop broadcast.",
    "objective": "Seize the transmitter and control the channel.",
    "threat": 4,
    "opponent": {
      "name": "Choir-9",
      "role": "signal pirate",
      "intro": "Choir-9 controls this district pressure point."
    }
  },
  "neon_storm": {
    "title": "Static Monsoon",
    "intro": "A charged storm pins delivery crews above the magrail.",
    "objective": "Cross the roof and ground the storm core.",
    "threat": 4,
    "opponent": {
      "name": "Arc Wraith",
      "role": "weather construct",
      "intro": "Arc Wraith controls this district pressure point."
    }
  },
  "unstable_tunnel": {
    "title": "Faultline Shift",
    "intro": "The mine map redraws itself as supports shear.",
    "objective": "Stabilize the route before the lower crew is sealed in.",
    "threat": 3,
    "opponent": {
      "name": "Crackjaw Mole",
      "role": "tunnel brute",
      "intro": "Crackjaw Mole controls this district pressure point."
    }
  },
  "abandoned_rig": {
    "title": "Ghost Hash Rig",
    "intro": "A dead rig restarts with somebody else's wallet keys.",
    "objective": "Cut the rogue process without losing the crystal.",
    "threat": 4,
    "opponent": {
      "name": "Forklift-0",
      "role": "autonomous rig",
      "intro": "Forklift-0 controls this district pressure point."
    }
  },
  "miner_rescue": {
    "title": "Nine Lights Missing",
    "intro": "Nine helmet signals blink below a collapsed shelf.",
    "objective": "Reach and escort every survivor.",
    "threat": 5,
    "opponent": {
      "name": "The Deep Tax",
      "role": "mine anomaly",
      "intro": "The Deep Tax controls this district pressure point."
    }
  },
  "toxic_flow": {
    "title": "Green Ledger",
    "intro": "A chemical spill is rewriting sewer route signs.",
    "objective": "Seal the flow and recover the validator sample.",
    "threat": 3,
    "opponent": {
      "name": "Sludge Auditor",
      "role": "waste enforcer",
      "intro": "Sludge Auditor controls this district pressure point."
    }
  },
  "hidden_node": {
    "title": "Node Under Nine",
    "intro": "A forgotten node answers only to street ciphers.",
    "objective": "Bring the node online before scavengers strip it.",
    "threat": 4,
    "opponent": {
      "name": "Packet Rats",
      "role": "data scavengers",
      "intro": "Packet Rats controls this district pressure point."
    }
  },
  "data_leech_swarm": {
    "title": "Swarm Protocol",
    "intro": "Data leeches wall off the pump station.",
    "objective": "Break the swarm and keep district water online.",
    "threat": 5,
    "opponent": {
      "name": "Queen Checksum",
      "role": "swarm core",
      "intro": "Queen Checksum controls this district pressure point."
    }
  },
  "evacuation_route": {
    "title": "Last Train Out",
    "intro": "A Kaiju warning closes a platform full of civilians.",
    "objective": "Open a safe corridor before the next impact.",
    "threat": 4,
    "opponent": {
      "name": "Panic Engine",
      "role": "riot machine",
      "intro": "Panic Engine controls this district pressure point."
    }
  },
  "kaiju_footprint": {
    "title": "The Print That Moves",
    "intro": "A footprint contains an impossible city block.",
    "objective": "Map the anomaly before the print closes.",
    "threat": 5,
    "opponent": {
      "name": "Echo Claw",
      "role": "Kaiju remnant",
      "intro": "Echo Claw controls this district pressure point."
    }
  },
  "collapsed_arcade": {
    "title": "Continue?",
    "intro": "An arcade shelter collapses with its generator alive.",
    "objective": "Extract the players and preserve the score core.",
    "threat": 4,
    "opponent": {
      "name": "Cabinet King",
      "role": "possessed arcade",
      "intro": "Cabinet King controls this district pressure point."
    }
  },
  "citadel_gate": {
    "title": "Zero Invitation",
    "intro": "The Citadel offers entry to one crew and erasure to the rest.",
    "objective": "Cross without surrendering identity.",
    "threat": 5,
    "opponent": {
      "name": "Gate Saint",
      "role": "citadel sentinel",
      "intro": "Gate Saint controls this district pressure point."
    }
  },
  "royal_archive": {
    "title": "Crown Memory",
    "intro": "The archive names your Moonpet twice.",
    "objective": "Secure the record and choose its legacy.",
    "threat": 5,
    "opponent": {
      "name": "Archivist Pale",
      "role": "memory keeper",
      "intro": "Archivist Pale controls this district pressure point."
    }
  },
  "zero_gravity_trial": {
    "title": "No Ground Rules",
    "intro": "The final trial removes gravity and familiar timing.",
    "objective": "Reach the crown beacon before reset.",
    "threat": 5,
    "opponent": {
      "name": "Orbit Warden",
      "role": "trial champion",
      "intro": "Orbit Warden controls this district pressure point."
    }
  }
});

export const PET_DISTRICT_COMPLICATIONS = deepFreeze([
  { key: 'blackout', label: 'BLACKOUT', intro: 'A district-wide blackout removes the safe route.', objective: 'Complete the objective before emergency power returns.', threat_delta: 1 },
  { key: 'rival_clock', label: 'RIVAL CLOCK', intro: 'A rival crew broadcasts a live completion timer.', objective: 'Finish cleanly before the rival clock expires.', threat_delta: 1 },
  { key: 'civilian_route', label: 'CIVILIAN ROUTE', intro: 'A civilian convoy crosses the conflict zone.', objective: 'Complete the objective while keeping the public route open.', threat_delta: 0 },
  { key: 'acid_rain', label: 'ACID RAIN', intro: 'Corrosive rain turns every exposed surface dangerous.', objective: 'Secure cover, then complete the objective in short bursts.', threat_delta: 1 },
  { key: 'false_signal', label: 'FALSE SIGNAL', intro: 'Three decoy signals mirror the real target.', objective: 'Identify the authentic signal before committing resources.', threat_delta: 0 },
  { key: 'crew_debt', label: 'CREW DEBT', intro: 'An old ally calls in a favour during the operation.', objective: 'Complete the objective without abandoning the ally.', threat_delta: 1 },
]);

export const PET_EVENT_CHAINS = deepFreeze({
  "lost_delivery_drone": {
    "title": "THE DRONE THAT REMEMBERED",
    "steps": [
      "inspect_wreckage",
      "trace_owner",
      "return_or_salvage"
    ],
    "final_outcomes": [
      "bond_reward",
      "material_reward",
      "job_unlock"
    ],
    "step_content": {
      "inspect_wreckage": {
        "title": "Sparks In The Rain",
        "intro": "The drone shields one damaged memory shard.",
        "objective": "Learn what it protected.",
        "choices": [
          {
            "key": "comfort_signal",
            "label": "CALM THE DRONE",
            "detail": "Build trust before access.",
            "result_copy": "The drone shares a clean owner trace.",
            "reward_bonus": {
              "pet_xp": 4
            }
          },
          {
            "key": "hotwire_core",
            "label": "HOTWIRE THE CORE",
            "detail": "Pull the route fast.",
            "result_copy": "The route appears with a warning sigil.",
            "reward_bonus": {
              "moon_gold": 4
            }
          }
        ]
      },
      "trace_owner": {
        "title": "A Name Between Blocks",
        "intro": "The trace points to an erased courier.",
        "objective": "Find who deleted the courier.",
        "choices": [
          {
            "key": "ask_crews",
            "label": "WORK THE STREET",
            "detail": "Trade reputation for witnesses.",
            "result_copy": "Three crews name the same buyer.",
            "reward_bonus": {
              "style_tokens": 1
            }
          },
          {
            "key": "follow_checksum",
            "label": "FOLLOW THE CHECKSUM",
            "detail": "Take the silent route.",
            "result_copy": "A checksum opens a hidden dispatch room.",
            "reward_bonus": {
              "pet_xp": 4
            }
          }
        ]
      },
      "return_or_salvage": {
        "title": "Delivery Still Due",
        "intro": "The courier is gone; the package remains.",
        "objective": "Decide what the district remembers.",
        "choices": [
          {
            "key": "finish_delivery",
            "label": "FINISH THE DELIVERY",
            "detail": "Honor the final route.",
            "result_copy": "The receiver tags your crew as trustworthy.",
            "reward_bonus": {
              "pet_xp": 8
            }
          },
          {
            "key": "salvage_legacy",
            "label": "SALVAGE THE LEGACY",
            "detail": "Fund repairs with the parts.",
            "result_copy": "Three street repairs carry the courier's tag.",
            "reward_bonus": {
              "moon_gold": 10
            }
          }
        ]
      }
    }
  },
  "signal_hijack": {
    "title": "VOICE ABOVE THE CITY",
    "steps": [
      "find_transmitter",
      "decode_signal",
      "broadcast_or_block"
    ],
    "final_outcomes": [
      "arena_buff",
      "faction_reputation",
      "event_cache"
    ],
    "step_content": {
      "find_transmitter": {
        "title": "Borrowed Frequency",
        "intro": "A broadcast predicts patrols one minute early.",
        "objective": "Locate its moving transmitter.",
        "choices": [
          {
            "key": "triangulate",
            "label": "TRIANGULATE QUIETLY",
            "detail": "Read the signal patiently.",
            "result_copy": "The transmitter resolves to a rooftop courier.",
            "reward_bonus": {
              "pet_xp": 4
            }
          },
          {
            "key": "bait",
            "label": "BROADCAST A DECOY",
            "detail": "Force the pirate to answer.",
            "result_copy": "The pirate reveals a relay and your position.",
            "reward_bonus": {
              "moon_gold": 4
            }
          }
        ]
      },
      "decode_signal": {
        "title": "The Future Is Compressed",
        "intro": "The packet holds arena telemetry and a personal message.",
        "objective": "Decode it before the wipe.",
        "choices": [
          {
            "key": "split",
            "label": "SPLIT THE CHANNELS",
            "detail": "Isolate both data streams.",
            "result_copy": "Both survive; the message names Choir-9.",
            "reward_bonus": {
              "pet_xp": 4
            }
          },
          {
            "key": "crack_live",
            "label": "CRACK IT LIVE",
            "detail": "Risk the wipe for the source.",
            "result_copy": "A faction sponsor flashes on screen.",
            "reward_bonus": {
              "style_tokens": 1
            }
          }
        ]
      },
      "broadcast_or_block": {
        "title": "Open Channel",
        "intro": "Every crew can hear the captured relay.",
        "objective": "Choose what replaces the hijack.",
        "choices": [
          {
            "key": "free_signal",
            "label": "FREE THE SIGNAL",
            "detail": "Publish the route data.",
            "result_copy": "The skyline answers with independent tags.",
            "reward_bonus": {
              "style_tokens": 2
            }
          },
          {
            "key": "blackout",
            "label": "KILL THE NETWORK",
            "detail": "Protect the data by going dark.",
            "result_copy": "Your crew keeps the only clean map.",
            "reward_bonus": {
              "moon_gold": 10
            }
          }
        ]
      }
    }
  },
  "miner_rescue": {
    "title": "NINE LIGHTS BELOW",
    "steps": [
      "locate_survivors",
      "stabilize_tunnel",
      "escort_team"
    ],
    "final_outcomes": [
      "job_xp",
      "crystal_reward",
      "loyal_trait"
    ],
    "step_content": {
      "locate_survivors": {
        "title": "Helmet Signals",
        "intro": "Nine lights blink below unstable crystal.",
        "objective": "Find a safe path.",
        "choices": [
          {
            "key": "listen",
            "label": "READ THE VIBRATION",
            "detail": "Move through quiet seams.",
            "result_copy": "Your Moonpet maps all nine signals.",
            "reward_bonus": {
              "pet_xp": 4
            }
          },
          {
            "key": "shortcut",
            "label": "CUT A SHORTCUT",
            "detail": "Spend speed now.",
            "result_copy": "The crew is reached as the ceiling counts down.",
            "reward_bonus": {
              "moon_gold": 4
            }
          }
        ]
      },
      "stabilize_tunnel": {
        "title": "Hold The Mountain",
        "intro": "The supports can save crew or crystal cleanly, not both.",
        "objective": "Create extraction time.",
        "choices": [
          {
            "key": "brace",
            "label": "BRACE THE EXIT",
            "detail": "Put rescue first.",
            "result_copy": "The exit holds while the rich seam folds.",
            "reward_bonus": {
              "pet_xp": 5
            }
          },
          {
            "key": "vent",
            "label": "VENT THE PRESSURE",
            "detail": "Use the old machinery.",
            "result_copy": "Tunnel and crystal both survive.",
            "reward_bonus": {
              "moon_gold": 6
            }
          }
        ]
      },
      "escort_team": {
        "title": "The Long Climb",
        "intro": "The Deep Tax follows the team upward.",
        "objective": "Get nine miners into daylight.",
        "choices": [
          {
            "key": "carry",
            "label": "CARRY THE LAST MINER",
            "detail": "Leave nobody behind.",
            "result_copy": "All nine lights emerge together.",
            "reward_bonus": {
              "pet_xp": 8
            }
          },
          {
            "key": "collapse",
            "label": "DROP THE ROUTE",
            "detail": "Seal the anomaly below.",
            "result_copy": "The Deep Tax is buried permanently.",
            "reward_bonus": {
              "moon_gold": 10
            }
          }
        ]
      }
    }
  },
  "royal_archive": {
    "title": "THE SECOND NAME",
    "steps": [
      "open_archive",
      "solve_cipher",
      "choose_legacy"
    ],
    "final_outcomes": [
      "prestige_progress",
      "rare_cosmetic",
      "bond_xp"
    ],
    "step_content": {
      "open_archive": {
        "title": "Door Without A Handle",
        "intro": "The archive asks for an unlived memory.",
        "objective": "Open it without giving a real memory.",
        "choices": [
          {
            "key": "future",
            "label": "TELL A FUTURE STORY",
            "detail": "Offer a possible memory.",
            "result_copy": "The vault marks the story as a promise.",
            "reward_bonus": {
              "style_tokens": 1
            }
          },
          {
            "key": "mirror",
            "label": "MIRROR THE REQUEST",
            "detail": "Authenticate the archive.",
            "result_copy": "It reveals a forgotten Moonboy tag.",
            "reward_bonus": {
              "pet_xp": 5
            }
          }
        ]
      },
      "solve_cipher": {
        "title": "Two Names, One Signal",
        "intro": "The record holds a known and sealed rare name.",
        "objective": "Read without exposing the route.",
        "choices": [
          {
            "key": "mask",
            "label": "MASK THE RARE NAME",
            "detail": "Protect the hidden signal.",
            "result_copy": "The public record reveals an old alliance.",
            "reward_bonus": {
              "pet_xp": 5
            }
          },
          {
            "key": "trace",
            "label": "TRACE THE INK",
            "detail": "Follow without opening.",
            "result_copy": "The ink hints at a morph condition.",
            "reward_bonus": {
              "style_tokens": 1
            }
          }
        ]
      },
      "choose_legacy": {
        "title": "What Leaves The Vault",
        "intro": "Only one record may leave.",
        "objective": "Choose the street's legacy.",
        "choices": [
          {
            "key": "truth",
            "label": "KEEP THE TRUE RECORD",
            "detail": "Carry difficult history intact.",
            "result_copy": "Your Moonpet becomes its keeper.",
            "reward_bonus": {
              "pet_xp": 10
            }
          },
          {
            "key": "legend",
            "label": "WRITE A NEW LEGEND",
            "detail": "Turn history toward the future.",
            "result_copy": "The city wakes to your Moonpet's legend.",
            "reward_bonus": {
              "style_tokens": 2
            }
          }
        ]
      }
    }
  }
});

export const PET_ELITE_JOBS = deepFreeze({
  mural_commission: { min_level: 20, required_track: 'job', required_xp: 750, preferred_traits: ['stylish', 'loyal'], reward_table: 'job' },
  vault_security: { min_level: 25, required_track: 'training', required_xp: 1000, preferred_traits: ['tough', 'clever'], reward_table: 'arena' },
  rooftop_courier: { min_level: 20, required_track: 'adventure', required_xp: 750, preferred_traits: ['clever', 'brave'], reward_table: 'run' },
  kaiju_recovery: { min_level: 45, required_track: 'arena', required_xp: 2000, preferred_traits: ['brave', 'tough'], reward_table: 'kaiju' },
});

export const PET_ARENA_STATUS_EFFECTS = deepFreeze({
  bleed: { duration_rounds: 3, max_stacks: 2, damage_per_stack: 3 },
  armor_break: { duration_rounds: 2, max_stacks: 1, defense_reduction_pct: 20 },
  blinded: { duration_rounds: 2, max_stacks: 1, accuracy_reduction_pct: 18 },
  barrier: { duration_rounds: 2, max_stacks: 1, absorb_damage: 12 },
  haste: { duration_rounds: 2, max_stacks: 1, dodge_bonus: 4 },
});

export const PET_SEASONAL_BOSSES = deepFreeze({
  neon_titan: { season: 'neon_uprising', min_level: 25, phases: 3, weakness: 'armor_break', reward: 'battery_cell' },
  rugpull_colossus: { season: 'mine_collapse', min_level: 35, phases: 3, weakness: 'bleed', reward: 'crystal_shard' },
  kaiju_zero: { season: 'kaiju_siege', min_level: 50, phases: 4, weakness: 'blinded', reward: 'kaiju_fragment' },
  citadel_overlord: { season: 'moon_citadel', min_level: 70, phases: 5, weakness: 'barrier', reward: 'arena_token' },
});

export const PET_FACTION_BONUSES = deepFreeze({
  'hard-fork-rockers': { system: 'training', effect: { training_xp_pct: 5, streak_protection: 1 } },
  'rugpull-miners': { system: 'runs', effect: { run_reward_pct: 5, crystal_find_pct: 4 } },
  graffpunks: { system: 'events', effect: { event_reward_pct: 5, style_reward_pct: 5 } },
  'blockchain-furies': { system: 'arena', effect: { arena_reward_pct: 5, revenge_damage_pct: 5 } },
  'crypto-moongirls': { system: 'arena', effect: { arena_reward_pct: 4, status_resist_pct: 5 } },
  blockstars: { system: 'jobs', effect: { job_reward_pct: 5, spotlight_xp_pct: 5 } },
  'all-city-bulls': { system: 'arena', effect: { arena_reward_pct: 6, win_streak_reward_pct: 4 } },
  'nomad-bears': { system: 'runs', effect: { run_reward_pct: 4, route_variety_pct: 5 } },
  'crypto-stoned-boys': { system: 'events', effect: { event_reward_pct: 4, care_decay_reduction_pct: 4 } },
});

export function getPetRegionContent(regionKey) {
  const key = String(regionKey || '').trim().toLowerCase();
  return hasOwn(PET_REGION_CONTENT, key) ? PET_REGION_CONTENT[key] : null;
}

export function getPetEventChain(eventKey) {
  const key = String(eventKey || '').trim().toLowerCase();
  return hasOwn(PET_EVENT_CHAINS, key) ? PET_EVENT_CHAINS[key] : null;
}

export function canStartPetEliteJob(jobKey, state = {}) {
  const key = String(jobKey || '').trim().toLowerCase();
  if (!hasOwn(PET_ELITE_JOBS, key)) return false;
  const job = PET_ELITE_JOBS[key];
  const trackXp = Math.max(0, Math.floor(Number(state[`${job.required_track}_xp`]) || 0));
  return Math.max(1, Math.floor(Number(state.level) || 1)) >= job.min_level && trackXp >= job.required_xp;
}

export function applyPetArenaStatus(statusKey, currentStacks = 0) {
  const key = String(statusKey || '').trim().toLowerCase();
  if (!hasOwn(PET_ARENA_STATUS_EFFECTS, key)) return null;
  const effect = PET_ARENA_STATUS_EFFECTS[key];
  const stacks = Math.min(effect.max_stacks, Math.max(1, Math.floor(Number(currentStacks) || 0) + 1));
  return { status: key, stacks, duration_rounds: effect.duration_rounds };
}

export function getPetSeasonalBoss(bossKey, petLevel) {
  const key = String(bossKey || '').trim().toLowerCase();
  if (!hasOwn(PET_SEASONAL_BOSSES, key)) return null;
  const boss = PET_SEASONAL_BOSSES[key];
  return Math.max(1, Math.floor(Number(petLevel) || 1)) >= boss.min_level ? boss : null;
}

export function getPetFactionBonus(factionKey) {
  const key = String(factionKey || '').trim().toLowerCase();
  return hasOwn(PET_FACTION_BONUSES, key) ? PET_FACTION_BONUSES[key] : null;
}
