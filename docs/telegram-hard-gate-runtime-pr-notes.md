# PR Notes

This is the runtime follow-up to the canon-alignment merge.

The current code already rejects unlinked score submissions in the shared client, but the wider repository still needs a full fail-closed audit so direct game URLs, local caches, pending queues, guest naming, leaderboard reads, auth expiry, and server writes all enforce one Telegram-linked competition identity contract.
