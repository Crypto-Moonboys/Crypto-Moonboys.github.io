export const QUESTS = [
  {
    id: 'reach_graffiti',
    title: 'Reach Graffiti Ward',
    rewardXp: 150,
    requirement: (player) => player.currentDistrict === 'graffiti_ward',
  },
  {
    id: 'reach_signal',
    title: 'Reach Signal Heights',
    rewardXp: 150,
    requirement: (player) => player.currentDistrict === 'signal_heights',
  },
  {
    id: 'visit_central',
    title: 'Visit Central Plaza',
    rewardXp: 100,
    requirement: (player) => player.currentDistrict === 'central_plaza',
  },
];

export function checkAndCompleteQuests(player, completedQuests) {
  const newlyCompleted = [];

  for (const quest of QUESTS) {
    if (!completedQuests.has(quest.id) && quest.requirement(player)) {
      completedQuests.add(quest.id);
      player.xp += quest.rewardXp;
      newlyCompleted.push({
        id: quest.id,
        title: quest.title,
        rewardXp: quest.rewardXp,
      });
    }
  }

  return newlyCompleted;
}
