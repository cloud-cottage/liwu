# Users Collection Audit And Split Plan

## Purpose

The current `users` collection mixes identity, profile, wallet, student membership, partner-store affiliation, and operational state. This document inventories the current responsibilities, maps them to code dependencies, and proposes a target split that can be rolled out incrementally.

## Current Responsibilities In `users`

### 1. Identity And Login Binding

Fields:
- `uid`
- `auth_uid`
- `phone`
- `email`
- `status`
- `_openid`
- `created_at`
- `updated_at`
- `join_date`
- `last_active`

Primary readers/writers:
- [apps/app/src/services/cloudbase.js](/Users/kevin/git/liwu/apps/app/src/services/cloudbase.js)
  - `normalizeCurrentUserProfile`
  - `userProfileService.ensureCurrentProfile`
  - `userProfileService.updateCurrentProfile`
- [apps/web/src/admin/services/database.js](/Users/kevin/git/liwu/apps/web/src/admin/services/database.js)
  - `normalizeUser`
  - `getUsers`
  - `createUser`
  - `updateUser`

Current problems:
- Duplicate rows can share `phone` and `auth_uid`.
- Login recovery is forced to canonicalize from overloaded user documents instead of dedicated auth bindings.

### 2. User Profile

Fields:
- `name`
- `note_name`
- `avatar`
- `avatar_index`
- `bio`
- `location`
- `age`
- `name_updated_at`

Primary readers/writers:
- [apps/app/src/services/cloudbase.js](/Users/kevin/git/liwu/apps/app/src/services/cloudbase.js)
  - `normalizeCurrentUserProfile`
  - avatar and profile update flows
- [apps/web/src/admin/services/database.js](/Users/kevin/git/liwu/apps/web/src/admin/services/database.js)
  - `normalizeUser`
  - admin CRUD

Current problems:
- Profile data is coupled to auth recovery and wallet mutations.

### 3. Wallet / Fortune Ledger Snapshot

Fields:
- `balance`
- `wealth_history`
- `reward_claims`

Primary readers/writers:
- [apps/app/src/services/cloudbase.js](/Users/kevin/git/liwu/apps/app/src/services/cloudbase.js)
  - `awardUserById`
  - `wealthService`
  - order creation and reward flows
- [apps/web/src/admin/services/database.js](/Users/kevin/git/liwu/apps/web/src/admin/services/database.js)
  - admin reward / revoke flows
  - partner reward settlement
  - agent daily burn

Current problems:
- `wealth_history` is embedded and unbounded in principle.
- `reward_claims` is embedded state used for idempotency.
- `point_ledger` already exists, so `wealth_history` duplicates event data inside `users`.

### 4. Student Membership Snapshot

Fields:
- `is_student`
- `student_expire_at`
- `student_membership_plan_key`

Primary readers/writers:
- [apps/app/src/services/cloudbase.js](/Users/kevin/git/liwu/apps/app/src/services/cloudbase.js)
  - profile rendering
  - student order application
- [apps/web/src/admin/services/database.js](/Users/kevin/git/liwu/apps/web/src/admin/services/database.js)
  - order settlement updates

Current problems:
- Membership state is mutable account entitlement data, but it lives in the same document as login and profile.

### 5. Invitation / Referral

Fields:
- `inviter_user_id`

Primary readers/writers:
- [apps/app/src/services/cloudbase.js](/Users/kevin/git/liwu/apps/app/src/services/cloudbase.js)
  - profile bootstrap from invite code
  - badge and wallet metrics
- [apps/web/src/admin/services/database.js](/Users/kevin/git/liwu/apps/web/src/admin/services/database.js)
  - admin CRUD

Current problems:
- Only the direct edge is stored. Referral lifecycle has no standalone model.

### 6. Partner Store / Brand Workspace Affiliation

Fields:
- `store_id`
- `store_name`
- `store_role`
- `store_owner_user_id`
- `store_description`
- `store_contact`

Primary readers/writers:
- [apps/web/src/admin/services/database.js](/Users/kevin/git/liwu/apps/web/src/admin/services/database.js)
  - partner role model repair
  - assign user to store
  - partner brand workspace
- [apps/app/src/services/cloudbase.js](/Users/kevin/git/liwu/apps/app/src/services/cloudbase.js)
  - current profile normalization
- [apps/web/src/pages/Partner.jsx](/Users/kevin/git/liwu/apps/web/src/pages/Partner.jsx)
  - role and store resolution

Current problems:
- This partially duplicates `partner_brands` and `partner_brand_members`.
- `store_*` fields are being used as denormalized shortcuts and source of truth at the same time.

### 7. Daily Burn / Agent Operational State

Fields:
- `beans_daily_settled_at`
- `beans_last_extinguished_at`
- `beans_last_ignited_at`

Primary readers/writers:
- [apps/web/src/admin/services/database.js](/Users/kevin/git/liwu/apps/web/src/admin/services/database.js)
  - `applyUserDailyBeanBurn`
  - partner dashboards

