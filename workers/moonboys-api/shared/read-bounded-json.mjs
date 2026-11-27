export async function readBoundedJson(message, limit) {
  if (!message.body || Number(message.headers.get('Content-Length')) > limit) {
    await message.body?.cancel();
    return null;
  }
  const reader = message.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      size += value.byteLength;
      if (size > limit) return null;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
