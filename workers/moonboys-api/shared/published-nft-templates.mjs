export const NFT_TEMPLATE_SOURCE = /^\/data\/(?:nft-collections\/)?([a-z0-9][a-z0-9-]*)\/(live-template-supply|template-metadata-cache|templates|template-rarity)\.json$/;
export const NFT_TEMPLATE_INDEX = '/data/sparky-nft/';
const BUCKETS = 32;
const DATASETS = ['live-template-supply', 'template-metadata-cache', 'templates', 'template-rarity'];
const TEMPLATE_ID = /^[1-9]\d{0,14}$/;
const SUPPLY = {
  issued: /\b(?:issued|minted|mints?|created)\b/,
  live: /\b(?:live|left|remaining|remain|circulating|circulation|still exist|still around)\b/,
  listed: /\b(?:listed|listings?|for sale)\b/,
  maximum: /\b(?:max(?:imum)?|mint cap|limit|capped)\b/,
};
const INFO = {
  name: /\b(?:name|title|what is|what's|tell me about|show me|details|info(?:rmation)?)\b/,
  rarity: /\b(?:rare|rarity|rank(?:ing)?)\b/,
  traits: /\b(?:traits?|attributes?|variation|schema)\b/,
  price: /\b(?:price|floor|worth|value|cost)\b/,
};
const COLLECTION_NAMES = {
  gkniftyheads: 'GKniftyHEADS',
  hodlmoonboys: 'HODL Moonboys',
  noballgamess: 'No Ball Games',
};
const FOLLOW_UP = [
  /^how many (?:(?:were|are|have been|can be|were ever|are still) (?:issued|minted|live|left|listed|remaining|in circulation)|remain|are for sale|are still around)$/,
  /^(?:what is|what's|what are|what about) (?:its |the )?(?:(?:issued|minted|live|remaining|listed|max(?:imum)?) supply|supply|name|rarity|traits|schema|mint cap|price)$/,
  /^how (?:rare is it|much is it worth)$/,
];

export function templateBucket(id) {
  return Number(id) % BUCKETS;
}

function count(value) {
  if (typeof value === 'string' && /^\d+$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function label(value) {
  if (typeof value !== 'string' && !Number.isFinite(value)) return undefined;
  const plain = String(value).replace(/[<>]/g, '').replace(/[\s*`]+/g, ' ').trim();
  return plain && !/^https?:/i.test(plain) ? plain.slice(0, 140) : undefined;
}

export function readTemplateDataset(body, collection, dataset) {
  const record = JSON.parse(body);
  if (!record || (!Array.isArray(record) && record.collection !== collection)) return [];
  const rows = dataset === 'live-template-supply' ? record.supplies
    : dataset === 'template-rarity'
      ? ['ranked_templates', 'utility_open_mint_templates', 'unissued_templates']
        .flatMap(key => Array.isArray(record[key]) ? record[key] : [])
      : Array.isArray(record) ? record : record.templates;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(row => {
    const id = String(row?.template_id);
    if (!TEMPLATE_ID.test(id) || (Array.isArray(record) && row.collection?.collection_name !== collection)) return [];
    const checked = Date.parse(row.last_checked_at ?? row.live_supply_checked_at ?? record.generated_at);
    const details = {
      id,
      issued: count(row.issued_supply) ?? undefined,
      live: row.live_supply_status === 'ok' ? count(row.live_supply) ?? undefined : undefined,
      listed: row.live_supply_status === 'ok' ? count(row.listed_supply) ?? undefined : undefined,
      maximum: count(row.max_supply) ?? undefined,
      checked: Number.isFinite(checked) ? new Date(checked).toISOString().slice(0, 10) : undefined,
      name: label(row.title ?? row.name ?? row.immutable_data?.name),
      rarity: label(row.band ?? row.rarity_band ?? row.rarity_trait ?? row.immutable_data?.rarity),
      rank: count(row.rank) ?? undefined,
      traits: [label(row.schema_name ?? row.schema?.schema_name ?? row.schema), label(row.rarity_trait ?? row.immutable_data?.rarity),
        label(row.variation_trait ?? row.immutable_data?.variation)].map(value => value ?? null),
    };
    return [details];
  });
}

function plainQuery(text) {
  return text.normalize('NFKC').toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
}

function collectionKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mentionCollection(question, collections) {
  const words = question.replace(/[^a-z0-9]+/g, ' ').split(' ');
  const phrases = new Set(words.flatMap((_, index) =>
    [1, 2, 3, 4].map(length => words.slice(index, index + length).join(''))).filter(Boolean));
  return [...collections].filter(collection => {
    return phrases.has(collectionKey(collection)) || phrases.has(collectionKey(COLLECTION_NAMES[collection] ?? ''));
  });
}

function templateIntent(message, context) {
  const question = plainQuery(message);
  const ids = [...new Set(Array.from(question.matchAll(/\btemplate(?:\s+id)?\s*[:#=]?\s*([1-9]\d{0,14})\b/g), match => match[1]))];
  const shortQuestion = question.replace(/^and\s+/, '').replace(/[?!.]+$/, '').trimEnd();
  const followUp = !ids.length && FOLLOW_UP.some(pattern => pattern.test(shortQuestion));
  const fields = Object.entries({ ...SUPPLY, ...INFO }).filter(([, pattern]) => pattern.test(question)).map(([field]) => field);
  if (fields.length > 1 && fields.includes('name') && !/\b(?:name|title|tell me about|show me|details|info(?:rmation)?)\b/.test(question)) {
    fields.splice(fields.indexOf('name'), 1);
  }
  const genericSupply = /\b(?:supply|how many copies)\b/.test(question) && !fields.some(field => Object.hasOwn(SUPPLY, field));
  if (genericSupply) {
    if (!/\b(?:name|title)\b/.test(question) && fields.includes('name')) fields.splice(fields.indexOf('name'), 1);
    fields.unshift('issued', 'live');
  }
  const bare = /^(?:[a-z0-9 -]{1,45}\s+)?template(?:\s+id)?\s*[:#=]?\s*[1-9]\d{0,14}[?!.]*$/.test(question);
  const composed = /\b(?:write|compare|invent|imagine|generate|plan)\b/.test(question) || /https?:\/\//.test(question);
  if (composed || (!ids.length && !followUp) || (!fields.length && !bare)) return null;
  if (ids.length > 1) return { multiple: true };
  if (followUp && !context && !/\bsupply\b/.test(question)) return null;
  if (followUp && (typeof context?.id !== 'string' || !TEMPLATE_ID.test(context.id) ||
      typeof context.collection !== 'string' || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(context.collection))) return { needsId: true };
  if (!fields.length) fields.push('name', 'issued', 'live');
  const explicit = question.match(/\b(?:for|from|does|of|in) (?:the )?([a-z0-9][a-z0-9 .-]{0,59}?) template\b/)?.[1];
  return {
    question, id: ids[0] ?? context.id, fields, collection: followUp ? context.collection : null,
    namedCollection: explicit && !/^(?:an?|nft|this|that|a nft)$/.test(explicit) ? explicit : null,
  };
}

function findDataset(catalog, collection, dataset) {
  return catalog.get(`/data/${collection}/${dataset}.json`) ?? catalog.get(`/data/nft-collections/${collection}/${dataset}.json`);
}

async function lookupCollection(catalog, read, collection, id) {
  const shard = catalog.get(`${NFT_TEMPLATE_INDEX}${collection}/${templateBucket(id)}.json`);
  if (shard) {
    const data = JSON.parse(await read(shard, catalog));
    if (data?.collection !== collection || !data.templates) throw new Error('nft_index_invalid');
    const entry = Object.hasOwn(data.templates, id) ? data.templates[id] : null;
    return entry ? DATASETS.flatMap(dataset => {
      const route = data.sources?.[dataset];
      const source = typeof route === 'string' && route.match(NFT_TEMPLATE_SOURCE);
      return source && source[1] === collection && source[2] === dataset && entry[dataset]?.id === id
        ? [{ dataset, route, row: entry[dataset] }] : [];
    }) : [];
  }
  if ([...catalog.keys()].some(route => route.startsWith(`${NFT_TEMPLATE_INDEX}${collection}/`))) return [];
  // Support existing published snapshots while the first sharded feed propagates.
  return (await Promise.all(DATASETS.map(async dataset => {
    const source = findDataset(catalog, collection, dataset);
    if (source?.kind !== 'nft') return null;
    const rows = readTemplateDataset(await read(source, catalog), collection, dataset).filter(row => row.id === id);
    return rows.length === 1 ? { dataset, route: source.path, row: rows[0] } : null;
  }))).filter(Boolean);
}

function describeTemplate(records, fields, collection, id, site) {
  const title = COLLECTION_NAMES[collection] ?? collection;
  const lines = [];
  const sources = new Map();
  const missing = [];
  function take(field, candidates = records) {
    const record = candidates.find(({ row }) => row[field] !== undefined);
    if (record) sources.set(record.route, { title: `${title} ${record.dataset === 'live-template-supply' ? 'template supply' : record.dataset === 'template-rarity' ? 'template rarity' : 'template metadata'}`, url: site + record.route });
    return record;
  }
  const supplies = records.filter(({ dataset }) => dataset === 'live-template-supply');
  const counts = [];
  const dates = new Set();
  for (const field of fields) {
    let candidates = records;
    if (field === 'live' || field === 'listed') candidates = supplies;
    if (field === 'traits') candidates = records.filter(({ row }) => row.traits?.some(Boolean));
    if (field === 'rarity') candidates = [...records.filter(row => row.dataset === 'template-rarity'), ...records];
    const record = take(field, candidates);
    if (!record) {
      missing.push(field);
      continue;
    }
    const value = record.row[field];
    if (field === 'issued' || field === 'live' || field === 'listed') {
      counts.push(`${value} ${field}`);
      dates.add(record.row.checked);
    } else if (field === 'maximum') {
      lines.push(value === 0 ? 'Maximum supply: **uncapped**.' : `Maximum supply: **${value}**.`);
    } else if (field === 'traits') {
      const [schema, rarity, variation] = value;
      if (schema) lines.push(`Schema: **${schema}**.`);
      if (rarity) lines.push(`Rarity trait: **${rarity}**.`);
      if (variation) lines.push(`Variation: **${variation}**.`);
    } else if (field === 'rarity') {
      lines.push(`Published rarity: **${value}**${record.row.rank ? ` (rank ${record.row.rank})` : ''}.`);
    } else {
      lines.push(`Template name: **${value}**.`);
    }
  }
  if (counts.length) {
    const [date] = dates;
    const checked = dates.size === 1 && date ? ` (checked ${date} UTC)` : '';
    lines.unshift(`The published supply for ${title} template ${id} is **${counts.join(' and ')}**${checked}.`);
  } else if (lines.length) {
    lines.unshift(`${title} template ${id}`);
  }
  if (!lines.length) return {
    reply: `I couldn’t verify the requested supply or details for ${title} template ${id} in the published records.`,
    sources: [], canon: 'unavailable', template_context: { collection, id },
  };
  if (missing.length) lines.push(`The published record has no verified value for ${missing.join(', ')}.`);
  return { reply: lines.join('\n'), sources: [...sources.values()], canon: 'found', template_context: { collection, id } };
}

export async function answerPublishedTemplateQuestion(message, context, loadCatalog, read, site) {
  const intent = templateIntent(message, context);
  if (!intent) return null;
  const unavailable = reply => ({ reply, sources: [], canon: 'unavailable' });
  if (intent.multiple) return unavailable('Ask about one NFT template at a time so I can verify the details.');
  if (intent.needsId) return unavailable('Which NFT template? Give me the template ID and, if you know it, the collection name.');
  const catalog = await loadCatalog().catch(() => null);
  if (!catalog) return unavailable('The published NFT records are temporarily unavailable.');
  const collections = new Set([...catalog.keys()].flatMap(route => {
    const match = route.match(NFT_TEMPLATE_SOURCE) ?? route.match(/^\/data\/sparky-nft\/([a-z0-9][a-z0-9-]*)\/\d+\.json$/);
    return match ? [match[1]] : [];
  }));
  const named = intent.collection ? [intent.collection] : mentionCollection(intent.question, collections);
  if (!named.length && intent.namedCollection) return unavailable(`I couldn’t verify template ${intent.id} in the named collection’s published records.`);
  if (named.length > 1 || (!named.length && collections.size > 8)) return unavailable(`Include the collection name with template ${intent.id}.`);
  const candidates = named.length ? named : [...collections];
  const matches = await Promise.allSettled(candidates.map(async collection => ({
    collection, records: await lookupCollection(catalog, read, collection, intent.id),
  })));
  if (matches.some(result => result.status === 'rejected')) return unavailable('I couldn’t verify the NFT template against the published records. Try again in a moment.');
  const found = matches.map(result => result.value).filter(result => result.records.length);
  if (found.length > 1) return unavailable(`Template ${intent.id} appears in several collections. Include the collection name and template ID in your next message.`);
  if (!found.length) return unavailable(`I couldn’t verify template ${intent.id} in the published NFT records.`);
  return describeTemplate(found[0].records, intent.fields, found[0].collection, intent.id, site);
}