Current problems:
- Operational state for one subsystem is embedded in the core user document.

## Existing Collections That Already Overlap

These collections already exist and reduce the need to keep everything in `users`:
- `point_ledger`
- `badge_profiles`
- `partner_brands`
- `partner_brand_members`
- `partner_brand_invites`
- `user_addresses`
- `user_tags`

## Target Split

### Keep In `users` (core identity only)

Recommended future fields:
- `_openid`
- `_id`
- `uid`
- `auth_uid`
- `phone`
- `email`
- `status`
- `created_at`
- `updated_at`
- `join_date`
- `last_active`

Rationale:
- This becomes the canonical identity binding document.
- No wallet history, no partner store denormalization, no student entitlement.

### New Collection: `user_profiles`

Recommended fields:
- `_openid`
- `user_id`
- `name`
- `note_name`
- `avatar`
- `avatar_index`
- `bio`
- `location`
- `age`
- `name_updated_at`
- `created_at`
- `updated_at`

Ownership:
- Pure profile presentation data.

### New Collection: `user_wallets`

Recommended fields:
- `_openid`
- `user_id`
- `balance`
- `reward_claims`
- `created_at`
- `updated_at`

Rationale:
- Balance snapshot remains cheap to read.
- `reward_claims` idempotency state moves out of `users`.
- Event history remains in `point_ledger`, not embedded arrays.

### New Collection: `user_memberships`

Recommended fields:
- `_openid`
- `user_id`
- `is_student`
- `student_expire_at`
- `student_membership_plan_key`
- `created_at`
- `updated_at`

Rationale:
- Entitlement state is isolated from identity.

### New Collection: `user_referrals`

Recommended fields:
- `_openid`
- `user_id`
- `inviter_user_id`
- `source`
- `created_at`
- `updated_at`

Rationale:
- Makes invitation edge explicit and extendable.

### New Collection: `user_partner_identities`

Recommended fields:
- `_openid`
- `user_id`
- `store_id`
- `store_name`
- `store_role`
- `store_owner_user_id`
- `store_description`
- `store_contact`
- `created_at`
- `updated_at`

Rationale:
- Temporary compatibility bridge while `partner_brands` and `partner_brand_members` remain source of truth for brand workspace.
- Lets the app stop treating store metadata as core identity.

### New Collection: `user_operational_states`

Recommended fields:
- `_openid`
- `user_id`
- `beans_daily_settled_at`
- `beans_last_extinguished_at`
- `beans_last_ignited_at`
- `created_at`
- `updated_at`

Rationale:
- Isolates daily-burn specific state from core account data.

## Migration Strategy

### Phase 1. Add New Collections

Create:
- `user_profiles`
- `user_wallets`
- `user_memberships`
- `user_referrals`
- `user_partner_identities`
- `user_operational_states`

No live behavior change yet.

### Phase 2. Backfill

For each `users` document:
- copy profile fields into `user_profiles`
- copy `balance` and `reward_claims` into `user_wallets`
- copy student fields into `user_memberships`
- copy `inviter_user_id` into `user_referrals`
- copy `store_*` into `user_partner_identities`
- copy `beans_*` into `user_operational_states`

Do not migrate `wealth_history` into a new embedded store.
Instead:
- treat `point_ledger` as event source of truth
- optionally archive legacy `wealth_history` in a one-off migration snapshot collection if needed

Preserve `_openid` on all user-owned split documents so the current CloudBase permission rule continues to work:

```json
{
  "read": "auth != null",
  "write": "doc._openid == auth.uid"
}
```

### Phase 3. Dual Read / Dual Write

Update application code to:
- read from new collections first
- fall back to old `users` fields for compatibility
- write to both old and new locations during migration window

### Phase 4. Cutover

After verification:
- stop writing split fields into `users`
- keep only identity fields in `users`

### Phase 5. Cleanup

Optional final cleanup:
- remove obsolete fields from `users`
- dedupe users by `auth_uid` and `phone`

## Code Impact Summary

High-impact files:
- [apps/app/src/services/cloudbase.js](/Users/kevin/git/liwu/apps/app/src/services/cloudbase.js)
- [apps/web/src/admin/services/database.js](/Users/kevin/git/liwu/apps/web/src/admin/services/database.js)
- [apps/app/src/services/database.js](/Users/kevin/git/liwu/apps/app/src/services/database.js)
- [apps/app/src/context/CloudAwarenessContext.jsx](/Users/kevin/git/liwu/apps/app/src/context/CloudAwarenessContext.jsx)

Minimum compatibility adapters needed:
- `getCurrentUserProfileBundle(userId)`
- `saveCurrentUserProfileBundle(userId, patch)`
- `getAdminUserBundle(userId)`
- `saveAdminUserBundle(userId, patch)`

## Immediate Recommendation

Before the full split, fix identity collisions first:
- one `auth_uid` must map to one canonical user
- one phone should not be shared across active login identities

Without that, any collection split still inherits the wrong user resolution behavior.
