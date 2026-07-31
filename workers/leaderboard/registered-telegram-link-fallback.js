function bindMethod(target, property) {
  const value = Reflect.get(target, property, target);
  return typeof value === 'function' ? value.bind(target) : value;
}

/**
 * The leaderboard Worker already verifies the signed Telegram Login payload and
 * then confirms that the same Telegram ID exists in telegram_users. Older
 * accounts may not have a separate link_confirmed activity row or Block Topia
 * progression row yet, which caused their first Arcade score to be rejected.
 *
 * This D1 wrapper only supplies the missing link_confirmed lookup when the same
 * Telegram ID is present in telegram_users. Anti-cheat and signed-auth checks in
 * the base Worker remain unchanged.
 */
export function withRegisteredTelegramLinkFallback(db) {
  if (!db || typeof db.prepare !== 'function') return db;

  return new Proxy(db, {
    get(target, property) {
      if (property !== 'prepare') return bindMethod(target, property);

      return function prepare(sql) {
        const statement = target.prepare(sql);
        const isLinkLookup = /FROM\s+telegram_activity_log/i.test(String(sql || '')) &&
          /action\s*=\s*'link_confirmed'/i.test(String(sql || ''));

        if (!isLinkLookup) return statement;

        return new Proxy(statement, {
          get(statementTarget, statementProperty) {
            if (statementProperty !== 'bind') return bindMethod(statementTarget, statementProperty);

            return function bind(...values) {
              const bound = statementTarget.bind(...values);
              const telegramId = String(values[0] || '').trim();

              return new Proxy(bound, {
                get(boundTarget, boundProperty) {
                  if (boundProperty !== 'first') return bindMethod(boundTarget, boundProperty);

                  return async function first(...args) {
                    const existing = await boundTarget.first(...args).catch(() => null);
                    if (existing || !/^\d{1,20}$/.test(telegramId)) return existing;

                    const user = await target.prepare(
                      `SELECT telegram_id
                       FROM telegram_users
                       WHERE telegram_id = ?
                       LIMIT 1`
                    ).bind(telegramId).first().catch(() => null);

                    return user?.telegram_id
                      ? { action: 'link_confirmed', created_at: null, source: 'registered_telegram_user' }
                      : null;
                  };
                },
              });
            };
          },
        });
      };
    },
  });
}
