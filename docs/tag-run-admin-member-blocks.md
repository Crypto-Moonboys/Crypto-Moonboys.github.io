# TAG RUN admin member blocks

Authorised bot admins can block or unblock a known Telegram member by sending a
private message to WIKICOMSBOT:

```text
/block @username
/unblock @username
```

Usernames are matched case-insensitively, then stored against Telegram's
immutable numeric user ID. A member must have been seen by the bot (or already
exist in `telegram_users`) before the username can be resolved. Ambiguous or
unknown usernames fail closed and change nothing.

An active block:

- stops new TAG RUN Street Cred;
- hides the member from TAG RUN leaderboards and unsent rank announcements;
- excludes all current and historical participation from future Community Pot
  draws;
- prevents unreserved reward bundles from being reserved for that member.

Existing scores, message receipts and audit records are retained. A WAX transfer
that was already reserved, submitted or broadcast before the block is not
reversed. Unblocking restores future scoring and future reward eligibility; it
does not rewrite history.

Admins listed in `ADMIN_TELEGRAM_IDS` cannot be blocked.

## Release order

1. Back up production D1.
2. Apply `110_tag_run_admin_member_blocks.sql`.
3. Deploy the Worker.
4. Test from an authorised private bot chat.
