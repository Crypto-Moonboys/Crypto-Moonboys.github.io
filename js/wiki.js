/**
 * Crypto Moonboys Wiki — Main JavaScript
 * Client-side search, sidebar toggle, UI helpers.
 */

/* ── SEARCH INDEX ──────────────────────────────────────────────────────────
   Articles are registered here so the search box can find them.
   When the AI agent adds a new article, it should also add an entry below.
   ─────────────────────────────────────────────────────────────────────── */
const WIKI_INDEX = [
  {
    title: "Bitcoin (BTC)",
    url: "wiki/bitcoin.html",
    desc: "The original cryptocurrency and largest by market cap. A peer-to-peer electronic cash system created by Satoshi Nakamoto.",
    category: "Cryptocurrencies",
    emoji: "₿",
    tags: ["bitcoin", "btc", "satoshi", "crypto", "blockchain", "digital gold"]
  },
  {
    title: "Ethereum (ETH)",
    url: "wiki/ethereum.html",
    desc: "A decentralised platform enabling smart contracts and decentralised applications (dApps).",
    category: "Cryptocurrencies",
    emoji: "Ξ",
    tags: ["ethereum", "eth", "smart contracts", "dapps", "defi", "vitalik"]
  },
  {
    title: "DeFi (Decentralised Finance)",
    url: "wiki/defi.html",
    desc: "An ecosystem of financial applications built on blockchain networks, removing traditional intermediaries.",
    category: "Concepts",
    emoji: "🏦",
    tags: ["defi", "decentralised finance", "yield farming", "liquidity", "amm"]
  },
  {
    title: "NFTs (Non-Fungible Tokens)",
    url: "wiki/nfts.html",
    desc: "Unique digital assets verified using blockchain technology representing ownership of digital or physical items.",
    category: "Concepts",
    emoji: "🎨",
    tags: ["nft", "non-fungible token", "digital art", "opensea", "collectibles"]
  },
  {
    title: "Altcoins",
    url: "wiki/altcoins.html",
    desc: "All cryptocurrencies other than Bitcoin. Includes Ethereum, Solana, Cardano and thousands more.",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["altcoins", "alts", "sol", "ada", "bnb", "shitcoin", "moonshot"]
  },
  {
    title: "Blockchain Technology",
    url: "wiki/blockchain.html",
    desc: "A distributed ledger technology that records transactions across many computers in an immutable, transparent way.",
    category: "Technology",
    emoji: "⛓️",
    tags: ["blockchain", "distributed ledger", "consensus", "nodes", "decentralised"]
  },
  {
    title: "Crypto Wallets",
    url: "wiki/wallets.html",
    desc: "Software or hardware that stores private and public keys, allowing users to send and receive crypto.",
    category: "Tools",
    emoji: "👛",
    tags: ["wallet", "metamask", "ledger", "cold storage", "seed phrase", "private key"]
  },
  {
    title: "Crypto Exchanges",
    url: "wiki/exchanges.html",
    desc: "Platforms where users can buy, sell and trade cryptocurrencies. Includes CEX and DEX varieties.",
    category: "Tools",
    emoji: "🔄",
    tags: ["exchange", "cex", "dex", "binance", "coinbase", "uniswap", "trading"]
  },
  {
    title: "Tokenomics",
    url: "wiki/tokenomics.html",
    desc: "The economics of a crypto token, including supply, distribution, utility, and incentive mechanisms.",
    category: "Concepts",
    emoji: "📊",
    tags: ["tokenomics", "supply", "circulating", "inflation", "vesting", "burn"]
  },
  {
    title: "Web3",
    url: "wiki/web3.html",
    desc: "The next generation of the internet built on blockchain technology, enabling decentralised ownership and identity.",
    category: "Technology",
    emoji: "🌐",
    tags: ["web3", "decentralised internet", "dao", "metaverse", "ownership"]
  },
  {
    title: "Solana (SOL)",
    url: "wiki/solana.html",
    desc: "A high-performance blockchain supporting fast, cheap transactions and popular with DeFi and NFT projects.",
    category: "Cryptocurrencies",
    emoji: "◎",
    tags: ["solana", "sol", "fast blockchain", "proof of history", "nft"]
  },
  {
    title: "Meme Coins",
    url: "wiki/memecoins.html",
    desc: "Cryptocurrency tokens inspired by internet memes or jokes. Includes Dogecoin, Shiba Inu, and many others.",
    category: "Cryptocurrencies",
    emoji: "🐶",
    tags: ["meme", "doge", "shib", "pepe", "memecoin", "community token", "moonboy"]
  },
  {
    title: "HODL Wars Lore$",
    url: "wiki/hodl-wars.html",
    desc: "The central mythological lore of the Crypto Moonboys — an epic saga of Diamond Hands warriors, Paper Hands betrayals, and Moon Missions.",
    category: "Lore",
    emoji: "⚔️",
    tags: ["hodl wars", "lore", "diamond hands", "paper hands", "moon mission", "wagmi", "ngmi", "crypto mythology"]
  },
  {
    title: "The HODL Warriors",
    url: "wiki/hodl-warriors.html",
    desc: "The elite fighters of the HODL Wars universe who never sell and march toward the Moon Mission.",
    category: "Lore",
    emoji: "⚔️",
    tags: ["hodl warriors", "diamond hands", "never sell", "lore", "faction"]
  },
  {
    title: "Diamond Hands",
    url: "wiki/diamond-hands.html",
    desc: "The sacred trait of holding crypto through all volatility. The mark of a true HODL Warrior.",
    category: "Lore",
    emoji: "💎",
    tags: ["diamond hands", "hold", "hodl", "never sell", "stonks", "wsb"]
  },
  {
    title: "Paper Hands",
    url: "wiki/paper-hands.html",
    desc: "The weakness of selling too early under pressure. The opposite of Diamond Hands.",
    category: "Lore",
    emoji: "🧻",
    tags: ["paper hands", "sell", "capitulate", "weak hands", "fud"]
  },
  {
    title: "The Great Dip",
    url: "wiki/the-great-dip.html",
    desc: "The recurring cataclysm of the HODL Wars — sudden market crashes that test the mettle of every warrior.",
    category: "Lore",
    emoji: "📉",
    tags: ["dip", "crash", "buy the dip", "bear market", "correction"]
  },
  {
    title: "Moon Mission",
    url: "wiki/moon-mission.html",
    desc: "The ultimate quest of HODL Warriors — the prophesied journey to infinite gains. When Lambo?",
    category: "Lore",
    emoji: "🚀",
    tags: ["moon", "lambo", "to the moon", "moon mission", "wagmi", "gains"]
  },
  {
    title: "Rug Pull Wars",
    url: "wiki/rug-pull-wars.html",
    desc: "The treacherous chapter where dev teams abandon projects and flee with investor funds.",
    category: "Lore",
    emoji: "🪤",
    tags: ["rug pull", "scam", "exit scam", "defi", "dev abandoned"]
  },
  {
    title: "The Satoshi Scroll",
    url: "wiki/satoshi-scroll.html",
    desc: "The mythologised sacred text of the HODL Wars — the Bitcoin Whitepaper elevated to legend.",
    category: "Lore",
    emoji: "📜",
    tags: ["satoshi", "bitcoin whitepaper", "sacred text", "decentralisation", "lore"]
  },
  {
    title: "The Bear Market Siege",
    url: "wiki/bear-market-siege.html",
    desc: "The prolonged dark chapter of extended market downtrends where Diamond Hands warriors are tested.",
    category: "Lore",
    emoji: "🐻",
    tags: ["bear market", "siege", "winter", "downturn", "crypto winter"]
  },
  {
    title: "The Whale Lords",
    url: "wiki/whale-lords.html",
    desc: "The powerful market-moving entities holding thousands of BTC/ETH who shape the HODL Wars.",
    category: "Lore",
    emoji: "🐳",
    tags: ["whale", "market manipulation", "big holders", "institutional", "accumulation"]
  },
  {
    title: "The FOMO Plague",
    url: "wiki/fomo-plague.html",
    desc: "The epidemic of Fear Of Missing Out that spreads through social media and turns holders into sellers.",
    category: "Lore",
    emoji: "😱",
    tags: ["fomo", "fear of missing out", "social media", "influencer", "shilling"]
  },
  {
    title: "NGMI Chronicles",
    url: "wiki/ngmi-chronicles.html",
    desc: "The cautionary records of those who fell in the HODL Wars. Not Gonna Make It.",
    category: "Lore",
    emoji: "💀",
    tags: ["ngmi", "not gonna make it", "sold the bottom", "rug", "loss"]
  },
  {
    title: "The WAGMI Prophecy",
    url: "wiki/wagmi-prophecy.html",
    desc: "The ultimate declaration of optimism — We're All Gonna Make It. The guiding star of the HODL Wars.",
    category: "Lore",
    emoji: "🌙",
    tags: ["wagmi", "we are all gonna make it", "optimism", "moon", "prophecy"]
  },
  {
    title: "1M free NFTs drop",
    url: "wiki/sam-1m-free-nfts-drop.html",
    desc: "Massive NFT distribution event in the Crypto Moonboys ecosystem.",
    category: "Lore",
    emoji: "🎪",
    tags: ["free", "nfts", "drop", "events"]
  },
  {
    title: "Aleema (Child of the Shard)",
    url: "wiki/sam-aleema-child-of-the-shard.html",
    desc: "A named character in the Crypto Moonboys universe with unspecified role, associated with the Shard.",
    category: "Characters",
    emoji: "🎭",
    tags: ["aleema", "child", "the", "shard", "characters"]
  },
  {
    title: "Alfie 'The Bitcoin Kid' Blaze",
    url: "wiki/sam-alfie-the-bitcoin-kid-blaze.html",
    desc: "Leader of the Bitcoin Kids, a group of escaped rebels in the Block Topia universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["alfie", "the", "bitcoin", "kid", "blaze", "characters"]
  },
  {
    title: "Ava Chen",
    url: "wiki/sam-ava-chen.html",
    desc: "A named character in the Crypto Moonboys universe with unspecified role.",
    category: "Characters",
    emoji: "🎭",
    tags: ["ava", "chen", "characters"]
  },
  {
    title: "Billy the Goat Kid",
    url: "wiki/sam-billy-the-goat-kid.html",
    desc: "A named character in the Crypto Moonboys universe with unspecified role.",
    category: "Characters",
    emoji: "🎭",
    tags: ["billy", "the", "goat", "kid", "characters"]
  },
  {
    title: "Bit-Cap 5000",
    url: "wiki/sam-bit-cap-5000.html",
    desc: "A named character in the Crypto Moonboys universe with unspecified role.",
    category: "Characters",
    emoji: "🎭",
    tags: ["bit", "cap", "5000", "characters"]
  },
  {
    title: "Bitcoin X Kids",
    url: "wiki/sam-bitcoin-x-kids.html",
    desc: "Hybrid children army living inside Block Topia walls",
    category: "Factions",
    emoji: "🪖",
    tags: ["bitcoin", "kids", "armies"]
  },
  {
    title: "Block Node Defenders",
    url: "wiki/sam-block-node-defenders.html",
    desc: "An army tasked with defending key nodes in Block Topia",
    category: "Factions",
    emoji: "🪖",
    tags: ["block", "node", "defenders", "armies"]
  },
  {
    title: "Block Topia",
    url: "wiki/sam-block-topia.html",
    desc: "A location within the Crypto Moonboys universe — a city-state built on blockchain infrastructure.",
    category: "Lore",
    emoji: "🌐",
    tags: ["block", "topia", "location", "lore"]
  },
  {
    title: "Bone Idol Ink",
    url: "wiki/sam-bone-idol-ink.html",
    desc: "Co-founder of GraffPUNKS, focused on events and collaborations",
    category: "Lore",
    emoji: "⚙️",
    tags: ["bone", "idol", "ink", "mechanics"]
  },
  {
    title: "Charlie Buster",
    url: "wiki/sam-charlie-buster.html",
    desc: "A character in the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "🌐",
    tags: ["charlie", "buster", "lore"]
  },
  {
    title: "Crypto Moonboys",
    url: "wiki/sam-crypto-moonboys.html",
    desc: "The Crypto Moonboys collective — the community and characters at the heart of the HODL Wars universe.",
    category: "Lore",
    emoji: "🌐",
    tags: ["crypto", "moonboys", "community", "lore"]
  },
  {
    title: "Darren Cullen (SER)",
    url: "wiki/sam-darren-cullen-ser.html",
    desc: "Founder and artist of Graffiti Kings, also a character in lore.",
    category: "Characters",
    emoji: "🎭",
    tags: ["darren", "cullen", "ser", "graffiti", "kings", "characters"]
  },
  {
    title: "Delicious Again Pete",
    url: "wiki/sam-delicious-again-pete.html",
    desc: "A character in the Crypto Moonboys lore.",
    category: "Lore",
    emoji: "⚙️",
    tags: ["delicious", "again", "pete", "mechanics"]
  },
  {
    title: "Dragan Volkov",
    url: "wiki/sam-dragan-volkov.html",
    desc: "A character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["dragan", "volkov", "characters"]
  },
  {
    title: "Dream Sovereign",
    url: "wiki/sam-dream-sovereign.html",
    desc: "A location or realm within the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "📍",
    tags: ["dream", "sovereign", "lore locations"]
  },
  {
    title: "Elder Codex-7",
    url: "wiki/sam-elder-codex-7.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["elder", "codex", "characters"]
  },
  {
    title: "Forkborn Collective",
    url: "wiki/sam-forkborn-collective.html",
    desc: "An army or faction within the Block Topia universe.",
    category: "Factions",
    emoji: "🪖",
    tags: ["forkborn", "collective", "armies"]
  },
  {
    title: "Forklord You",
    url: "wiki/sam-forklord-you.html",
    desc: "A character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["forklord", "you", "characters"]
  },
  {
    title: "Forksplit",
    url: "wiki/sam-forksplit.html",
    desc: "A character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["forksplit", "characters"]
  },
  {
    title: "$GK Tokens",
    url: "wiki/sam-gk-tokens.html",
    desc: "The native token of the Graffiti Kings ecosystem.",
    category: "Lore",
    emoji: "🪙",
    tags: ["gk", "tokens", "graffiti", "kings"]
  },
  {
    title: "GKniftyHEADS",
    url: "wiki/sam-gkniftyheads.html",
    desc: "A faction or community within the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "🌐",
    tags: ["gkniftyheads", "lore"]
  },
  {
    title: "Graffiti Kings",
    url: "wiki/sam-graffiti-kings.html",
    desc: "The Graffiti Kings collective — the art and street culture heart of the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "🌐",
    tags: ["graffiti", "kings", "art", "street", "culture", "lore"]
  },
  {
    title: "GraffPUNKS",
    url: "wiki/sam-graffpunks.html",
    desc: "The GraffPUNKS community — a punk art and crypto collective.",
    category: "Lore",
    emoji: "🌐",
    tags: ["graffpunks", "punk", "art", "lore"]
  },
  {
    title: "Great Datapocalypse of 2789",
    url: "wiki/sam-great-datapocalypse-of-2789.html",
    desc: "A major lore event in the Crypto Moonboys universe — the catastrophic data collapse of 2789.",
    category: "Lore",
    emoji: "🎪",
    tags: ["great", "datapocalypse", "2789", "events", "lore"]
  },
  {
    title: "GRIT",
    url: "wiki/sam-grit.html",
    desc: "A character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["grit", "characters"]
  },
  {
    title: "Grit42",
    url: "wiki/sam-grit42.html",
    desc: "A character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["grit42", "grit", "characters"]
  },
  {
    title: "Hard Fork Games",
    url: "wiki/sam-hard-fork-games.html",
    desc: "A major event in the Crypto Moonboys universe involving faction battles.",
    category: "Lore",
    emoji: "🎪",
    tags: ["hard", "fork", "games", "events"]
  },
  {
    title: "HEX-TAGGER PRIME",
    url: "wiki/sam-hex-tagger-prime.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["hex", "tagger", "prime", "characters"]
  },
  {
    title: "HODL Warriors Army",
    url: "wiki/sam-hodl-warriors-army.html",
    desc: "The full army of HODL Warriors — the Diamond Hands collective.",
    category: "Factions",
    emoji: "🪖",
    tags: ["hodl", "warriors", "army", "diamond", "hands"]
  },
  {
    title: "HODL WARRIORS (SAM)",
    url: "wiki/sam-hodl-warriors.html",
    desc: "Extended lore on the HODL Warriors faction in the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "🌐",
    tags: ["hodl", "warriors", "faction", "lore"]
  },
  {
    title: "HODL WARS EXTRAVAGANZA",
    url: "wiki/sam-hodl-wars-extravaganza.html",
    desc: "A grand event in the HODL Wars saga.",
    category: "Lore",
    emoji: "🎪",
    tags: ["hodl", "wars", "extravaganza", "events"]
  },
  {
    title: "HODL WARS (SAM)",
    url: "wiki/sam-hodl-wars.html",
    desc: "Extended lore on the HODL Wars universe as discovered by SAM.",
    category: "Lore",
    emoji: "🌐",
    tags: ["hodl", "wars", "lore"]
  },
  {
    title: "HODL X Warriors",
    url: "wiki/sam-hodl-x-warriors.html",
    desc: "A variant HODL Warriors army in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "🪖",
    tags: ["hodl", "warriors", "armies"]
  },
  {
    title: "Iris-7",
    url: "wiki/sam-iris-7.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["iris", "characters"]
  },
  {
    title: "Jodie ZOOM 2000",
    url: "wiki/sam-jodie-zoom-2000.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["jodie", "zoom", "2000", "characters"]
  },
  {
    title: "Jonny & Laurence Nelson (TAG Records)",
    url: "wiki/sam-jonny-laurence-nelson-tag-records.html",
    desc: "Music producers associated with the Crypto Moonboys universe and TAG Records.",
    category: "Lore",
    emoji: "⚙️",
    tags: ["jonny", "laurence", "nelson", "tag", "records", "mechanics"]
  },
  {
    title: "Lady-INK",
    url: "wiki/sam-lady-ink.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["lady", "ink", "characters"]
  },
  {
    title: "$LFGK Rewards",
    url: "wiki/sam-lfgk-rewards.html",
    desc: "The LFGK rewards token in the Graffiti Kings ecosystem.",
    category: "Lore",
    emoji: "🪙",
    tags: ["lfgk", "rewards", "tokens"]
  },
  {
    title: "Loopfiend",
    url: "wiki/sam-loopfiend.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["loopfiend", "characters"]
  },
  {
    title: "M1nTr_K1ll",
    url: "wiki/sam-m1ntr-k1ll.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["m1ntr", "k1ll", "characters"]
  },
  {
    title: "Metaverse Battles",
    url: "wiki/sam-metaverse-battles.html",
    desc: "Battles fought in the metaverse within the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "⚙️",
    tags: ["metaverse", "battles", "mechanics"]
  },
  {
    title: "MiDEViL HERO ARENA",
    url: "wiki/sam-midevil-hero-arena.html",
    desc: "A game in the Crypto Moonboys universe featuring medieval-style hero battles.",
    category: "Lore",
    emoji: "🎮",
    tags: ["midevil", "hero", "arena", "games"]
  },
  {
    title: "No Ball Games (NBG)",
    url: "wiki/sam-no-ball-games-nbg.html",
    desc: "A brand in the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "🏷️",
    tags: ["no", "ball", "games", "nbg", "brands"]
  },
  {
    title: "NULL THE PROPHET",
    url: "wiki/sam-null-the-prophet.html",
    desc: "A character or entity in the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "🌐",
    tags: ["null", "the", "prophet", "lore"]
  },
  {
    title: "Patchwork",
    url: "wiki/sam-patchwork.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["patchwork", "characters"]
  },
  {
    title: "$PUNK Token",
    url: "wiki/sam-punk-token.html",
    desc: "The PUNK token in the Crypto Moonboys ecosystem.",
    category: "Lore",
    emoji: "🪙",
    tags: ["punk", "token", "tokens"]
  },
  {
    title: "PYRALITH",
    url: "wiki/sam-pyralith.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["pyralith", "characters"]
  },
  {
    title: "Queen Sarah P-fly",
    url: "wiki/sam-queen-sarah-p-fly.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["queen", "sarah", "fly", "characters"]
  },
  {
    title: "Queens, New York",
    url: "wiki/sam-queens-new-york.html",
    desc: "A lore location in the Crypto Moonboys universe — the real-world origin of the HODL Wars.",
    category: "Lore",
    emoji: "📍",
    tags: ["queens", "new", "york", "location", "lore locations"]
  },
  {
    title: "Quell",
    url: "wiki/sam-quell.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["quell", "characters"]
  },
  {
    title: "Rune Tag",
    url: "wiki/sam-rune-tag.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["rune", "tag", "characters"]
  },
  {
    title: "Sacred Chain",
    url: "wiki/sam-sacred-chain.html",
    desc: "A sacred location or object in the Crypto Moonboys lore.",
    category: "Lore",
    emoji: "📍",
    tags: ["sacred", "chain", "lore locations"]
  },
  {
    title: "Samael.exe",
    url: "wiki/sam-samaelexe.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["samael", "exe", "characters"]
  },
  {
    title: "Sarah PU51FLY",
    url: "wiki/sam-sarah-pu51fly.html",
    desc: "A character in the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "⚙️",
    tags: ["sarah", "pu51fly", "mechanics"]
  },
  {
    title: "SatoRebel",
    url: "wiki/sam-satorebel.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["satorebel", "satoshi", "rebel", "characters"]
  },
  {
    title: "Seeding Rights",
    url: "wiki/sam-seeding-rights.html",
    desc: "A mechanic or concept in the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "⚙️",
    tags: ["seeding", "rights", "mechanics"]
  },
  {
    title: "Sister Halcyon",
    url: "wiki/sam-sister-halcyon.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["sister", "halcyon", "characters"]
  },
  {
    title: "Snipey 'D-Man' Sirus",
    url: "wiki/sam-snipey-d-man-sirus.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["snipey", "sirus", "characters"]
  },
  {
    title: "Spirit Borns",
    url: "wiki/sam-spirit-borns.html",
    desc: "An army or faction of spirit warriors in the HODL Wars universe.",
    category: "Factions",
    emoji: "🪖",
    tags: ["spirit", "borns", "armies"]
  },
  {
    title: "Squeaky Pinks Enforcers",
    url: "wiki/sam-squeaky-pinks-enforcers.html",
    desc: "An enforcer army in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "🪖",
    tags: ["squeaky", "pinks", "enforcers", "armies"]
  },
  {
    title: "Street Kingdoms",
    url: "wiki/sam-street-kingdoms.html",
    desc: "A faction or group in the Crypto Moonboys street culture lore.",
    category: "Factions",
    emoji: "🪖",
    tags: ["street", "kingdoms", "armies"]
  },
  {
    title: "The AllCity Bulls",
    url: "wiki/sam-the-allcity-bulls.html",
    desc: "A faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["allcity", "bulls", "factions"]
  },
  {
    title: "The AZTEC RAIDERS",
    url: "wiki/sam-the-aztec-raiders.html",
    desc: "A faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["aztec", "raiders", "factions"]
  },
  {
    title: "The BALLY BOYS",
    url: "wiki/sam-the-bally-boys.html",
    desc: "A faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["bally", "boys", "factions"]
  },
  {
    title: "The Bitcoin Kid Army",
    url: "wiki/sam-the-bitcoin-kid-army.html",
    desc: "A faction led by the Bitcoin Kid characters.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["bitcoin", "kid", "army", "factions"]
  },
  {
    title: "The BLOCKCHAIN FURIES",
    url: "wiki/sam-the-blockchain-furies.html",
    desc: "A faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["blockchain", "furies", "factions"]
  },
  {
    title: "The BLOCKSTARS",
    url: "wiki/sam-the-blockstars.html",
    desc: "A faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["blockstars", "factions"]
  },
  {
    title: "The CHAIN SCRIBES",
    url: "wiki/sam-the-chain-scribes.html",
    desc: "A faction of chain-keepers in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["chain", "scribes", "factions"]
  },
  {
    title: "The CODE ALCHEMISTS",
    url: "wiki/sam-the-code-alchemists.html",
    desc: "A faction of code manipulators in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["code", "alchemists", "factions"]
  },
  {
    title: "The CRYPTO MOONGIRLS",
    url: "wiki/sam-the-crypto-moongirls.html",
    desc: "A faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["crypto", "moongirls", "factions"]
  },
  {
    title: "The CRYPTO STONED BOYS",
    url: "wiki/sam-the-crypto-stoned-boys.html",
    desc: "A faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["crypto", "stoned", "boys", "factions"]
  },
  {
    title: "The DUCKY BOYS",
    url: "wiki/sam-the-ducky-boys.html",
    desc: "A faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["ducky", "boys", "factions"]
  },
  {
    title: "The EVM PUNKS",
    url: "wiki/sam-the-evm-punks.html",
    desc: "A faction of EVM-native punks in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["evm", "punks", "factions"]
  },
  {
    title: "The FINANCE GUILD",
    url: "wiki/sam-the-finance-guild.html",
    desc: "A faction controlling finance in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["finance", "guild", "factions"]
  },
  {
    title: "The GASLESS GHOSTS",
    url: "wiki/sam-the-gasless-ghosts.html",
    desc: "A faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["gasless", "ghosts", "factions"]
  },
  {
    title: "The GKniftyHEADS",
    url: "wiki/sam-the-gkniftyheads.html",
    desc: "The GKniftyHEADS faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["gkniftyheads", "factions"]
  },
  {
    title: "The GRAFFPUNKS",
    url: "wiki/sam-the-graffpunks.html",
    desc: "The GraffPUNKS faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["graffpunks", "punk", "factions"]
  },
  {
    title: "The Great Unravelling",
    url: "wiki/sam-the-great-unravelling.html",
    desc: "A major lore event in the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "🎪",
    tags: ["great", "unravelling", "events"]
  },
  {
    title: "The HARD FORK ROCKERS",
    url: "wiki/sam-the-hard-fork-rockers.html",
    desc: "A faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["hard", "fork", "rockers", "factions"]
  },
  {
    title: "The High Hats",
    url: "wiki/sam-the-high-hats.html",
    desc: "A faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["high", "hats", "factions"]
  },
  {
    title: "The INFORMATION MERCENARIES",
    url: "wiki/sam-the-information-mercenaries.html",
    desc: "A faction of information brokers in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["information", "mercenaries", "factions"]
  },
  {
    title: "The MOONLORDS",
    url: "wiki/sam-the-moonlords.html",
    desc: "A faction of moon-ruling entities in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["moonlords", "moon", "lords", "factions"]
  },
  {
    title: "The NICE & EASY BOIS",
    url: "wiki/sam-the-nice-easy-bois.html",
    desc: "A faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["nice", "easy", "bois", "factions"]
  },
  {
    title: "The Nomad Bears",
    url: "wiki/sam-the-nomad-bears.html",
    desc: "A faction of nomadic bears in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["nomad", "bears", "factions"]
  },
  {
    title: "The OG PIXEL SAINTS",
    url: "wiki/sam-the-og-pixel-saints.html",
    desc: "A faction of original pixel art saints in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["og", "pixel", "saints", "factions"]
  },
  {
    title: "The Princess",
    url: "wiki/sam-the-princess.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["the", "princess", "characters"]
  },
  {
    title: "The RUGPULL MINERS",
    url: "wiki/sam-the-rugpull-miners.html",
    desc: "A faction of rug pullers in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["rugpull", "miners", "factions"]
  },
  {
    title: "The SALVAGERS",
    url: "wiki/sam-the-salvagers.html",
    desc: "A faction of salvagers in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["salvagers", "factions"]
  },
  {
    title: "The SHARD MOTHERS of MANHATTAN",
    url: "wiki/sam-the-shard-mothers-of-manhattan.html",
    desc: "A faction of Shard Mothers in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["shard", "mothers", "manhattan", "factions"]
  },
  {
    title: "The Squeaky Pinks",
    url: "wiki/sam-the-squeaky-pinks.html",
    desc: "A faction in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["squeaky", "pinks", "factions"]
  },
  {
    title: "The TUSKON OGS",
    url: "wiki/sam-the-tuskon-ogs.html",
    desc: "A faction of Tuskon OGs in the Crypto Moonboys universe.",
    category: "Factions",
    emoji: "⚔️",
    tags: ["tuskon", "ogs", "factions"]
  },
  {
    title: "The Whitewasher",
    url: "wiki/sam-the-whitewasher.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["the", "whitewasher", "characters"]
  },
  {
    title: "Thera-9",
    url: "wiki/sam-thera-9.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["thera", "characters"]
  },
  {
    title: "Thorne The Architect",
    url: "wiki/sam-thorne-the-architect.html",
    desc: "A named character in the Crypto Moonboys universe.",
    category: "Characters",
    emoji: "🎭",
    tags: ["thorne", "the", "architect", "characters"]
  },
  {
    title: "Trevor Fung",
    url: "wiki/sam-trevor-fung.html",
    desc: "A character in the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "⚙️",
    tags: ["trevor", "fung", "mechanics"]
  },
  {
    title: "Triple Fork Event",
    url: "wiki/sam-triple-fork-event.html",
    desc: "A major lore event in the Crypto Moonboys universe involving three blockchain forks.",
    category: "Lore",
    emoji: "🎪",
    tags: ["triple", "fork", "event", "events"]
  },
  {
    title: "XRP KIDs",
    url: "wiki/sam-xrp-kids.html",
    desc: "A brand or faction in the Crypto Moonboys universe associated with XRP.",
    category: "Lore",
    emoji: "🏷️",
    tags: ["xrp", "kids", "brands"]
  }
];

