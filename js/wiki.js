/**
 * Crypto Moonboys Wiki — Main JavaScript
 * Client-side search, sidebar toggle, UI helpers.
 */

function resolveWikiUrl(url) {
  if (!url) return url;
  // Strip any leading slashes, then collapse repeated wiki/ prefixes (e.g. wiki/wiki/) down to one
  let u = url.replace(/^\/+/, '').replace(/^(wiki\/)+/, 'wiki/');
  if (u.startsWith('wiki/')) return '/' + u;
  return url;
}

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
    title: "1M Free NFTs Drop",
    url: "wiki/1m-free-nfts-drop.html",
    desc: "Mass distribution of free NFTs",
    category: "NFTs & Digital Art",
    emoji: "🎭",
    tags: ["free", "nfts", "drop"]
  },
  {
    title: "Aleema (Child of the Shard)",
    url: "wiki/aleema-child-of-the-shard.html",
    desc: "Young warrior tied to the Shards of Block Topia",
    category: "Lore",
    emoji: "⚔️",
    tags: ["aleema", "child", "the", "shard"]
  },
  {
    title: "Alfie 'The Bitcoin Kid' Blaze",
    url: "wiki/alfie-the-bitcoin-kid-blaze.html",
    desc: "Leader of the Bitcoin Kids, a rebel group in Block Topia",
    category: "Lore",
    emoji: "⚔️",
    tags: ["alfie", "the", "bitcoin", "kid", "blaze"]
  },
  {
    title: "AtomicHub Graffpunks Collection",
    url: "wiki/atomichub-graffpunks-collection.html",
    desc: "NFT collection for Graffpunks on AtomicHub",
    category: "Punk Culture",
    emoji: "🤘",
    tags: ["atomichub", "graffpunks", "collection"]
  },
  {
    title: "Ava Chen",
    url: "wiki/ava-chen.html",
    desc: "Strategic or intellectual figure",
    category: "Lore",
    emoji: "⚔️",
    tags: ["ava", "chen"]
  },
  {
    title: "Battlemech Blast",
    url: "wiki/battlemech-blast.html",
    desc: "2D Web3 shooter game on WAX blockchain",
    category: "Gaming",
    emoji: "🎮",
    tags: ["battlemech", "blast"]
  },
  {
    title: "Billy the Goat Kid",
    url: "wiki/billy-the-goat-kid.html",
    desc: "Young, mischievous rebel",
    category: "Community & People",
    emoji: "👥",
    tags: ["billy", "the", "goat", "kid"]
  },
  {
    title: "Bit-Cap 5000",
    url: "wiki/bit-cap-5000.html",
    desc: "Tech-enhanced warrior or enforcer",
    category: "Lore",
    emoji: "⚔️",
    tags: ["bit", "cap", "5000"]
  },
  {
    title: "Bitcoin Kid Army",
    url: "wiki/bitcoin-kid-army.html",
    desc: "Rebel army led by Alfie 'The Bitcoin Kid' Blaze",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["bitcoin", "kid", "army"]
  },
  {
    title: "Bitcoin X Kids",
    url: "wiki/bitcoin-x-kids.html",
    desc: "Hybrid children army inside Block Topia walls",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["bitcoin", "kids"]
  },
  {
    title: "Block Node Defenders",
    url: "wiki/block-node-defenders.html",
    desc: "Protectors of blockchain nodes",
    category: "Lore",
    emoji: "⚔️",
    tags: ["block", "node", "defenders"]
  },
  {
    title: "Block Topia",
    url: "wiki/block-topia.html",
    desc: "Central digital city in the Crypto Moonboys universe",
    category: "Lore",
    emoji: "⚔️",
    tags: ["block", "topia"]
  },
  {
    title: "Bone Idol Ink",
    url: "wiki/bone-idol-ink.html",
    desc: "Co-founder of Graffiti Kings, handles events and collabs",
    category: "Art & Creativity",
    emoji: "🎨",
    tags: ["bone", "idol", "ink"]
  },
  {
    title: "Burn-to-Earn",
    url: "wiki/burn-to-earn.html",
    desc: "Reward system for burning NFTs or tokens",
    category: "Technology",
    emoji: "⚙️",
    tags: ["burn", "earn"]
  },
  {
    title: "Charlie Buster",
    url: "wiki/charlie-buster.html",
    desc: "Voice of HODL WARRIORS and creator in lore",
    category: "Lore",
    emoji: "⚔️",
    tags: ["charlie", "buster"]
  },
  {
    title: "Croydon Tower Blocks",
    url: "wiki/croydon-tower-blocks.html",
    desc: "Historical origin point of Graffiti Kings in lore",
    category: "Lore",
    emoji: "⚔️",
    tags: ["croydon", "tower", "blocks"]
  },
  {
    title: "Crypto Moonboys",
    url: "wiki/crypto-moonboys.html",
    desc: "Core brand of the Web3 NFT project",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["crypto", "moonboys"]
  },
  {
    title: "Darren Cullen (SER) - Real",
    url: "wiki/darren-cullen-ser-real.html",
    desc: "Founder and artist of Graffiti Kings, visionary behind Crypto Moonboys.",
    category: "Technology",
    emoji: "⚙️",
    tags: ["darren", "cullen", "ser", "real"]
  },
  {
    title: "Darren Cullen (SER)",
    url: "wiki/darren-cullen-ser.html",
    desc: "Founder of Graffiti Kings and visionary in lore as a character",
    category: "Lore",
    emoji: "⚔️",
    tags: ["darren", "cullen", "ser"]
  },
  {
    title: "Darren Cullen",
    url: "wiki/darren-cullen.html",
    desc: "Founder and owner of Graffiti Kings, a collaboration of graffiti artists, street artists, animators, filmmakers, illustrators, music producers and DJs.",
    category: "Community & People",
    emoji: "👥",
    tags: ["darren", "cullen"]
  },
  {
    title: "Decentraland Events",
    url: "wiki/decentraland-events.html",
    desc: "New events or exhibitions in Decentraland tied to Crypto Moonboys",
    category: "Tools & Platforms",
    emoji: "🔧",
    tags: ["decentraland", "events"]
  },
  {
    title: "Delicious Again Pete",
    url: "wiki/delicious-again-pete.html",
    desc: "Co-founder of Graffiti Kings, focuses on music and events",
    category: "Technology",
    emoji: "⚙️",
    tags: ["delicious", "again", "pete"]
  },
  {
    title: "Dragan Volkov",
    url: "wiki/dragan-volkov.html",
    desc: "Formidable warrior or leader",
    category: "Lore",
    emoji: "⚔️",
    tags: ["dragan", "volkov"]
  },
  {
    title: "Elder Codex-7",
    url: "wiki/elder-codex-7.html",
    desc: "Ancient knowledge keeper in Block Topia",
    category: "Lore",
    emoji: "⚔️",
    tags: ["elder", "codex"]
  },
  {
    title: "Forkborn Collective",
    url: "wiki/forkborn-collective.html",
    desc: "Group born from blockchain forks",
    category: "Community & People",
    emoji: "👥",
    tags: ["forkborn", "collective"]
  },
  {
    title: "Forklord You",
    url: "wiki/forklord-you.html",
    desc: "Master of blockchain forks and divisions",
    category: "Lore",
    emoji: "⚔️",
    tags: ["forklord", "you"]
  },
  {
    title: "Forksplit",
    url: "wiki/forksplit.html",
    desc: "Divider or disruptor in blockchain conflicts",
    category: "Lore",
    emoji: "⚔️",
    tags: ["forksplit"]
  },
  {
    title: "GAMES4PUNKS Telegram Games",
    url: "wiki/games4punks-telegram-games.html",
    desc: "Mini-games on Telegram platform",
    category: "Punk Culture",
    emoji: "🤘",
    tags: ["games4punks", "telegram", "games"]
  },
  {
    title: "Gang Signs Card Game",
    url: "wiki/gang-signs-card-game.html",
    desc: "Strategic card game in Web3 format",
    category: "Gaming",
    emoji: "🎮",
    tags: ["gang", "signs", "card", "game"]
  },
  {
    title: "Gang Signs",
    url: "wiki/gang-signs.html",
    desc: "A card game within the Crypto Moonboys universe.",
    category: "Community & People",
    emoji: "👥",
    tags: ["gang", "signs"]
  },
  {
    title: "$GK Token",
    url: "wiki/gk-token.html",
    desc: "Reward token earned through staking in the Crypto Moonboys universe.",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["token"]
  },
  {
    title: "$GK Tokens",
    url: "wiki/gk-tokens.html",
    desc: "Reward token for staking NFT murals",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["tokens"]
  },
  {
    title: "GKniftyHEADS",
    url: "wiki/gkniftyheads.html",
    desc: "GKniftyHEADS is a project associated with Graffiti Kings and a Web3 NFT rebellion.",
    category: "Community & People",
    emoji: "👥",
    tags: ["gkniftyheads"]
  },
  {
    title: "Graffiti Kings",
    url: "wiki/graffiti-kings.html",
    desc: "A collaboration of graffiti artists, street artists, animators, filmmakers, illustrators, music producers, DJs, event planners, and digital street marketers.",
    category: "Graffiti & Street Art",
    emoji: "🖌️",
    tags: ["graffiti", "kings"]
  },
  {
    title: "GraffPUNKS 24/7 Blockchain Radio Station",
    url: "wiki/graffpunks-247-blockchain-radio-station.html",
    desc: "Online radio station for GraffPUNKS music",
    category: "Punk Culture",
    emoji: "🤘",
    tags: ["graffpunks", "blockchain", "radio", "station", "247"]
  },
  {
    title: "Great Datapocalypse of 2789",
    url: "wiki/great-datapocalypse-of-2789.html",
    desc: "Catastrophic event leading to digital consciousness",
    category: "Lore",
    emoji: "⚔️",
    tags: ["great", "datapocalypse", "2789"]
  },
  {
    title: "GRIT",
    url: "wiki/grit.html",
    desc: "Tough, resilient fighter",
    category: "Lore",
    emoji: "⚔️",
    tags: ["grit"]
  },
  {
    title: "Grit42",
    url: "wiki/grit42.html",
    desc: "Hardened survivor or warrior",
    category: "Lore",
    emoji: "⚔️",
    tags: ["grit42"]
  },
  {
    title: "Hard Fork Games",
    url: "wiki/hard-fork-games.html",
    desc: "Competitive games run by Queen Sarah P-fly",
    category: "Gaming",
    emoji: "🎮",
    tags: ["hard", "fork", "games"]
  },
  {
    title: "HEX-TAGGER PRIME",
    url: "wiki/hex-tagger-prime.html",
    desc: "Master of digital graffiti and tagging",
    category: "Lore",
    emoji: "⚔️",
    tags: ["hex", "tagger", "prime"]
  },
  {
    title: "HODL Warriors Army",
    url: "wiki/hodl-warriors-army.html",
    desc: "Core fighting force of the HODL WARRIORS",
    category: "Community & People",
    emoji: "👥",
    tags: ["hodl", "warriors", "army"]
  },
  {
    title: "HODL X Warriors",
    url: "wiki/hodl-x-warriors.html",
    desc: "Elite warriors earning title via Hard Fork Games",
    category: "Lore",
    emoji: "⚔️",
    tags: ["hodl", "warriors"]
  },
  {
    title: "Iris-7",
    url: "wiki/iris-7.html",
    desc: "Visionary or seer in the Crypto Moonboys narrative",
    category: "Lore",
    emoji: "⚔️",
    tags: ["iris"]
  },
  {
    title: "Jodie ZOOM 2000",
    url: "wiki/jodie-zoom-2000.html",
    desc: "Tech-savvy operative in the Crypto Moonboys universe",
    category: "Lore",
    emoji: "⚔️",
    tags: ["jodie", "zoom", "2000"]
  },
  {
    title: "Jonny &amp; Laurence Nelson (TAG Records)",
    url: "wiki/jonny-laurence-nelson-tag-records.html",
    desc: "Music partners for Graffiti Kings",
    category: "Technology",
    emoji: "⚙️",
    tags: ["jonny", "amp", "laurence", "nelson", "tag", "records"]
  },
  {
    title: "Lady-INK",
    url: "wiki/lady-ink.html",
    desc: "Artistic revolutionary in Block Topia",
    category: "Art & Creativity",
    emoji: "🎨",
    tags: ["lady", "ink"]
  },
  {
    title: "Leake Street Tunnel",
    url: "wiki/leake-street-tunnel.html",
    desc: "Iconic graffiti hub in lore and reality",
    category: "Graffiti & Street Art",
    emoji: "🖌️",
    tags: ["leake", "street", "tunnel"]
  },
  {
    title: "$LFGK Rewards",
    url: "wiki/lfgk-rewards.html",
    desc: "Reward token system for engagement",
    category: "Technology",
    emoji: "⚙️",
    tags: ["lfgk", "rewards"]
  },
  {
    title: "$LFGK Token",
    url: "wiki/lfgk-token.html",
    desc: "Reward token for various activities in the Crypto Moonboys universe.",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["lfgk", "token"]
  },
  {
    title: "$LFGK",
    url: "wiki/lfgk.html",
    desc: "Reward token for engagement and achievements",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["lfgk"]
  },
  {
    title: "Loopfiend",
    url: "wiki/loopfiend.html",
    desc: "Obsessive coder or hacker",
    category: "Lore",
    emoji: "⚔️",
    tags: ["loopfiend"]
  },
  {
    title: "M1nTr_K1ll",
    url: "wiki/m1ntr-k1ll.html",
    desc: "Aggressive miner or data hunter",
    category: "Lore",
    emoji: "⚔️",
    tags: ["m1ntr", "k1ll"]
  },
  {
    title: "Maidstone Base",
    url: "wiki/maidstone-base.html",
    desc: "Current headquarters of GKniftyHEADS in lore and reality",
    category: "Lore",
    emoji: "⚔️",
    tags: ["maidstone", "base"]
  },
  {
    title: "Medium Articles by @GKniftyHEADS",
    url: "wiki/medium-articles-by-gkniftyheads.html",
    desc: "New articles or updates from @GKniftyHEADS on Medium",
    category: "Media & Publishing",
    emoji: "📰",
    tags: ["medium", "articles", "gkniftyheads"]
  },
  {
    title: "Medium Articles by @GRAFFPUNKS",
    url: "wiki/medium-articles-by-graffpunks.html",
    desc: "New articles or updates from @GRAFFPUNKS on Medium",
    category: "Punk Culture",
    emoji: "🤘",
    tags: ["medium", "articles", "graffpunks"]
  },
  {
    title: "Medium Articles by @HODLWARRIORS",
    url: "wiki/medium-articles-by-hodlwarriors.html",
    desc: "New articles or updates from @HODLWARRIORS on Medium",
    category: "Media & Publishing",
    emoji: "📰",
    tags: ["medium", "articles", "hodlwarriors"]
  },
  {
    title: "Medium Articles by @sercullen",
    url: "wiki/medium-articles-by-sercullen.html",
    desc: "New articles or updates from @sercullen on Medium",
    category: "Media & Publishing",
    emoji: "📰",
    tags: ["medium", "articles", "sercullen"]
  },
  {
    title: "Metaverse Battles",
    url: "wiki/metaverse-battles.html",
    desc: "Competitive events in virtual spaces",
    category: "Technology",
    emoji: "⚙️",
    tags: ["metaverse", "battles"]
  },
  {
    title: "MiDEViL HERO ARENA",
    url: "wiki/midevil-hero-arena.html",
    desc: "Playable game in the Crypto Moonboys universe",
    category: "Gaming",
    emoji: "🎮",
    tags: ["midevil", "hero", "arena"]
  },
  {
    title: "$NBG",
    url: "wiki/nbg.html",
    desc: "Token associated with No Ball Games collection",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["nbg"]
  },
  {
    title: "NeftyBlocks Midevilpunks Collection",
    url: "wiki/neftyblocks-midevilpunks-collection.html",
    desc: "NFT collection tied to medieval punk themes on NeftyBlocks",
    category: "Punk Culture",
    emoji: "🤘",
    tags: ["neftyblocks", "midevilpunks", "collection"]
  },
  {
    title: "No Ball Games (NBG) Collection",
    url: "wiki/no-ball-games-nbg-collection.html",
    desc: "NFT collection by Charlie Buster in the Crypto Moonboys universe.",
    category: "Gaming",
    emoji: "🎮",
    tags: ["ball", "games", "nbg", "collection"]
  },
  {
    title: "No Ball Games (NBG)",
    url: "wiki/no-ball-games-nbg.html",
    desc: "NFT collection by Charlie Buster",
    category: "Gaming",
    emoji: "🎮",
    tags: ["ball", "games", "nbg"]
  },
  {
    title: "NULL THE PROPHET",
    url: "wiki/null-the-prophet.html",
    desc: "Genesis Error and origin of the Null-Cipher",
    category: "Lore",
    emoji: "⚔️",
    tags: ["null", "the", "prophet"]
  },
  {
    title: "Patchwork",
    url: "wiki/patchwork.html",
    desc: "Assembler or creator of hybrid solutions",
    category: "Art & Creativity",
    emoji: "🎨",
    tags: ["patchwork"]
  },
  {
    title: "Phygital Prints",
    url: "wiki/phygital-prints.html",
    desc: "Physical-digital hybrid collectibles",
    category: "Art & Creativity",
    emoji: "🎨",
    tags: ["phygital", "prints"]
  },
  {
    title: "Playable NFT Murals",
    url: "wiki/playable-nft-murals.html",
    desc: "Interactive digital art for staking and rewards",
    category: "NFTs & Digital Art",
    emoji: "🎭",
    tags: ["playable", "nft", "murals"]
  },
  {
    title: "$PUNK Token",
    url: "wiki/punk-token.html",
    desc: "Primary cryptocurrency for GraffPUNKS",
    category: "Punk Culture",
    emoji: "🤘",
    tags: ["punk", "token"]
  },
  {
    title: "PYRALITH",
    url: "wiki/pyralith.html",
    desc: "Fiery or destructive force",
    category: "Lore",
    emoji: "⚔️",
    tags: ["pyralith"]
  },
  {
    title: "Queen Sarah P-fly",
    url: "wiki/queen-sarah-p-fly.html",
    desc: "Ruler of the Sacred Chain and organizer of the Hard Fork Games",
    category: "Lore",
    emoji: "⚔️",
    tags: ["queen", "sarah", "fly"]
  },
  {
    title: "Quell",
    url: "wiki/quell.html",
    desc: "Suppressor or pacifier of conflicts",
    category: "Lore",
    emoji: "⚔️",
    tags: ["quell"]
  },
  {
    title: "Rune Tag",
    url: "wiki/rune-tag.html",
    desc: "Mystical or symbolic graffiti artist",
    category: "Lore",
    emoji: "⚔️",
    tags: ["rune", "tag"]
  },
  {
    title: "Sacred Chain",
    url: "wiki/sacred-chain.html",
    desc: "Spiritual or authoritative blockchain realm",
    category: "Lore",
    emoji: "⚔️",
    tags: ["sacred", "chain"]
  },
  {
    title: "Samael.exe",
    url: "wiki/samaelexe.html",
    desc: "Malicious program or digital entity",
    category: "Lore",
    emoji: "⚔️",
    tags: ["samael", "exe", "samaelexe"]
  },
  {
    title: "Sarah PU51FLY",
    url: "wiki/sarah-pu51fly.html",
    desc: "Partner in Graffiti Kings and Queen Sarah P-fly in lore",
    category: "Technology",
    emoji: "⚙️",
    tags: ["sarah", "pu51fly"]
  },
  {
    title: "SatoRebel",
    url: "wiki/satorebel.html",
    desc: "Revolutionary inspired by crypto origins",
    category: "Lore",
    emoji: "⚔️",
    tags: ["satorebel"]
  },
  {
    title: "Seeding Rights",
    url: "wiki/seeding-rights.html",
    desc: "Rights to seed or initiate digital content",
    category: "Technology",
    emoji: "⚙️",
    tags: ["seeding", "rights"]
  },
  {
    title: "Sister Halcyon",
    url: "wiki/sister-halcyon.html",
    desc: "Peaceful or spiritual guide",
    category: "Lore",
    emoji: "⚔️",
    tags: ["sister", "halcyon"]
  },
  {
    title: "SMArT NFT Mechanics",
    url: "wiki/smart-nft-mechanics.html",
    desc: "Advanced NFT mechanics involving $GK collateral and loanable metadata",
    category: "NFTs & Digital Art",
    emoji: "🎭",
    tags: ["smart", "nft", "mechanics"]
  },
  {
    title: "Snipey 'D-Man' Sirus",
    url: "wiki/snipey-d-man-sirus.html",
    desc: "Sharpshooter or tactical operative",
    category: "Lore",
    emoji: "⚔️",
    tags: ["snipey", "man", "sirus"]
  },
  {
    title: "Spirit Borns",
    url: "wiki/spirit-borns.html",
    desc: "Mystical or reborn digital entities",
    category: "Lore",
    emoji: "⚔️",
    tags: ["spirit", "borns"]
  },
  {
    title: "Spraycode &amp; Writcode Mechanics",
    url: "wiki/spraycode-writcode-mechanics.html",
    desc: "Coding mechanics for creating digital graffiti",
    category: "Technology",
    emoji: "⚙️",
    tags: ["spraycode", "amp", "writcode", "mechanics"]
  },
  {
    title: "Squeaky Pinks enforcers",
    url: "wiki/squeaky-pinks-enforcers.html",
    desc: "Enforcement wing of The Squeaky Pinks",
    category: "Art & Creativity",
    emoji: "🎨",
    tags: ["squeaky", "pinks", "enforcers"]
  },
  {
    title: "Stake for $GK Tokens",
    url: "wiki/stake-for-gk-tokens.html",
    desc: "Staking mechanism to earn $GK tokens.",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["stake", "for", "tokens"]
  },
  {
    title: "Street Kingdoms",
    url: "wiki/street-kingdoms.html",
    desc: "Opposing force and territory to Block Topia",
    category: "Graffiti & Street Art",
    emoji: "🖌️",
    tags: ["street", "kingdoms"]
  },
  {
    title: "Substack Posts on graffpunks.substack.com",
    url: "wiki/substack-posts-on-graffpunkssubstackcom.html",
    desc: "New posts on Substack covering City Block Topia, Sacred Chain Ontology, and 2026 lore",
    category: "Punk Culture",
    emoji: "🤘",
    tags: ["substack", "posts", "graffpunks", "com", "graffpunkssubstackcom"]
  },
  {
    title: "The AllCity Bulls",
    url: "wiki/the-allcity-bulls.html",
    desc: "Dominant urban force",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "allcity", "bulls"]
  },
  {
    title: "The AZTEC RAIDERS",
    url: "wiki/the-aztec-raiders.html",
    desc: "Historical or culturally inspired aggressors",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "aztec", "raiders"]
  },
  {
    title: "The BALLY BOYS",
    url: "wiki/the-bally-boys.html",
    desc: "Tough street gang",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "bally", "boys"]
  },
  {
    title: "The Bitcoin Kid Army",
    url: "wiki/the-bitcoin-kid-army.html",
    desc: "Rebel group led by Alfie 'The Bitcoin Kid' Blaze",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["the", "bitcoin", "kid", "army"]
  },
  {
    title: "The BLOCKCHAIN FURIES",
    url: "wiki/the-blockchain-furies.html",
    desc: "Aggressive defenders of blockchain integrity",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "blockchain", "furies"]
  },
  {
    title: "The BLOCKSTARS",
    url: "wiki/the-blockstars.html",
    desc: "Celebrity-like blockchain influencers",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "blockstars"]
  },
  {
    title: "The CHAIN SCRIBES",
    url: "wiki/the-chain-scribes.html",
    desc: "Historians or record-keepers of blockchain events",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "chain", "scribes"]
  },
  {
    title: "The CODE ALCHEMISTS",
    url: "wiki/the-code-alchemists.html",
    desc: "Masters of transforming code into value",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "code", "alchemists"]
  },
  {
    title: "The CRYPTO MOONGIRLS",
    url: "wiki/the-crypto-moongirls.html",
    desc: "Female-led crypto rebels",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["the", "crypto", "moongirls"]
  },
  {
    title: "The CRYPTO STONED BOYS",
    url: "wiki/the-crypto-stoned-boys.html",
    desc: "Relaxed yet crypto-savvy group",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["the", "crypto", "stoned", "boys"]
  },
  {
    title: "The DUCKY BOYS",
    url: "wiki/the-ducky-boys.html",
    desc: "Quirky yet fierce street crew",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "ducky", "boys"]
  },
  {
    title: "The EVM PUNKS",
    url: "wiki/the-evm-punks.html",
    desc: "Rebels tied to Ethereum Virtual Machine technology",
    category: "Punk Culture",
    emoji: "🤘",
    tags: ["the", "evm", "punks"]
  },
  {
    title: "The FINANCE GUILD",
    url: "wiki/the-finance-guild.html",
    desc: "Experts in blockchain economics",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "finance", "guild"]
  },
  {
    title: "The GASLESS GHOSTS",
    url: "wiki/the-gasless-ghosts.html",
    desc: "Elusive faction avoiding blockchain fees",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "gasless", "ghosts"]
  },
  {
    title: "The GKniftyHEADS",
    url: "wiki/the-gkniftyheads.html",
    desc: "Core faction of spectral consciousnesses ruling a phygital empire",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "gkniftyheads"]
  },
  {
    title: "The GRAFFPUNKS",
    url: "wiki/the-graffpunks.html",
    desc: "Rebellious street art collective in digital form",
    category: "Punk Culture",
    emoji: "🤘",
    tags: ["the", "graffpunks"]
  },
  {
    title: "The HARD FORK ROCKERS",
    url: "wiki/the-hard-fork-rockers.html",
    desc: "Rebels tied to blockchain forks",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "hard", "fork", "rockers"]
  },
  {
    title: "The High Hats",
    url: "wiki/the-high-hats.html",
    desc: "Elite or aristocratic group",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "high", "hats"]
  },
  {
    title: "The INFORMATION MERCENARIES",
    url: "wiki/the-information-mercenaries.html",
    desc: "Data traders or spies for hire",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "information", "mercenaries"]
  },
  {
    title: "The MOONLORDS",
    url: "wiki/the-moonlords.html",
    desc: "Rulers or influencers of high aspirations",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "moonlords"]
  },
  {
    title: "The NICE &amp; EASY BOIS",
    url: "wiki/the-nice-easy-bois.html",
    desc: "Laid-back but cunning group",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "nice", "amp", "easy", "bois"]
  },
  {
    title: "The Nomad Bears",
    url: "wiki/the-nomad-bears.html",
    desc: "Wandering faction with protective instincts",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "nomad", "bears"]
  },
  {
    title: "The OG PIXEL SAINTS",
    url: "wiki/the-og-pixel-saints.html",
    desc: "Veteran digital artists or pioneers",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "pixel", "saints"]
  },
  {
    title: "The Princess",
    url: "wiki/the-princess.html",
    desc: "Royal or influential figure",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "princess"]
  },
  {
    title: "The RUGPULL MINERS",
    url: "wiki/the-rugpull-miners.html",
    desc: "Deceptive or exploitative group",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "rugpull", "miners"]
  },
  {
    title: "The SALVAGERS",
    url: "wiki/the-salvagers.html",
    desc: "Scavengers of digital remnants",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "salvagers"]
  },
  {
    title: "The SHARD MOTHERS of MANHATTAN",
    url: "wiki/the-shard-mothers-of-manhattan.html",
    desc: "Protectors or nurturers of fragmented territories",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "shard", "mothers", "manhattan"]
  },
  {
    title: "The Squeaky Pinks",
    url: "wiki/the-squeaky-pinks.html",
    desc: "Colorful and unpredictable faction",
    category: "Art & Creativity",
    emoji: "🎨",
    tags: ["the", "squeaky", "pinks"]
  },
  {
    title: "The TUSKON OGS",
    url: "wiki/the-tuskon-ogs.html",
    desc: "Veteran or original gang members",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "tuskon", "ogs"]
  },
  {
    title: "The Whitewasher",
    url: "wiki/the-whitewasher.html",
    desc: "Entity of erasure or censorship",
    category: "Lore",
    emoji: "⚔️",
    tags: ["the", "whitewasher"]
  },
  {
    title: "Thera-9",
    url: "wiki/thera-9.html",
    desc: "Strategic planner in the decentralized network",
    category: "Lore",
    emoji: "⚔️",
    tags: ["thera"]
  },
  {
    title: "Thorne The Architect",
    url: "wiki/thorne-the-architect.html",
    desc: "Designer of digital structures in Block Topia",
    category: "Lore",
    emoji: "⚔️",
    tags: ["thorne", "the", "architect"]
  },
  {
    title: "Trevor Fung",
    url: "wiki/trevor-fung.html",
    desc: "Godfather DJ ambassador for GraffPUNKS",
    category: "Technology",
    emoji: "⚙️",
    tags: ["trevor", "fung"]
  },
  {
    title: "Triple Fork Event",
    url: "wiki/triple-fork-event.html",
    desc: "Major lore event splitting blockchain realities",
    category: "Technology",
    emoji: "⚙️",
    tags: ["triple", "fork", "event"]
  },
  {
    title: "XRP KIDs Genesis NFTs",
    url: "wiki/xrp-kids-genesis-nfts.html",
    desc: "Exclusive NFT collection by Charlie Buster on XRPL.",
    category: "NFTs & Digital Art",
    emoji: "🎭",
    tags: ["xrp", "kids", "genesis", "nfts"]
  },
  {
    title: "XRP Kids NBG Updates",
    url: "wiki/xrp-kids-nbg-updates.html",
    desc: "Updates to XRP Kids No Ball Games collection on xrp.cafe and xrpl.to",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["xrp", "kids", "nbg", "updates"]
  },
  {
    title: "XRP KIDs",
    url: "wiki/xrp-kids.html",
    desc: "NFT collection by Charlie Buster on XRPL",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["xrp", "kids"]
  },
  {
    title: "$GK",
    url: "wiki/gk.html",
    desc: "The $GK token is the lifeblood of the Crypto Moonboys economy, earned through staking playable NFT murals or securing victories.",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["gk", "token", "crypto", "staking"]
  },
  {
    title: "Graffiti Queens Exhibition",
    url: "wiki/graffiti-queens-exhibition.html",
    desc: "Largest all-female NFT exhibition in the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "🎨",
    tags: ["graffiti", "queens", "exhibition", "nft"]
  },
  {
    title: "Graffiti Queens in Decentraland",
    url: "wiki/graffiti-queens-in-decentraland.html",
    desc: "Graffiti Queens in Decentraland stands as a transformative cultural milestone in the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "🎨",
    tags: ["graffiti", "queens", "decentraland", "metaverse"]
  },
  {
    title: "GraffPUNKS",
    url: "wiki/graffpunks.html",
    desc: "Rebellious street art faction within the Crypto Moonboys universe uniting graffiti artists worldwide.",
    category: "Lore",
    emoji: "🤘",
    tags: ["graffpunks", "street art", "punk"]
  },
  {
    title: "Hard Fork Games Event",
    url: "wiki/hard-fork-games-event.html",
    desc: "Competitive lore event in the Crypto Moonboys universe.",
    category: "Lore",
    emoji: "⚔️",
    tags: ["hard fork", "games", "event", "lore"]
  },
  {
    title: "$NBG Token",
    url: "wiki/nbg-token.html",
    desc: "Token tied to No Ball Games collection by Charlie Buster.",
    category: "Concepts",
    emoji: "🪙",
    tags: ["nbg", "token", "no ball games"]
  },
  {
    title: "NBGX",
    url: "wiki/nbgx.html",
    desc: "Secondary token in the Crypto Moonboys ecosystem, a specialized variant of the NBG token.",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["nbgx", "token", "crypto"]
  },
  {
    title: "PMSL",
    url: "wiki/pmsl.html",
    desc: "Enigmatic token within the Crypto Moonboys ecosystem.",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["pmsl", "token", "crypto"]
  },
  {
    title: "PUNK Coin",
    url: "wiki/punk-coin.html",
    desc: "PUNK Coin fueling the GraffPUNKS ecosystem.",
    category: "Lore",
    emoji: "🤘",
    tags: ["punk", "coin", "graffpunks"]
  },
  {
    title: "$PUNK",
    url: "wiki/punk.html",
    desc: "Core currency token fueling the GraffPUNKS ecosystem.",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["punk", "token", "crypto"]
  },
  {
    title: "Spraycode & Writcode",
    url: "wiki/spraycode-writcode.html",
    desc: "Coding mechanics for digital graffiti in the Crypto Moonboys universe.",
    category: "Concepts",
    emoji: "🎨",
    tags: ["spraycode", "writcode", "mechanics", "graffiti"]
  },
  {
    title: "Staking for $GK Tokens",
    url: "wiki/staking-for-gk-tokens.html",
    desc: "Reward system for staking NFTs to earn $GK tokens.",
    category: "Concepts",
    emoji: "💡",
    tags: ["staking", "gk", "tokens", "rewards"]
  },
  {
    title: "Staking",
    url: "wiki/staking.html",
    desc: "Mechanism to lock NFTs or tokens for rewards like $GK tokens.",
    category: "Concepts",
    emoji: "💡",
    tags: ["staking", "nft", "tokens", "rewards"]
  },
  {
    title: "THE GRIDS",
    url: "wiki/the-grids.html",
    desc: "Digital battleground in the Crypto Moonboys lore.",
    category: "Lore",
    emoji: "⚔️",
    tags: ["grids", "battleground", "lore"]
  },
  {
    title: "The HODL Warriors",
    url: "wiki/the-hodl-warriors.html",
    desc: "Elite warriors earning status through Hard Fork Games.",
    category: "Lore",
    emoji: "⚔️",
    tags: ["hodl", "warriors", "lore"]
  },
  {
    title: "The Sacred Chain",
    url: "wiki/the-sacred-chain.html",
    desc: "Spiritual blockchain realm in the Crypto Moonboys lore.",
    category: "Lore",
    emoji: "⚔️",
    tags: ["sacred", "chain", "blockchain", "lore"]
  },
  {
    title: "Tokens",
    url: "wiki/tokens.html",
    desc: "Overview of crypto tokens in the Crypto Moonboys ecosystem.",
    category: "Lore",
    emoji: "🪙",
    tags: ["tokens", "crypto", "ecosystem"]
  },
  {
    title: "$WAXP",
    url: "wiki/waxp.html",
    desc: "Blockchain token for the WAX platform used in Crypto Moonboys NFT collections.",
    category: "Cryptocurrencies",
    emoji: "🪙",
    tags: ["waxp", "wax", "token", "blockchain"]
  }
];

/* ── CATEGORY INDEX ────────────────────────────────────────────────────────
   All wiki categories are registered here.
   When a new category page is added, also add its name to this list so the
   category count on the home page updates automatically.
   ─────────────────────────────────────────────────────────────────────── */
const CATEGORY_LIST = [
  "Cryptocurrencies",
  "Concepts",
  "Technology",
  "Tools & Platforms",
  "Lore",
  "Crypto Designer Toys",
  "Guerilla Marketing",
  "Graffiti & Street Art",
  "NFTs & Digital Art",
  "Punk Culture",
  "Gaming",
  "Community & People",
  "Media & Publishing",
  "Art & Creativity",
  "Activism & Counter-Culture"
];

/* ── DOM READY ──────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initSearch();
  initStatArticles();
  initStatCategories();
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
      div.addEventListener('click', () => { window.location.href = resolveWikiUrl(item.url); });
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
    <a href="${resolveWikiUrl(item.url)}" class="article-list-item">
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

/* ── AUTO-SYNC CATEGORY COUNT STAT ──────────────────────────────────────── */
function initStatCategories() {
  const el = document.getElementById('stat-categories');
  if (el) el.textContent = CATEGORY_LIST.length;
}
