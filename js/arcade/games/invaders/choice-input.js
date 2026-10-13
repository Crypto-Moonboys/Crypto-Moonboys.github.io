// The same directional/fire keys work on physical keyboards and touch pads.
export function navigateChoice(key, cursor, count) {
  if (!count) return { cursor:0, confirmIndex:undefined };
  if (['ArrowLeft','a','A'].includes(key)) return { cursor:(cursor+count-1)%count, confirmIndex:undefined };
  if (['ArrowRight','d','D'].includes(key)) return { cursor:(cursor+1)%count, confirmIndex:undefined };
  const digit = /^[1-3]$/.test(key) ? Number(key)-1 : undefined;
  const confirmIndex = [' ','Enter'].includes(key) ? cursor : digit;
  return { cursor:confirmIndex < count ? confirmIndex : cursor, confirmIndex:confirmIndex < count ? confirmIndex : undefined };
}