/* ── DOM READY ──────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initSearch();
  initStatArticles();
  initBackToTop();
  initActiveNav();
  initTOC();
});

/* ── SIDEBAR TOGGLE ─────────────────────────────────────────────────────── */
function initSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  if (!hamburger || !sidebar) return;

  hamburger.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', open);
  });

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  }

  // Close on ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ── SEARCH ─────────────────────────────────────────────────────────────── */
function initSearch() {
  // Header search
  const input   = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (input && results) {
    input.addEventListener('input',  () => runSearch(input.value, results, input));
    input.addEventListener('focus',  () => { if (input.value) runSearch(input.value, results, input); });
    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !results.contains(e.target)) {
        results.classList.remove('open');
      }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = input.value.trim();
        if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
      }
    });
    // Header search button
    const btn = document.getElementById('search-btn');
    if (btn) btn.addEventListener('click', () => {
      const q = input.value.trim();
      if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
    });
  }

  // Home page search
  const homeInput = document.getElementById('home-search-input');
  const homeBtn   = document.getElementById('home-search-btn');
  if (homeInput) {
    homeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = homeInput.value.trim();
        if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
      }
    });
  }
  if (homeBtn && homeInput) {
    homeBtn.addEventListener('click', () => {
      const q = homeInput.value.trim();
      if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
    });
  }

  // Search page
  const searchPage = document.getElementById('search-page-input');
  if (searchPage) {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q') || '';
    searchPage.value = q;
    if (q) renderSearchPage(q);
    searchPage.addEventListener('input', () => renderSearchPage(searchPage.value));
    searchPage.addEventListener('keydown', e => {
      if (e.key === 'Enter') renderSearchPage(searchPage.value);
    });
  }
}

