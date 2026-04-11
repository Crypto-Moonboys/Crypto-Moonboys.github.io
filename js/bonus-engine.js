
// Moonboys Arcade - Hidden Bonus Engine
export function rollHiddenBonus() {
  const bonuses = [
    { id: "quick_hands", name: "Quick Hands", rarity: "common", reward: 50 },
    { id: "diamond_reflex", name: "Diamond Reflex", rarity: "rare", reward: 150 },
    { id: "hidden_vault", name: "Hidden Vault", rarity: "epic", reward: 400 },
    { id: "sigma_rey", name: "SIGMA REY Protocol", rarity: "legendary", reward: 800 },
    { id: "moonshot", name: "MOONSHOT", rarity: "wtf", reward: 1500 }
  ];

  const weights = [50, 25, 15, 8, 2];
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;

  for (let i = 0; i < bonuses.length; i++) {
    if (rand < weights[i]) return bonuses[i];
    rand -= weights[i];
  }
}

export function showBonusPopup(bonus) {
  const popup = document.createElement("div");
  popup.className = "bonus-popup";
  popup.innerHTML = `
    <h2>🎉 BONUS TRIGGERED</h2>
    <h3>${bonus.name}</h3>
    <p>Reward: +${bonus.reward} Arcade Points</p>
  `;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 4000);
}
