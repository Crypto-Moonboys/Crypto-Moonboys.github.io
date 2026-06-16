/**
 * Canonical WaxOnEdge featured-token allowlist.
 *
 * Each entry is matched by exact normalized contract::symbol key.
 */
(function () {
  'use strict';

  function normalizeSymbol(value) {
    return String(value || '').trim().toUpperCase();
  }

  function normalizeContract(value) {
    return String(value || '').trim().toLowerCase();
  }

  function tokenKey(contract, symbol) {
    var c = normalizeContract(contract);
    var s = normalizeSymbol(symbol);
    return c && s ? c + '::' + s : '';
  }

  window.WAXONEDGE_FEATURED_TOKENS = [
    ['WAXP', 'eosio.token', 'WAX'], ['WAXCASH', 'graffitiking', 'WAXCASH'], ['NBG', 'gkniftyheads', 'NBG'],
    ['KING', 'alpha.waxfun', 'KING'], ['WAXUSDC', 'eth.token', 'WAXUSDC'], ['DUMPIT', 'kingsofgraff', 'DUMPIT'],
    ['KEK', 'waxpepetoken', 'KEK'], ['PXJ', 'pixeljourney', 'PXJ'], ['WUF', 'wuffi', 'WUF'],
    ['JUAN', 'theonlyjuans', 'JUAN'], ['MOONBOY', 'gkniftyheads', 'MOONBOY'], ['USDT', 'usdt.alcor', 'USDT'],
    ['HITCOIN', 'gkniftyheads', 'HITCOIN'], ['PUNK', 'gkniftyheads', 'PUNK'], ['WAXGOD', 'gkniftyheads', 'WAXGOD'],
    ['CHEESE', 'cheeseburger', 'CHEESE'], ['LFGK', 'kingsofgraff', 'LFGK'], ['WIENR', 'token.wienr', 'WIENR'],
    ['NFTV', 'token.nftg', 'NFTV'], ['WAXUSDT', 'eth.token', 'WAXUSDT'], ['BLUWHL', 'bluemobwally', 'BLUWHL'],
    ['HERB', 'naturestoken', 'HERB'], ['SSN', 'metatoken.gm', 'SSN'], ['NIFTY', 'gkniftyheads', 'NIFTY'],
    ['FED', 'supergrinch1', 'FED'], ['ROOK', 'pixilminirpg', 'ROOK'], ['WAXWETH', 'eth.token', 'WAXWETH'],
    ['WAXWBTC', 'eth.token', 'WAXWBTC'], ['SHING', 't.taco', 'SHING'], ['STAKE', 'kingsofgraff', 'STAKE'],
    ['RODC', 'redmobwallet', 'RODC'], ['AIGOD', 'aigodtokenwx', 'AIGOD'], ['TACO', 't.taco', 'TACO'],
    ['DEAL', 'dealwithitwx', 'DEAL'], ['WAXDAO', 'token.waxdao', 'WAXDAO'], ['TRASH', 'cleanuptoken', 'TRASH'],
    ['WOMBEE', 'yellowmobbee', 'WOMBEE'], ['WURST', 'supergrinch1', 'WURST'], ['MARTIA', 'martia', 'MARTIA'],
    ['YEET', 'token.yeet', 'YEET'], ['PURR', 'token.yeet', 'PURR'], ['LSWAX', 'token.fusion', 'LSWAX'],
    ['LSW', 'lsw.alcor', 'LSW'], ['DUST', 'niftywizards', 'DUST'], ['NEFTY', 'token.nefty', 'NEFTY'],
    ['PLAI', 't.playmind', 'PLAI'], ['WOMBAT', 'wombattokens', 'WOMBAT'], ['CMX', 'token.mf', 'CMX'],
    ['CHAD', 'chadtoken.gm', 'CHAD'], ['STONKX', 'stonkrewardx', 'STONKX'], ['WPIXAL', 'pixeljourney', 'WPIXAL'],
    ['WHALLY', 'bluemobwally', 'WHALLY'], ['NWO', 'cointreasure', 'NWO'], ['LAMBO', 'rareruggapes', 'LAMBO'],
    ['PUMP', 'rareruggapes', 'PUMP'], ['TLM', 'alien.worlds', 'TLM'], ['AIMR', 'aimr.meromai', 'AIMR'],
    ['BBCHAD', 'chadtoken.gm', 'BBCHAD'], ['BEATZ', 'maestrobeatz', 'BEATZ'], ['GOLDXXX', 'alcorammswap', 'GOLDXXX'],
    ['TOMATOE', 'maestrobeatz', 'TOMATOE'], ['ACK', 'marstokensgo', 'ACK'], ['TOOLS', 'stonkrewardx', 'TOOLS'],
    ['BUZZ', 'buzzingarden', 'BUZZ'], ['ANON', 'anoncoin.gm', 'ANON'], ['MINTY', 'token.minty', 'MINTY'],
    ['DUSTDAO', 'dao.dust', 'DUSTDAO'], ['BANANAZ', 'maestrobeatz', 'BANANAZ'],
  ].map(function (entry) {
    return {
      label: normalizeSymbol(entry[0]),
      contract: normalizeContract(entry[1]),
      symbol: normalizeSymbol(entry[2]),
      key: tokenKey(entry[1], entry[2]),
    };
  });
}());
