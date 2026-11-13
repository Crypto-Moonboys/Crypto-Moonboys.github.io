# TAG RUN reward exclusions

Authorised bot admins can exclude or restore a known Telegram member from token
rewards by sending a private message to WIKICOMSBOT:

```text
/block @username
/unblock @username
```

These commands are reward controls only. They do not block anyone from the
Telegram community.

Usernames are matched case-insensitively, then stored against Telegram's
immutable numeric user ID. A member must have been seen by the bot (or already
exist in `telegram_users`) before the username can be resolved. Ambiguous or
unknown usernames fail closed and change nothing.

While reward-blocked, the member:

- continues earning Street Cred;
- remains in ranks and leaderboards;
- continues receiving normal rank announcements;
- continues participating in the community;
- cannot add new Community Pot draw weight or receive a new token reward;
- keeps admin access when the member is also an authorised admin.

An admin may reward-block themselves to avoid a conflict of interest.

Existing scores, message receipts and audit records are retained. Pre-block
unpaid reward weight is paused while the exclusion is active and becomes
eligible again after `/unblock`. Messages sent during an exclusion still earn
Street Cred, but their timestamps are recorded against an immutable exclusion
period and they never become reward weight later.

A WAX transfer already reserved, submitted or broadcast before the block is not
reversed. The payout executor rechecks the current exclusion before reserving or
broadcasting any later reward.

## Release order

1. Back up production D1.
2. Apply `110_tag_run_admin_member_blocks.sql`.
3. Apply `111_tag_run_reward_only_blocks.sql`.
4. Deploy the Worker.
5. In a private authorised bot chat, test `/block @username`, confirm Street
   Cred/ranks/admin commands still work, then test `/unblock @username`.
