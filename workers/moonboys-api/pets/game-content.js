import { PET_REGION_CONTENT } from './content-phase-4.js';
import { PET_RUN_REGIONS } from './progression-phase-2.js';

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const PET_REGION_LORE = deepFreeze({
  moon_alley: { title: 'Moon Alley', strapline: 'Every legend starts where the city forgets to look.', lore: 'A maze of tags, shuttered shops and crew territory. Alley King taxes every route until a Moonpet proves the street belongs to everyone.', status: 'live' },
  neon_rooftops: { title: 'Neon Rooftops', strapline: 'Above the cameras, the skyline becomes a racetrack.', lore: 'Courier crews jump transmitter towers while the Skyline Hunter follows every stolen signal.', status: 'live' },
  rugpull_mines: { title: 'Rugpull Mines', strapline: 'The old promises collapsed. The crystals remained.', lore: 'Abandoned rigs still chew through unstable tunnels, trapping miners beneath the Drill Beast’s territory.', status: 'live' },
  blockchain_sewers: { title: 'Blockchain Sewers', strapline: 'Every discarded transaction leaves a shadow.', lore: 'Toxic data flows through hidden nodes where leech swarms feed and the Sewer Validator decides what survives.', status: 'live' },
  kaiju_district: { title: 'Kaiju District', strapline: 'The evacuation sirens never fully stop.', lore: 'Collapsed arcades and giant footprints mark a district defended by recovery crews against the District Destroyer.', status: 'live' },
  moon_citadel: { title: 'Moon Citadel', strapline: 'Only a complete legend can enter the archive.', lore: 'Zero-gravity trials guard the royal record while Moon Warlord Prime waits above the city it intends to own.', status: 'live' },
});

export const PET_JOB_LORE = deepFreeze({
  street_artist: 'Paint legal signal walls and build Style while the alley watches.',
  courier: 'Carry sealed street parcels through the shortest safe route.',
  crystal_miner: 'Recover crystal seams without waking the machinery below.',
  vault_guard: 'Protect community supplies from opportunist crews.',
  arcade_tester: 'Stress-test bootleg cabinets and report corrupted rounds.',
  rooftop_courier: 'Cross the skyline before the route beacon expires.',
  signal_hacker: 'Recover hijacked broadcasts and return them to the street.',
  drone_mechanic: 'Repair delivery drones damaged over Moon Alley.',
  mural_commission: 'Lead a high-profile wall from sketch to final outline.',
  relic_appraiser: 'Separate genuine run relics from polished scrap.',
  citadel_envoy: 'Carry street demands into the Moon Citadel chambers.',
  guardian_patrol: 'Protect lower-stage Moonpets on dangerous routes.',
  vault_security: 'Read threats, hold the line and earn elite guard materials.',
  kaiju_recovery: 'Enter the impact zone after a Kaiju battle and recover fragments.',
});

export function buildPetRegionDirectory(level = 1, mastery = {}) {
  const petLevel = Math.max(1, Math.floor(Number(level) || 1));
  const entries = Object.entries(PET_RUN_REGIONS);
  return entries.map(([key, gate], index) => {
    const content = PET_REGION_CONTENT[key];
    const lore = PET_REGION_LORE[key];
    const masteryXp = Math.max(0, Math.floor(Number(mastery[key]) || 0));
    const prerequisiteKey = index > 0 ? entries[index - 1][0] : null;
    const prerequisiteMastery = prerequisiteKey ? Math.max(0, Math.floor(Number(mastery[prerequisiteKey]) || 0)) : 0;
    const requirementsMet = petLevel >= gate.min_level && prerequisiteMastery >= gate.mastery_required;
    const playable = lore.status === 'live' && requirementsMet;
    return {
      key, ...lore, min_level: gate.min_level, mastery_required: gate.mastery_required, mastery_xp: masteryXp,
      prerequisite_region: prerequisiteKey, prerequisite_mastery: prerequisiteMastery,
      requirements_met: requirementsMet, playable, boss: content.boss, encounters: [...content.encounters],
      reward_focus: [...content.reward_focus], focus: [...gate.focus],
      lock_reason: petLevel < gate.min_level ? `Reach Level ${gate.min_level}`
        : prerequisiteMastery < gate.mastery_required ? `Build ${gate.mastery_required} mastery in ${PET_REGION_LORE[prerequisiteKey]?.title || prerequisiteKey}`
          : lore.status !== 'live' ? 'District content is still being assembled' : null,
    };
  });
}
