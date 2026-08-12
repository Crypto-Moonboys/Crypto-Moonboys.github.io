export function resolvePetCallbackRoute(data, miniAppEnabled) {
  if (!String(data || '').startsWith('pet:')) return 'ignore';
  return miniAppEnabled === true || miniAppEnabled === 'true' ? 'mini_app' : 'legacy';
}
