# Migration Scripts

This directory is reserved for one-off and staged data migrations.

Current planned sequence for the `users` split:

1. `20260516_users_split_audit.mjs`
   - read-only inventory and collision report
2. `20260516_users_split_backfill.mjs`
   - create and backfill split collections
3. `20260516_users_split_verify.mjs`
   - compare counts and spot-check canonical records

Do not run write migrations against production until identity collisions are resolved:
- duplicate `auth_uid`
- duplicate `phone`
- conflicting canonical user selection