function scoreResult(item, query) {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  let score = 0;
  const title = item.title.toLowerCase();
  const desc  = (item.desc  || '').toLowerCase();
  const tags  = (item.tags  || []).join(' ').toLowerCase();
  const cat   = (item.category || '').toLowerCase();
  if (title === q)                    score += 100;
  if (title.startsWith(q))            score +=  60;
  if (title.includes(q))              score +=  40;
  if (tags.includes(q))               score +=  30;
  if (desc.includes(q))               score +=  15;
  if (cat.includes(q))                score +=  10;
  q.split(' ').forEach(word => {
    if (word.length > 2) {
      if (title.includes(word)) score += 8;
      if (tags.includes(word))  score += 5;
      if (desc.includes(word))  score += 3;
    }
  });
  return score;
}

function runSearch(query, resultsEl, inputEl) {
  const q = query.trim();
  if (!q) { resultsEl.classList.remove('open'); return; }

  const scored = WIKI_INDEX
    .map(item => ({ item, score: scoreResult(item, q) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  resultsEl.innerHTML = '';
  if (scored.length === 0) {
    resultsEl.innerHTML = `<div class="sr-no-results">No results for "<strong>${escHtml(q)}</strong>"</div>`;
  } else {
    scored.forEach(({ item }) => {
      const div = document.createElement('div');
      div.className = 'sr-item';
      div.innerHTML = `
        <div style="font-size:1.4rem;flex-shrink:0;width:28px;text-align:center">${item.emoji || '📄'}</div>
        <div>
          <div class="sr-title">${highlight(item.title, q)}</div>
          <div class="sr-desc">${escHtml(item.desc.slice(0, 90))}…</div>
          <div class="sr-cat">${item.category}</div>
        </div>`;
      div.addEventListener('click', () => { window.location.href = item.url; });
      resultsEl.appendChild(div);
    });
  }
  resultsEl.classList.add('open');
}

function renderSearchPage(query) {
  const container = document.getElementById('search-results-page');
  const heading   = document.getElementById('search-heading');
  if (!container) return;

  const q = query.trim();
  if (heading) heading.textContent = q ? `Results for "${q}"` : 'All Articles';

  const items = q
    ? WIKI_INDEX
        .map(item => ({ item, score: scoreResult(item, q) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
    : WIKI_INDEX.map(item => ({ item, score: 0 }));

  if (items.length === 0) {
    container.innerHTML = `<p style="color:var(--color-text-muted)">No articles found for "<strong>${escHtml(q)}</strong>". Try different keywords.</p>`;
    return;
  }

  container.innerHTML = items.map(({ item }) => `
    <a href="${item.url}" class="article-list-item">
      <div class="ali-icon">${item.emoji || '📄'}</div>
      <div>
        <div class="ali-title">${highlight(item.title, q)}</div>
        <div class="ali-desc">${escHtml(item.desc)}</div>
        <div class="ali-meta">${item.category}</div>
      </div>
    </a>`).join('');
}

function highlight(text, query) {
  if (!query) return escHtml(text);
  const safeQ = escRegex(query);
  return escHtml(text).replace(new RegExp(`(${safeQ})`, 'gi'), '<mark style="background:rgba(247,201,72,.3);color:inherit;border-radius:2px">$1</mark>');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ── BACK TO TOP ────────────────────────────────────────────────────────── */
function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ── ACTIVE NAV ─────────────────────────────────────────────────────────── */
function initActiveNav() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  document.querySelectorAll('.sidebar-nav a, .header-nav a').forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    // Resolve relative href against current page
    const abs = new URL(href, window.location.href).pathname.replace(/\/+$/, '') || '/';
    if (abs === path) link.classList.add('active');
  });
}

/* ── AUTO TABLE OF CONTENTS ─────────────────────────────────────────────── */
function initTOC() {
  const toc     = document.getElementById('toc');
  const content = document.querySelector('.wiki-content');
  if (!toc || !content) return;

  const headings = Array.from(content.querySelectorAll('h2, h3'));
  if (headings.length < 3) { toc.style.display = 'none'; return; }

  let ol = document.createElement('ol');
  let subOl = null;
  let lastH2Li = null;
  let counter = 0;

  headings.forEach(h => {
    // Ensure each heading has an ID for anchor links
    if (!h.id) {
      h.id = 'section-' + (++counter) + '-' + h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.href        = '#' + h.id;
    a.textContent = h.textContent;
    li.appendChild(a);

    if (h.tagName === 'H2') {
      subOl    = null;
      lastH2Li = li;
      ol.appendChild(li);
    } else {
      // H3 — nest under last H2
      if (!subOl) {
        subOl = document.createElement('ol');
        if (lastH2Li) lastH2Li.appendChild(subOl);
        else ol.appendChild(subOl);
      }
      subOl.appendChild(li);
    }
  });

  toc.querySelector('.toc-title') || (() => {
    const t = document.createElement('div');
    t.className = 'toc-title';
    t.textContent = '📋 Contents';
    toc.prepend(t);
  })();
  toc.appendChild(ol);
}

/* ── AUTO-SYNC ARTICLE COUNT STAT ────────────────────────────────────────── */
function initStatArticles() {
  const el = document.getElementById('stat-articles');
  if (el) el.textContent = WIKI_INDEX.length;
}
