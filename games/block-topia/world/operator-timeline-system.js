const MAX_EVENTS = 5;

export function createOperatorTimelineSystem() {
  const events = [];

  function push(event) {
    if (!event) return;
    events.unshift({ at: Date.now(), text: String(event) });
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  }

  function getLine() {
    if (!events.length) return 'No critical events yet';
    return events.slice(0, 3).map((entry) => entry.text).join(' • ');
  }

  return {
    push,
    getLine,
  };
}
