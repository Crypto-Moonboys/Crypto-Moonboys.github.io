const errorMessages = {
  connect_telegram: 'Connect Telegram to interact with faction leaders.',
  join_faction: 'Join a faction in Battle Chamber to interact with a rival leader.',
  rival_required: 'Choose a leader from a rival faction.',
  daily_question_used: 'You’ve used your free question today. It resets at midnight UTC.',
  insufficient_balance: 'Your Block Topia balance is too low for this slowdown.',
  leader_unavailable: 'This leader is already paused or recovering.',
  leader_play_closed: 'Leader interactions are currently closed.',
};

export async function getClanLeaderBoard() {
  const api = window.MOONBOYS_API?.getApiBase?.({ mode: 'write' });
  if (!api) return null;
  const response = await fetch(api + '/clan-operations/state?view=crew-progress&leaders=1', {
    credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('leader_board_unavailable');
  return (await response.json()).leaders ?? null;
}

export async function sendClanLeaderQuestion(npc, question, previous) {
  const gate = window.MOONBOYS_IDENTITY;
  const owner = gate?.getTelegramId?.();
  if (!owner) return { error: 'connect_telegram' };
  try {
    const auth = gate.getFreshTelegramAuth ? await gate.getFreshTelegramAuth() : gate.getSignedTelegramAuth?.();
    if (!auth || gate.getTelegramId() !== owner) return { error: 'connect_telegram' };
    const api = window.MOONBOYS_API.getApiBase({ mode: 'write' });
    const response = await fetch(api + '/clan-operations/leader-lore', {
      method: 'POST', credentials: 'omit', signal: AbortSignal.timeout(35000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_auth: auth, npc, question, previous }),
    });
    const result = await response.json();
    if (gate.getTelegramId() !== owner) return { error: 'connect_telegram' };
    return response.ok && result.ok ? result : { error: result.error };
  } catch {
    return { error: 'leader_lore_unavailable' };
  }
}

export function clanLeaderQuestionError(error) {
  const messages = {
    connect_telegram: 'Connect Telegram in Battle Chamber to ask a question.',
    lore_task_required: 'You’ve used your 10 free questions. Bank a Clan Operation tier today to unlock another.',
    lore_daily_limit: 'You’ve used all your free and task-earned questions for today. They reset at midnight UTC.',
    lore_site_limit: 'The site has used its AI allowance for today. It resets at midnight UTC.',
    rate_limited: 'Too many questions at once. Try again in a minute.',
  };
  return messages[error] ?? 'Lore chat is temporarily unavailable. Try again shortly.';
}

export function clanLeaderSourceLinks(entries) {
  const sources = document.createElement('ul');
  for (const { title, path } of entries ?? []) {
    if (typeof path !== 'string' || !/^\/(?!\/)[\w/.~-]*$/.test(path)) continue;
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = path;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = title;
    item.append(link);
    sources.append(item);
  }
  return sources;
}

function loreChat(target) {
  const section = document.createElement('section');
  section.className = 'clan-leader-lore';
  section.innerHTML = `
    <h3>Ask about the Moonboys universe</h3>
    <div role="log" aria-label="Lore conversation"></div>
    <form>
      <label>Question <textarea rows="2" maxlength="600" required></textarea></label>
      <button type="submit">Ask the leader</button>
      <p role="status"></p>
    </form>`;
  const transcript = section.querySelector('[role=log]');
  const form = section.querySelector('form');
  const input = form.querySelector('textarea');
  const button = form.querySelector('button');
  const status = form.querySelector('[role=status]');
  const previous = [];
  const gate = window.MOONBOYS_IDENTITY;
  if (!gate?.getTelegramId?.()) {
    status.textContent = 'Connect Telegram in Battle Chamber to start a lore chat.';
    input.disabled = button.disabled = true;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || button.disabled) return;
    input.disabled = button.disabled = true;
    status.textContent = 'Checking the Moonboys sources…';
    const result = await sendClanLeaderQuestion(target, question, previous);
    input.disabled = button.disabled = false;
    if (!result.ok) {
      status.textContent = clanLeaderQuestionError(result.error);
      return;
    }
    const turn = document.createElement('article');
    const prompt = document.createElement('strong');
    prompt.textContent = question;
    const answer = document.createElement('p');
    answer.textContent = result.reply;
    turn.append(prompt, answer);
    if (result.sources?.length) turn.append(clanLeaderSourceLinks(result.sources));
    transcript.append(turn);
    transcript.scrollTop = transcript.scrollHeight;
    previous.push(question);
    if (previous.length > 2) previous.shift();
    input.value = '';
    status.textContent = '';
    if (section.isConnected) input.focus();
  });
  return section;
}

