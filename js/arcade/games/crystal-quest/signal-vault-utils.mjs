export function normalizeSignalAnswer(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '');
}

export function getAcceptedSignalAnswers(question) {
  var accepted = Array.isArray(question && question.accepted_answers) ? question.accepted_answers : [];
  var aliases = Array.isArray(question && question.aliases) ? question.aliases : [];
  return accepted.concat(aliases).map(normalizeSignalAnswer).filter(Boolean);
}

export function isSignalAnswerCorrect(question, answer) {
  var normalized = normalizeSignalAnswer(answer);
  return !!normalized && getAcceptedSignalAnswers(question).includes(normalized);
}

export function buildSignalAttemptHint(question, attempt) {
  var accepted = (Array.isArray(question && question.accepted_answers) && question.accepted_answers[0])
    || (Array.isArray(question && question.aliases) && question.aliases[0])
    || '';
  var clean = String(accepted).trim();
  var words = clean ? clean.split(/\s+/u).filter(Boolean) : [];
  if (attempt <= 1) {
    return 'Signal mismatch. Soft hint: re-scan the linked lore page and match the exact hidden term.';
  }
  if (attempt === 2) {
    if (words.length > 1) return 'Signal mismatch. Hint unlocked: the answer is ' + words.length + ' words.';
    if (clean) return 'Signal mismatch. Hint unlocked: the answer starts with "' + clean.charAt(0).toUpperCase() + '".';
  }
  return 'Signal mismatch. Strong hint: inspect the page title, clue wording, and accepted lore keyword before decoding again.';
}

export function isCloseSignalAnswerMatch(question, answer) {
  var normalized = normalizeSignalAnswer(answer);
  if (!normalized) return false;
  var accepted = getAcceptedSignalAnswers(question);
  for (var i = 0; i < accepted.length; i++) {
    var target = accepted[i];
    if (!target || target === normalized) continue;
    var delta = Math.abs(target.length - normalized.length);
    var maxDistance = target.length <= 6 ? 1 : 2;
    if (delta > maxDistance) continue;
    if (boundedEditDistance(normalized, target, maxDistance) <= maxDistance) return true;
  }
  return false;
}

function boundedEditDistance(a, b, limit) {
  var previous = [];
  for (var j = 0; j <= b.length; j++) previous[j] = j;

  for (var i = 1; i <= a.length; i++) {
    var current = [i];
    var rowMin = current[0];
    for (var k = 1; k <= b.length; k++) {
      var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
      var value = Math.min(
        previous[k] + 1,
        current[k - 1] + 1,
        previous[k - 1] + cost
      );
      current[k] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}
