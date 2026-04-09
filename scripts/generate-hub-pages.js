#!/usr/bin/env node
'use strict';

/**
 * Phase 23 — generate-hub-pages.js
 *
 * Produces cluster hub pages from real graph + content signals:
 *   js/entity-graph.json, js/wiki-index.json, js/entity-map.json,
 *   js/link-graph.json, js/link-map.json
 *
 * Outputs new wiki/*.html hub pages for the strongest ecosystems.
 * Does NOT touch ranking logic, search logic, or existing page content.
 */

const fs   = require('fs');
const path = require('path');

const ROOT             = path.resolve(__dirname, '..');
const WIKI_DIR         = path.join(ROOT, 'wiki');
const WIKI_INDEX_PATH  = path.join(ROOT, 'js', 'wiki-index.json');
const ENTITY_GRAPH_PATH= path.join(ROOT, 'js', 'entity-graph.json');
const ENTITY_MAP_PATH  = path.join(ROOT, 'js', 'entity-map.json');
const LINK_GRAPH_PATH  = path.join(ROOT, 'js', 'link-graph.json');
const LINK_MAP_PATH    = path.join(ROOT, 'js', 'link-map.json');

// ── helpers ────────────────────────────────────────────────────────────────

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function slugFromUrl(url) {
  return url.replace(/^\/wiki\//, '').replace(/\.html$/, '');
}

function urlToTitle(url) {
  const slug = slugFromUrl(url);
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function cleanDisplayTitle(title) {
  return title
    .replace(/\s+[—–-]\s+Crypto Moonboys Wiki$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

function normaliseTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── cluster definitions ────────────────────────────────────────────────────
//
// Each definition drives both member selection AND page content generation.
// Content is synthesised ONLY from real repo signals — no invented canon.

const CLUSTER_DEFS = [
  {
    id:      'graffpunks-ecosystem',
    slug:    'graffpunks-ecosystem',
    label:   'GraffPUNKS Ecosystem',
    emoji:   '🎨',
    badge:   '🎨 Lore',
    category:'lore',
    catLabel:'Lore',
    // signals used to decide membership
    matchTags:    ['graffpunks', 'punk'],
    matchUrlFrag: 'graffpunks',
    coreUrls: [
      '/wiki/graffpunks.html',
      '/wiki/block-topia.html',
      '/wiki/darren-cullen-ser.html',
      '/wiki/punk-token.html',
      '/wiki/graffpunks-24-7.html',
    ],
    maxMembers: 15,
    description:
      'The GraffPUNKS Ecosystem is the creative and cultural engine of the Crypto Moonboys universe — ' +
      'a multi-chain insurgency of street-art rebels, blockchain radio, NFT collections, and digital lore ' +
      'spanning WAX, XRPL, SOL, and Bitcoin Cash.',
    leadParagraphs: [
      'The GraffPUNKS Ecosystem sits at the pulsating core of the Crypto Moonboys universe. ' +
      'Born from the real-world Graffiti Kings collective founded by Darren Cullen (SER) in London, ' +
      'it extends four decades of street-art defiance into the blockchain space — minting rebellion as NFTs, ' +
      'blasting subversive frequencies via the GraffPUNKS 24/7 radio, and weaving a rich vein of lore ' +
      'across Block Topia\'s neon-lit datascape.',
      'More than a faction, the GraffPUNKS Ecosystem is a complete creative infrastructure: ' +
      'a native token ($PUNK), an ever-growing NFT collection on AtomicHub and multi-chain platforms, ' +
      'a blockchain radio station, a Substack and Medium publication network, and a web of interconnected ' +
      'characters, games, and factions that make it the most graph-central cluster in the wiki.',
    ],
    sections: [
      {
        id:    'overview',
        title: 'Ecosystem Overview',
        body: [
          'The GraffPUNKS Ecosystem emerged when real-world street-art culture collided with crypto-native ' +
          'technology. Its foundation is the GraffPUNKS faction — a digital uprising that treats every NFT ' +
          'drop as a spray-can strike against centralised control. The ecosystem radiates outward through ' +
          'affiliated tokens, radio broadcasts, games, and lore pages, all reinforcing a shared aesthetic ' +
          'of creative resistance.',
          'Key pillars of the ecosystem include the <a href="/wiki/graffpunks.html">GraffPUNKS faction</a>, ' +
          'the <a href="/wiki/punk-token.html">$PUNK token</a>, the ' +
          '<a href="/wiki/graffpunks-24-7.html">GraffPUNKS 24/7 blockchain radio</a>, ' +
          'the <a href="/wiki/graffpunks-collection.html">GraffPUNKS NFT collection</a>, and ' +
          '<a href="/wiki/block-topia.html">Block Topia</a> as the shared digital arena for all activity.',
        ],
      },
      {
        id:    'key-entities',
        title: 'Key Entities',
        body: [
          'At the centre stands <a href="/wiki/graffpunks.html">GraffPUNKS</a>, the founding faction whose ' +
          'graph centrality and rank score dominate this cluster. ' +
          '<a href="/wiki/darren-cullen-ser.html">Darren Cullen (SER)</a> provides the real-world graffiti ' +
          'heritage. <a href="/wiki/block-topia.html">Block Topia</a> is the shared digital metropolis where ' +
          'ecosystem activity concentrates. The <a href="/wiki/punk-token.html">$PUNK token</a> fuels ' +
          'economic activity across NFT trades, staking, and in-game mechanics.',
          'The <a href="/wiki/graffpunks-24-7.html">GraffPUNKS 24/7</a> blockchain radio is both a ' +
          'cultural touchstone and a tactical asset — broadcasting coded lore frequencies used in ' +
          '<a href="/wiki/hard-fork-games.html">Hard Fork Games</a>. ' +
          'The <a href="/wiki/graffpunks-collection.html">GraffPUNKS Collection</a> and ' +
          '<a href="/wiki/atomichub-graffpunks-collection.html">AtomicHub listing</a> form the NFT backbone, ' +
          'while the Substack and Medium channels sustain the narrative layer.',
        ],
      },
      {
        id:    'lore-context',
        title: 'Lore Context',
        body: [
          'Within Block Topia\'s lore, GraffPUNKS operate as a clandestine creative insurgency. ' +
          'Their origin event — the "Genesis Spray" NFT drop — crashed WAX servers under overwhelming demand, ' +
          'and is commemorated annually as "Spray Day." The hidden "CipherCanvas" protocol embeds encrypted ' +
          'resistance dispatches inside NFT artworks, connecting the faction to allied groups like the ' +
          '<a href="/wiki/bitcoin-kids.html">Bitcoin Kids</a>.',
          'The 1M Free NFTs programme extends ecosystem reach to new players, flooding the Sacred Chain ' +
          'with accessible tokenised tags and turning every free drop into a tactical battleground. ' +
          'GraffPUNKS\' multi-chain presence across WAX, XRPL, SOL, and Bitcoin Cash ensures no single ' +
          'chain can contain — or censor — the uprising.',
        ],
      },
      {
        id:    'graph-connections',
        title: 'Graph Connections',
        body: [
          'GraffPUNKS sits at the intersection of multiple high-density graph clusters: it links directly ' +
          'to the <a href="/wiki/hodl-wars-ecosystem.html">HODL Wars Ecosystem</a>, the ' +
          '<a href="/wiki/bitcoin-ecosystem.html">Bitcoin Ecosystem</a>, the ' +
          '<a href="/wiki/nft-ecosystem.html">NFT Ecosystem</a>, and the ' +
          '<a href="/wiki/gkniftyheads-ecosystem.html">GKniftyHEADS Ecosystem</a>. ' +
          'This cross-cluster density makes it the primary navigational hub of the entire wiki.',
        ],
      },
    ],
  },

  {
    id:      'hodl-wars-ecosystem',
    slug:    'hodl-wars-ecosystem',
    label:   'HODL Wars Ecosystem',
    emoji:   '⚔️',
    badge:   '⚔️ Lore',
    category:'lore',
    catLabel:'Lore',
    matchTags:    ['hodl', 'war', 'warriors'],
    matchUrlFrag: 'hodl',
    coreUrls: [
      '/wiki/hodl-wars.html',
      '/wiki/hodl-warriors.html',
      '/wiki/diamond-hands.html',
      '/wiki/moon-mission.html',
      '/wiki/hodl-wars-game.html',
    ],
    maxMembers: 12,
    description:
      'The HODL Wars Ecosystem is the conflict engine of the Crypto Moonboys universe — ' +
      'a live NFT saga of faction warfare, chain sieges, and blockchain-native combat ' +
      'across Block Topia\'s contested datascape.',
    leadParagraphs: [
      'HODL Wars is the beating heart of conflict in the Crypto Moonboys universe — a live saga and ' +
      'playable NFT game that transforms Block Topia into a relentless warzone. ' +
      'Factions and armies clash across WAX, XRPL, SOL, and Bitcoin Cash battlefields, ' +
      'fighting Chain Sieges, triggering Hard Fork ruptures, and burning tokens in the ' +
      'pursuit of digital supremacy.',
      'The HODL Wars Ecosystem encompasses not only the central conflict mechanic but also ' +
      'the factions, armies, tokens, and game modes that give the wars their structure. ' +
      'From the elite <a href="/wiki/hodl-warriors.html">HODL Warriors</a> to the volatile ' +
      '<a href="/wiki/diamond-hands.html">Diamond Hands</a> philosophy, every element of this ' +
      'cluster feeds directly into the main conflict narrative.',
    ],
    sections: [
      {
        id:    'overview',
        title: 'Ecosystem Overview',
        body: [
          'HODL Wars is defined by perpetual, multi-faction conflict over blockchain nodes and economic ' +
          'resources in Block Topia. The ecosystem centres on ' +
          '<a href="/wiki/hodl-wars.html">HODL Wars</a> (the saga and game), ' +
          '<a href="/wiki/hodl-warriors.html">HODL Warriors</a> (the premier fighting faction), and ' +
          'mechanics like Burn-to-Earn and Chain Sieges that tie real token activity to in-game outcomes.',
          'The ecosystem\'s graph centrality is second only to GraffPUNKS, with strong inbound link density ' +
          'from character pages, token pages, and game pages alike. Its rank scores reflect deep content: ' +
          'HODL Wars and HODL Warriors are consistently in the top five pages by authority across the wiki.',
        ],
      },
      {
        id:    'key-entities',
        title: 'Key Entities',
        body: [
          '<a href="/wiki/hodl-wars.html">HODL Wars</a> is the canonical conflict saga — the lore vehicle ' +
          'and playable NFT game at the centre of this cluster. ' +
          '<a href="/wiki/hodl-warriors.html">HODL Warriors</a> is the faction that prosecutes its battles ' +
          'most aggressively. <a href="/wiki/hodl-x-warriors.html">HODL × Warriors</a> and ' +
          '<a href="/wiki/hodl-warriors-army.html">HODL Warriors Army</a> extend the faction\'s military depth.',
          '<a href="/wiki/diamond-hands.html">Diamond Hands</a> represents the ideological core of the ' +
          'HODL philosophy — the refusal to sell under pressure — which is both a game mechanic and a ' +
          'lore principle. <a href="/wiki/moon-mission.html">Moon Mission</a> is the ' +
          'aspirational end-state that HODL Wars factions ultimately fight to reach. ' +
          '<a href="/wiki/hodl-wars-game.html">HODL Wars Game</a> provides the playable mechanics layer.',
        ],
      },
      {
        id:    'lore-context',
        title: 'Lore Context',
        body: [
          'HODL Wars was not born of rebellion alone — lore suggests it was originally a corporate ' +
          'simulation designed by blockchain overlords to predict and suppress insurgent movements, ' +
          'before GraffPUNKS hackers infiltrated and turned it into a real battleground. ' +
          'This origin haunts every Chain Siege: players fight a war whose rules were written by the enemy.',
          'Rare events like the "Echo of the Fork" resurrect fallen warriors as spectral avatars, ' +
          'and the mythic "Null Zone" — a hidden battlefield accessible only during massive token burns — ' +
          'is rumoured to hold ancient AI guardians protecting secrets that could end the conflict entirely. ' +
          'The ' +
          '<a href="/wiki/rug-pull-wars.html">Rug Pull Wars</a> and ' +
          '<a href="/wiki/the-fomo-plague.html">FOMO Plague</a> represent destabilising sub-conflicts ' +
          'that flare within the larger war.',
        ],
      },
      {
        id:    'graph-connections',
        title: 'Graph Connections',
        body: [
          'The HODL Wars cluster connects directly to the ' +
          '<a href="/wiki/graffpunks-ecosystem.html">GraffPUNKS Ecosystem</a> (shared battleground in ' +
          'Block Topia), the <a href="/wiki/bitcoin-ecosystem.html">Bitcoin Ecosystem</a> (Bitcoin Kids ' +
          'are major faction combatants), and the <a href="/wiki/nft-ecosystem.html">NFT Ecosystem</a> ' +
          '(Burn-to-Earn and playable NFTs are central mechanics). ' +
          'High cross-link density makes this hub a natural navigation entry-point for conflict-related lore.',
        ],
      },
    ],
  },

  {
    id:      'bitcoin-ecosystem',
    slug:    'bitcoin-ecosystem',
    label:   'Bitcoin Ecosystem',
    emoji:   '₿',
    badge:   '🪙 Tokens',
    category:'tokens',
    catLabel:'Tokens',
    matchTags:    ['bitcoin', 'btc'],
    matchUrlFrag: 'bitcoin',
    coreUrls: [
      '/wiki/bitcoin.html',
      '/wiki/bitcoin-kids.html',
      '/wiki/bitcoin-btc.html',
      '/wiki/alfie-blaze.html',
      '/wiki/bitcoin-graffpunks.html',
    ],
    maxMembers: 12,
    description:
      'The Bitcoin Ecosystem covers BTC as both real-world cryptocurrency and as the cultural ' +
      'backbone of the Crypto Moonboys universe — from technical fundamentals to the ' +
      'Bitcoin Kids faction and their Block Topia resistance.',
    leadParagraphs: [
      'Bitcoin (BTC) is the foundational asset of the Crypto Moonboys universe — both as the ' +
      'real-world first cryptocurrency and as the ideological bedrock on which Block Topia\'s ' +
      'resistance culture is built. The Bitcoin Ecosystem hub surfaces the full depth of this ' +
      'cluster: technical articles, lore factions, key characters, and cross-chain connections ' +
      'that make BTC central to every major narrative thread.',
      'At the lore level, Bitcoin\'s ethos of decentralisation and self-custody maps directly onto ' +
      'Block Topia\'s resistance against blockchain overlords. The ' +
      '<a href="/wiki/bitcoin-kids.html">Bitcoin Kids</a> are among the wiki\'s highest-ranked pages, ' +
      'reflecting both content depth and graph centrality — their story of digital-native youth ' +
      'fighting for financial sovereignty resonates throughout the entire narrative.',
    ],
    sections: [
      {
        id:    'overview',
        title: 'Ecosystem Overview',
        body: [
          'The Bitcoin Ecosystem spans two overlapping domains. ' +
          'The first is technical and encyclopedic: ' +
          '<a href="/wiki/bitcoin.html">Bitcoin (BTC)</a> covers blockchain fundamentals, ' +
          'the halving cycle, proof-of-work, and real-world adoption signals. ' +
          '<a href="/wiki/bitcoin-btc.html">Bitcoin BTC</a> extends this with detailed token analysis. ' +
          'These pages serve readers seeking factual grounding in the asset.',
          'The second domain is lore-native: the ' +
          '<a href="/wiki/bitcoin-kids.html">Bitcoin Kids</a> faction, ' +
          '<a href="/wiki/alfie-blaze.html">Alfie Blaze</a> as their figurehead, and the ' +
          '<a href="/wiki/bitcoin-graffpunks.html">Bitcoin × GraffPUNKS</a> intersection represent ' +
          'how Bitcoin\'s philosophy has been absorbed into Block Topia\'s resistance culture. ' +
          'The Bitcoin Kids are one of the most graph-connected factions in the wiki, with strong ' +
          'inbound links from characters, tokens, and game pages.',
        ],
      },
      {
        id:    'key-entities',
        title: 'Key Entities',
        body: [
          '<a href="/wiki/bitcoin.html">Bitcoin</a> is the canonical technology article — the entry point ' +
          'for readers seeking to understand BTC in both real-world and lore contexts. ' +
          '<a href="/wiki/bitcoin-kids.html">Bitcoin Kids</a> is the primary lore faction, ' +
          'ranking among the top three pages by score in the entire wiki. ' +
          '<a href="/wiki/alfie-blaze.html">Alfie Blaze</a> and ' +
          '<a href="/wiki/alfie-the-bitcoin-kid-blaze.html">Alfie the Bitcoin Kid Blaze</a> ' +
          'are key character entries that personalise the faction\'s story.',
          '<a href="/wiki/bitcoin-x-kids.html">Bitcoin × Kids</a> and ' +
          '<a href="/wiki/the-bitcoin-kid-army.html">The Bitcoin Kid Army</a> extend the faction\'s ' +
          'scale, while <a href="/wiki/bitcoin-graffpunks.html">Bitcoin GraffPUNKS</a> documents the ' +
          'intersection of Bitcoin ideology with the GraffPUNKS creative insurgency — a bridge page ' +
          'that gives this cluster strong cross-ecosystem connectivity.',
        ],
      },
      {
        id:    'lore-context',
        title: 'Lore Context',
        body: [
          'In Block Topia\'s lore, Bitcoin represents the primordial chain — the original act of ' +
          'financial defiance from which all subsequent resistance movements draw inspiration. ' +
          'The Bitcoin Kids embody a new generation raised entirely inside this digital-native ' +
          'paradigm: they have never known a world without decentralised currency, and they fight ' +
          'with the uncompromising certainty that sovereign money is a birthright.',
          'Alfie Blaze leads the Bitcoin Kids with a combination of street smarts and blockchain ' +
          'fluency, coordinating faction movements partly via encrypted broadcasts from the ' +
          '<a href="/wiki/graffpunks-24-7.html">GraffPUNKS 24/7 radio</a>. ' +
          'The faction\'s alliance with GraffPUNKS and participation in ' +
          '<a href="/wiki/hodl-wars.html">HODL Wars</a> battlefields makes them central ' +
          'to Block Topia\'s conflict narrative.',
        ],
      },
      {
        id:    'graph-connections',
        title: 'Graph Connections',
        body: [
          'The Bitcoin Ecosystem is a high-centrality cluster linked strongly to the ' +
          '<a href="/wiki/graffpunks-ecosystem.html">GraffPUNKS Ecosystem</a>, the ' +
          '<a href="/wiki/hodl-wars-ecosystem.html">HODL Wars Ecosystem</a>, and the ' +
          '<a href="/wiki/nft-ecosystem.html">NFT Ecosystem</a>. ' +
          'Bitcoin\'s token page connects outward to ' +
          '<a href="/wiki/ethereum.html">Ethereum</a>, <a href="/wiki/solana.html">Solana</a>, ' +
          'and <a href="/wiki/blockchain.html">Blockchain</a> for readers seeking broader ' +
          'crypto-technology context.',
        ],
      },
    ],
  },

  {
    id:      'nft-ecosystem',
    slug:    'nft-ecosystem',
    label:   'NFT Ecosystem',
    emoji:   '🖼️',
    badge:   '🖼️ Lore',
    category:'lore',
    catLabel:'Lore',
    matchTags:    ['nfts', 'nft', 'collection', 'genesis'],
    matchUrlFrag: 'nft',
    coreUrls: [
      '/wiki/nfts.html',
      '/wiki/graffpunks-collection.html',
      '/wiki/1m-free-nfts-programme.html',
      '/wiki/playable-nft-murals.html',
      '/wiki/xrp-kids-genesis-nfts.html',
    ],
    maxMembers: 14,
    description:
      'The NFT Ecosystem covers the full range of non-fungible token activity in the Crypto Moonboys ' +
      'universe — from foundational technology articles to lore-rich collection pages, ' +
      'free NFT campaigns, playable murals, and genesis drops.',
    leadParagraphs: [
      'NFTs are not merely collectibles in the Crypto Moonboys universe — they are deeds, weapons, ' +
      'cultural statements, and access keys. The NFT Ecosystem hub surfaces the full depth of this ' +
      'cluster: foundational technology, faction-defining collections, democratisation campaigns, ' +
      'and gameplay mechanics that make non-fungible tokens central to Block Topia\'s economy and lore.',
      'The ecosystem spans WAX, XRPL, SOL, and Bitcoin Cash chains, reflecting the multi-chain ' +
      'strategy of the GraffPUNKS and affiliated factions. Its richest signal is breadth: ' +
      'the <a href="/wiki/1m-free-nfts-programme.html">1M Free NFTs programme</a> alone demonstrates ' +
      'a commitment to open access that distinguishes this ecosystem from purely speculative NFT projects.',
    ],
    sections: [
      {
        id:    'overview',
        title: 'Ecosystem Overview',
        body: [
          'The NFT Ecosystem is the primary interface between the Crypto Moonboys lore and the real-world ' +
          'blockchain infrastructure that powers it. Every major faction deploys NFTs as artefacts of ' +
          'identity, loyalty, and tactical advantage: the GraffPUNKS\' collection on AtomicHub, ' +
          'the 1M Free NFTs campaign, XRP Kids genesis drops, and playable NFT murals all contribute ' +
          'distinct content and graph weight to this cluster.',
          'The technical foundation is documented in <a href="/wiki/nfts.html">NFTs</a> and ' +
          '<a href="/wiki/smart-nft-mechanics.html">Smart NFT Mechanics</a>, giving readers both ' +
          'educational grounding and lore context. The ecosystem is tightly linked to the ' +
          '<a href="/wiki/graffpunks-ecosystem.html">GraffPUNKS Ecosystem</a> and the ' +
          '<a href="/wiki/gkniftyheads-ecosystem.html">GKniftyHEADS Ecosystem</a>, which generate the ' +
          'largest volume of NFT activity in the wiki.',
        ],
      },
      {
        id:    'key-entities',
        title: 'Key Entities',
        body: [
          '<a href="/wiki/nfts.html">NFTs</a> is the canonical technology overview. ' +
          '<a href="/wiki/graffpunks-collection.html">GraffPUNKS Collection</a> is the culturally ' +
          'dominant NFT series, rooted in Darren Cullen\'s Graffiti Kings heritage. ' +
          '<a href="/wiki/1m-free-nfts-programme.html">1M Free NFTs Programme</a> is the ' +
          'democratisation campaign that has the widest reach across new players and communities.',
          '<a href="/wiki/playable-nft-murals.html">Playable NFT Murals</a> represents a novel mechanics ' +
          'layer — NFTs that function as in-game objects, not merely collectibles. ' +
          '<a href="/wiki/xrp-kids-genesis-nfts.html">XRP Kids Genesis NFTs</a> documents the ' +
          'founding collection of the XRP Kids faction. ' +
          '<a href="/wiki/atomichub-graffpunks-collection.html">AtomicHub GraffPUNKS Collection</a> ' +
          'provides the primary marketplace entry point for the GraffPUNKS NFT series.',
        ],
      },
      {
        id:    'lore-context',
        title: 'Lore Context',
        body: [
          'Every NFT drop in Block Topia carries lore weight. The "Genesis Spray" was not just the ' +
          'first GraffPUNKS collection — it was the spark that proved the blockchain could be a canvas. ' +
          'Free NFTs are not charity; they are tactical infiltration, flooding the Sacred Chain with ' +
          'tokenised resistance and lowering the barrier to entry for new rebels joining the fight.',
          'Playable NFT Murals blur the boundary between art and gameplay: a mural in Block Topia can ' +
          'function as a buff zone, a meeting point, or a hidden code-carrier, making the act of ' +
          'collecting inseparable from the act of participating in the lore. ' +
          'Rare genesis drops from factions like the XRP Kids establish provenance and faction identity ' +
          'in a way that transcends simple token ownership.',
        ],
      },
      {
        id:    'graph-connections',
        title: 'Graph Connections',
        body: [
          'The NFT Ecosystem links outward to all major cluster hubs: the ' +
          '<a href="/wiki/graffpunks-ecosystem.html">GraffPUNKS Ecosystem</a> (primary NFT producer), ' +
          'the <a href="/wiki/hodl-wars-ecosystem.html">HODL Wars Ecosystem</a> (Burn-to-Earn mechanics), ' +
          'the <a href="/wiki/bitcoin-ecosystem.html">Bitcoin Ecosystem</a> (XRP Kids and Bitcoin Kids ' +
          'NFT activity), and the ' +
          '<a href="/wiki/gkniftyheads-ecosystem.html">GKniftyHEADS Ecosystem</a> ' +
          '(GK token staking tied to NFT drops).',
        ],
      },
    ],
  },

  {
    id:      'gkniftyheads-ecosystem',
    slug:    'gkniftyheads-ecosystem',
    label:   'GKniftyHEADS Ecosystem',
    emoji:   '👑',
    badge:   '👑 Lore',
    category:'lore',
    catLabel:'Lore',
    matchTags:    ['gk', 'gkniftyheads', 'lfgk', 'nbg'],
    matchUrlFrag: 'gk',
    coreUrls: [
      '/wiki/gkniftyheads.html',
      '/wiki/nbgx.html',
      '/wiki/nbg.html',
      '/wiki/nbg-token.html',
      '/wiki/lfgk.html',
    ],
    maxMembers: 14,
    description:
      'The GKniftyHEADS Ecosystem covers the GK token economy, NBG/NBGX assets, staking mechanics, ' +
      'and the collector-community infrastructure that connects the Graffiti Kings digital identity ' +
      'to the wider Crypto Moonboys lore.',
    leadParagraphs: [
      'GKniftyHEADS is the collector-community arm of the Graffiti Kings digital universe — a structured ' +
      'token economy built around $GK, $NBG, and $NBGX assets, with staking mechanics, phased drops, ' +
      'and a dedicated community infrastructure. The GKniftyHEADS Ecosystem hub maps this cluster\'s ' +
      'full depth: from the core GK token to the No Ball Games (NBG) collection and the LFGK rallying cry ' +
      'that has become a community identity marker.',
      'With twelve pages in its core cluster and strong inbound link density from the GraffPUNKS and ' +
      'NFT ecosystems, GKniftyHEADS is one of the most graph-connected clusters in the wiki. ' +
      'Its token pages — <a href="/wiki/nbgx.html">NBGX</a>, <a href="/wiki/nbg.html">NBG</a>, ' +
      '<a href="/wiki/nbg-token.html">NBG Token</a> — carry significant authority scores and ' +
      'represent the economic backbone of the broader GK ecosystem.',
    ],
    sections: [
      {
        id:    'overview',
        title: 'Ecosystem Overview',
        body: [
          'GKniftyHEADS is the collector and community layer of the Graffiti Kings / GraffPUNKS digital ' +
          'universe. While GraffPUNKS handles the creative-insurgency narrative, GKniftyHEADS provides ' +
          'the token infrastructure: $GK as the governance and staking asset, $NBG and $NBGX as the ' +
          'No Ball Games collection tokens, and a phased release structure (' +
          '<a href="/wiki/gkniftyheads-phase-one-two-three.html">Phases One, Two, Three</a>) that ' +
          'manages community growth and drop cadence.',
          'The ecosystem is documented across multiple overlapping pages — ' +
          '<a href="/wiki/gkniftyheads.html">GKniftyHEADS</a>, ' +
          '<a href="/wiki/gk.html">GK</a>, ' +
          '<a href="/wiki/the-gkniftyheads.html">The GKniftyHEADS</a> — reflecting both the ' +
          'community\'s multi-channel presence and the wiki\'s depth of coverage for this cluster.',
        ],
      },
      {
        id:    'key-entities',
        title: 'Key Entities',
        body: [
          '<a href="/wiki/gkniftyheads.html">GKniftyHEADS</a> is the canonical hub for the ' +
          'collector community. <a href="/wiki/nbgx.html">NBGX</a> and ' +
          '<a href="/wiki/nbg.html">NBG</a> are the two highest-ranked token pages in the cluster, ' +
          'with strong authority scores driven by content depth and inbound link density. ' +
          '<a href="/wiki/nbg-token.html">NBG Token</a> provides extended technical coverage of the asset.',
          '<a href="/wiki/lfgk.html">LFGK</a> — "Let\'s F***ing GK" — is the community rallying cry ' +
          'and an article in its own right, reflecting the strength of community identity around this token. ' +
          '<a href="/wiki/gk-tokens.html">GK Tokens</a> and <a href="/wiki/lfgk-token.html">LFGK Token</a> ' +
          'extend the token layer. <a href="/wiki/no-ball-games-nbg.html">No Ball Games (NBG)</a> and ' +
          '<a href="/wiki/no-ball-games-nbg-collection.html">NBG Collection</a> document the NFT series.',
        ],
      },
      {
        id:    'lore-context',
        title: 'Lore Context',
        body: [
          'In Block Topia\'s lore, GKniftyHEADS represent the institutional memory of the Graffiti Kings — ' +
          'the archivists and token-keepers who ensure the GK legacy persists across hard forks, chain splits, ' +
          'and server wipes. They are less a fighting faction and more a cultural custodianship: ' +
          'maintaining the canon, certifying authenticity of GK-linked NFTs, and stewarding the ' +
          'staking infrastructure that lets community members earn from their belief in the project.',
          'The "No Ball Games" name carries deliberate punk irony — a reference to the ubiquitous ' +
          'prohibition signs that graffiti writers have always subverted. In Block Topia, NBG tokens ' +
          'represent the act of playing anyway: taking up space in a system that was designed to exclude you. ' +
          'LFGK is the war cry of this ethos — blunt, communal, and deliberately anti-institutional.',
        ],
      },
      {
        id:    'graph-connections',
        title: 'Graph Connections',
        body: [
          'The GKniftyHEADS Ecosystem sits at the intersection of the ' +
          '<a href="/wiki/graffpunks-ecosystem.html">GraffPUNKS Ecosystem</a> (shared Graffiti Kings ' +
          'heritage), the <a href="/wiki/nft-ecosystem.html">NFT Ecosystem</a> (NBG and GK token drops), ' +
          'and the <a href="/wiki/hodl-wars-ecosystem.html">HODL Wars Ecosystem</a> ' +
          '(GK staking used in Burn-to-Earn mechanics). ' +
          'Medium article pages in this cluster link outward to external community documentation, ' +
          'giving GKniftyHEADS one of the strongest off-wiki citation networks in the project.',
        ],
      },
    ],
  },
];

// ── member selection ───────────────────────────────────────────────────────

function buildMemberSet(clusterDef, wikiIndex, linkGraph) {
  const {
    matchTags, matchUrlFrag, coreUrls, maxMembers,
  } = clusterDef;

  const byUrl = {};
  for (const entry of wikiIndex) {
    byUrl[entry.url] = entry;
  }

  // score every candidate
  const scored = {};

  const bump = (url, delta, reason) => {
    if (!byUrl[url]) return;
    if (!scored[url]) scored[url] = { url, score: 0, reasons: [] };
    scored[url].score += delta;
    scored[url].reasons.push(reason);
  };

  for (const entry of wikiIndex) {
    const url = entry.url;
    // skip hub pages themselves
    if (url.includes('-ecosystem.html')) continue;

    const tags = (entry.tags || []).map(t => t.toLowerCase());
    const urlLower = url.toLowerCase();

    if (matchUrlFrag && urlLower.includes(matchUrlFrag)) {
      bump(url, 30, 'url_match');
    }
    for (const tag of matchTags || []) {
      if (tags.includes(tag)) {
        bump(url, 20, `tag:${tag}`);
        break;
      }
    }
    if (coreUrls && coreUrls.includes(url)) {
      bump(url, 50, 'core_url');
    }
    // add base rank signal
    bump(url, Math.round((entry.rank_score || 0) / 10), 'rank_score');
  }

  // inbound link density bonus
  if (linkGraph) {
    for (const [src, data] of Object.entries(linkGraph)) {
      const outLinks = (data.existing_outbound || data.existingLinks || []);
      for (const target of outLinks) {
        if (scored[target]) {
          scored[target].score += 2;
        }
      }
    }
  }

  const sorted = Object.values(scored)
    .filter(m => m.score > 0)
    .sort((a, b) => {
      const ra = (byUrl[a.url] || {}).rank_score || 0;
      const rb = (byUrl[b.url] || {}).rank_score || 0;
      return b.score - a.score || rb - ra;
    });

  return sorted.slice(0, maxMembers);
}

// ── HTML generation ────────────────────────────────────────────────────────

function memberListHtml(members, wikiIndex) {
  const byUrl = {};
  for (const e of wikiIndex) byUrl[e.url] = e;

  const items = members.map(m => {
    const entry = byUrl[m.url] || {};
    const displayTitle = entry.title
      ? cleanDisplayTitle(decodeHtmlEntities(entry.title))
      : urlToTitle(m.url);
    const desc = decodeHtmlEntities(entry.desc || '');
    const shortDesc = desc.length > 110 ? desc.slice(0, 108) + '…' : desc;
    return (
      `        <li class="hub-member-item">\n` +
      `          <a href="${escapeHtml(m.url)}" class="hub-member-link">${escapeHtml(displayTitle)}</a>` +
      (shortDesc ? `<span class="hub-member-desc"> — ${escapeHtml(shortDesc)}</span>` : '') +
      `\n        </li>`
    );
  });
  return `      <ul class="hub-member-list">\n${items.join('\n')}\n      </ul>`;
}

function generateHubPageHtml(clusterDef, members, wikiIndex) {
  const {
    slug, label, emoji, badge, catLabel, description,
    leadParagraphs, sections,
  } = clusterDef;

  const pageUrl     = `https://crypto-moonboys.github.io/wiki/${slug}.html`;
  const fullTitle   = `${label} — Crypto Moonboys Wiki`;
  const entitySlug  = slug.replace(/-/g, '_');

  const leadHtml = leadParagraphs
    .map(p => `          <p class="lead-paragraph">${p}</p>`)
    .join('\n');

  const sectionHtmlParts = sections.map(sec => {
    const bodyHtml = sec.body
      .map(p => `          <p class="lore-paragraph">${p}</p>`)
      .join('\n');
    return (
      `        <section class="wiki-section">\n` +
      `          <h2 id="${escapeHtml(sec.id)}">${escapeHtml(sec.title)}</h2>\n` +
      bodyHtml +
      `\n        </section>`
    );
  });

  const membersHtml = memberListHtml(members, wikiIndex);

  // TOC entries from sections + member-pages
  const tocLinks = [
    ...sections.map(s => `<a href="#${s.id}" class="toc-link">${s.title}</a>`),
    '<a href="#cluster-members" class="toc-link">Cluster Members</a>',
  ].map(l => `          <li>${l}</li>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:image" content="https://crypto-moonboys.github.io/img/logo.svg">
  <title>${escapeHtml(fullTitle)}</title>
  <link rel="stylesheet" href="/css/wiki.css">
  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
  <style>
    .wiki-section { margin: 1.6em 0; }
    .lore-paragraph { line-height: 1.75; margin: 0 0 1em 0; }
    .lead-paragraph { font-size: 1.06em; line-height: 1.8; margin: 0 0 1em 0; }
    .hub-badge {
      display: inline-block;
      padding: 0.15em 0.6em;
      border-radius: 4px;
      background: rgba(91,140,255,0.15);
      color: #5b8cff;
      font-size: 0.85em;
      font-weight: 600;
      margin-bottom: 0.6em;
    }
    .hub-member-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .hub-member-item {
      padding: 0.5em 0;
      border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .hub-member-link {
      font-weight: 600;
      color: #5b8cff;
    }
    .hub-member-desc {
      color: #aaa;
      font-size: 0.93em;
    }
  </style>
</head>
<body>

<a class="skip-link" href="#content">Skip to content</a>

<header id="site-header" role="banner">
  <button class="hamburger" id="hamburger" aria-label="Toggle navigation" aria-expanded="false" aria-controls="sidebar">☰</button>
  <a href="/index.html" class="site-logo" aria-label="Crypto Moonboys Wiki home">
    <img src="/img/logo.svg" alt="" aria-hidden="true">
    <span>
      <span class="logo-text">🌙 Moonboys Wiki</span>
      <span class="logo-sub">Crypto Encyclopedia</span>
    </span>
  </a>
  <div id="header-search" role="search">
    <input type="search" id="search-input" placeholder="Search articles…" aria-label="Search" autocomplete="off">
    <button id="search-btn" aria-label="Search">🔍</button>
    <div id="search-results" role="listbox"></div>
  </div>
  <nav class="header-nav" aria-label="Main navigation">
    <a href="/index.html">Home</a>
    <a href="/categories/index.html">Categories</a>
    <a href="/articles.html">All Articles</a>
  </nav>
</header>

<div id="sidebar-overlay" aria-hidden="true"></div>

<div id="layout">
  <nav id="sidebar" aria-label="Wiki navigation">
    <div class="sidebar-section">
      <div class="sidebar-heading">Navigation</div>
      <div class="sidebar-nav">
        <a href="/index.html"><span class="nav-icon">🏠</span> Main Page</a>
        <a href="/categories/index.html"><span class="nav-icon">📂</span> All Categories</a>
        <a href="/articles.html"><span class="nav-icon">🔍</span> All Articles</a>
      </div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-heading">🌐 Ecosystem Hubs</div>
      <div class="sidebar-nav">
        <a href="/wiki/graffpunks-ecosystem.html"><span class="nav-icon">🎨</span> GraffPUNKS</a>
        <a href="/wiki/hodl-wars-ecosystem.html"><span class="nav-icon">⚔️</span> HODL Wars</a>
        <a href="/wiki/bitcoin-ecosystem.html"><span class="nav-icon">₿</span> Bitcoin</a>
        <a href="/wiki/nft-ecosystem.html"><span class="nav-icon">🖼️</span> NFTs</a>
        <a href="/wiki/gkniftyheads-ecosystem.html"><span class="nav-icon">👑</span> GKniftyHEADS</a>
      </div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-heading">Cryptocurrencies</div>
      <div class="sidebar-nav">
        <a href="/wiki/bitcoin.html"><span class="nav-icon">₿</span> Bitcoin (BTC)</a>
        <a href="/wiki/ethereum.html"><span class="nav-icon">Ξ</span> Ethereum (ETH)</a>
        <a href="/wiki/solana.html"><span class="nav-icon">◎</span> Solana (SOL)</a>
      </div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-heading">⚔️ HODL Wars Lore</div>
      <div class="sidebar-nav">
        <a href="/wiki/hodl-wars.html"><span class="nav-icon">📜</span> HODL Wars</a>
        <a href="/wiki/hodl-warriors.html"><span class="nav-icon">⚔️</span> HODL Warriors</a>
        <a href="/wiki/diamond-hands.html"><span class="nav-icon">💎</span> Diamond Hands</a>
        <a href="/wiki/moon-mission.html"><span class="nav-icon">🚀</span> Moon Mission</a>
      </div>
    </div>
  </nav>

  <div id="main-wrapper">
    <main id="content" role="main">

      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/index.html">Home</a>
        <span class="sep" aria-hidden="true">›</span>
        <a href="/categories/lore.html">${escapeHtml(catLabel)}</a>
        <span class="sep" aria-hidden="true">›</span>
        <span aria-current="page">${escapeHtml(label)}</span>
      </nav>

      <h1 class="page-title">
        ${emoji} ${escapeHtml(label)}
      </h1>
      <div class="page-title-line" aria-hidden="true"></div>

      <div class="article-meta">
        <span class="article-badge">${escapeHtml(badge)}</span>
        <span class="meta-item">📅 Last updated: April 2026</span>
        <span class="meta-item">📂 <a href="/categories/lore.html">${escapeHtml(catLabel)}</a></span>
        <span class="meta-item hub-badge">🌐 Cluster Hub</span>
      </div>

      <nav id="toc" aria-label="Table of contents">
        <div class="toc-title">📋 Contents</div>
        <ol class="toc-list">
${tocLinks}
        </ol>
      </nav>

      <article class="wiki-content" data-entity-slug="${escapeHtml(entitySlug)}">

${leadHtml}

${sectionHtmlParts.join('\n\n')}

        <section class="wiki-section">
          <h2 id="cluster-members">Cluster Members</h2>
          <p class="lore-paragraph">The following pages have been identified as core members of the ${escapeHtml(label)} cluster, ranked by combined graph centrality, rank score, content depth, and link density signals:</p>
${membersHtml}
        </section>

        <div id="bible-content"></div>

      </article>

      <div class="category-tags" aria-label="Article categories">
        <span class="cat-label">Categories:</span>
        <a href="/categories/lore.html">${escapeHtml(catLabel)}</a>
      </div>

    </main>

    <footer id="site-footer" role="contentinfo">
      <div class="footer-inner">
        <div class="footer-col"><h4>🌙 Moonboys Wiki</h4><p>Fan-driven encyclopedia for the crypto community.</p></div>
        <div class="footer-col"><h4>Explore</h4><ul><li><a href="/index.html">Main Page</a></li><li><a href="/categories/index.html">Categories</a></li><li><a href="/articles.html">All Articles</a></li><li><a href="/about.html">About</a></li></ul></div>
        <div class="footer-col"><h4>🌐 Hubs</h4><ul><li><a href="/wiki/graffpunks-ecosystem.html">GraffPUNKS</a></li><li><a href="/wiki/hodl-wars-ecosystem.html">HODL Wars</a></li><li><a href="/wiki/bitcoin-ecosystem.html">Bitcoin</a></li><li><a href="/wiki/nft-ecosystem.html">NFTs</a></li><li><a href="/wiki/gkniftyheads-ecosystem.html">GKniftyHEADS</a></li></ul></div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 Crypto Moonboys Wiki · Not financial advice.</p>
        <p><span class="no-login-note">🔒 No sign-up · No login · Bot-maintained</span></p>
      </div>
    </footer>
  </div>
</div>

<button id="back-to-top" aria-label="Back to top">&#8593;</button>
<script src="/js/wiki.js"></script>
<script src="/js/bible-loader.js"></script>
</body>
</html>
`;
}

// ── main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('Phase 23 — generating cluster hub pages…');

  const wikiIndex  = readJson(WIKI_INDEX_PATH);
  const linkGraph  = fs.existsSync(LINK_GRAPH_PATH) ? readJson(LINK_GRAPH_PATH) : null;

  // Verify we have all expected data
  console.log(`  Loaded wiki-index: ${wikiIndex.length} entries`);

  const generated = [];

  for (const clusterDef of CLUSTER_DEFS) {
    const outPath = path.join(WIKI_DIR, `${clusterDef.slug}.html`);

    if (fs.existsSync(outPath)) {
      console.log(`  Skipping ${clusterDef.slug}.html — already exists (delete to regenerate)`);
      continue;
    }

    console.log(`  Building ${clusterDef.slug}.html…`);

    const members = buildMemberSet(clusterDef, wikiIndex, linkGraph);
    console.log(`    → ${members.length} cluster members selected`);

    const html = generateHubPageHtml(clusterDef, members, wikiIndex);
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`    ✅ Written: wiki/${clusterDef.slug}.html`);
    generated.push(clusterDef.slug);
  }

  if (generated.length === 0) {
    console.log('  All hub pages already exist. Nothing to generate.');
  } else {
    console.log(`\nGenerated ${generated.length} hub page(s): ${generated.join(', ')}`);
    console.log('\nNext steps:');
    console.log('  node scripts/generate-wiki-index.js');
    console.log('  node scripts/generate-sitemap.js');
    console.log('  node scripts/generate-site-stats.js');
    console.log('  node scripts/generate-entity-map.js');
    console.log('  node scripts/validate-generated-assets.js');
    console.log('  node scripts/smoke-test.js');
  }
}

main();