export function mountClanLeaderDialog(parent, onChange) {
  const dialog = document.createElement('dialog');
  dialog.className = 'clan-leader-dialog';
  dialog.setAttribute('aria-labelledby', 'clan-leader-dialog-title');
  dialog.innerHTML = `
    <form method="dialog"><button type="submit" aria-label="Close leader dialog">Close</button></form>
    <h2 id="clan-leader-dialog-title"></h2>
    <p data-leader-state></p>
    <p><a href="/community.html">Open Battle Chamber</a></p>
    <p role="status" data-leader-reply></p>
    <div data-leader-lore></div>
    <section data-leader-options></section>`;
  parent.append(dialog);
  const heading = dialog.querySelector('h2');
  const state = dialog.querySelector('[data-leader-state]');
  const reply = dialog.querySelector('[data-leader-reply]');
  const options = dialog.querySelector('[data-leader-options]');
  const lore = dialog.querySelector('[data-leader-lore]');
  const requests = new Map();
  let current = 0;

  function display(name, leader, controls, chatEnabled) {
    const { faction_id: target, presence } = leader;
    const serial = ++current;
    heading.textContent = name;
    state.textContent = '';
    reply.textContent = '';
    options.replaceChildren();
    lore.replaceChildren(...(chatEnabled ? [loreChat(target)] : []));
    if (!dialog.open) dialog.showModal();
    if (!presence || !controls) {
      if (!chatEnabled) state.textContent = 'Leader interactions are currently closed.';
      return;
    }
    const until = presence.available_at;
    if (until && until * 1000 > Date.now()) {
      const date = new Date(until * 1000).toLocaleString();
      state.textContent = `Available for another interaction at ${date}.`;
      return;
    }
    state.textContent = 'Choose a question or spend Block Topia XP or gems to pause a rival leader.';
    if (!window.MOONBOYS_IDENTITY?.getTelegramId?.()) {
      reply.textContent = errorMessages.connect_telegram;
      return;
    }

    function group(title) {
      const field = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = title;
      field.append(legend);
      options.append(field);
      return field;
    }

    function button(field, offer, text, currency = null) {
      const control = document.createElement('button');
      control.type = 'button';
      control.textContent = text;
      field.append(control);
      control.addEventListener('click', async () => {
        for (const item of options.querySelectorAll('button')) item.disabled = true;
        reply.textContent = 'Contacting leader…';
        const owner = window.MOONBOYS_IDENTITY.getTelegramId();
        const requestKey = [owner, target, offer.id, currency].join(':');
        try {
          const gate = window.MOONBOYS_IDENTITY;
          const auth = gate.getFreshTelegramAuth ? await gate.getFreshTelegramAuth() : gate.getSignedTelegramAuth?.();
          if (!auth || gate.getTelegramId() !== owner) {
            if (serial === current) reply.textContent = errorMessages.connect_telegram;
            return;
          }
          const requestId = requests.get(requestKey) ?? crypto.randomUUID();
          requests.set(requestKey, requestId);
          const api = window.MOONBOYS_API.getApiBase({ mode: 'write' });
          const response = await fetch(api + '/clan-operations/leader-slowdown', {
            method: 'POST', credentials: 'omit', signal: AbortSignal.timeout(12000),
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_auth: auth, target, option: offer.id, currency, request_id: requestId }),
          });
          const result = await response.json();
          if (response.status < 500) requests.delete(requestKey);
          if (serial === current && !result.ok) {
            reply.textContent = errorMessages[result.error] ?? 'Leader unavailable. Try again in a moment.';
          } else if (result.ok) {
            if (serial === current) {
              options.replaceChildren();
              const date = new Date(result.paused_until * 1000).toLocaleString();
              state.textContent = `Leader paused until ${date}.`;
              reply.textContent = result.reply ?? 'Slowdown applied.';
            }
            onChange?.();
          }
        } catch {
          if (serial === current) reply.textContent = 'Connection lost. Choose the same option to check or retry the request.';
        } finally {
          if (serial === current) {
            for (const item of options.querySelectorAll('button')) item.disabled = false;
          }
        }
      });
    }

    const talk = group('Talk · one free question per day');
    for (const question of controls.questions) button(talk, question, `${question.title} · ${question.minutes} min`);
    const spend = group('Paid slowdown');
    for (const offer of controls.paid) {
      button(spend, offer, `${offer.title} · spend ${offer.xp} XP`, 'xp');
      button(spend, offer, `${offer.title} · spend ${offer.gems} gems`, 'gems');
    }
  }
  return display;
}
