# Meditation Admin Tabs Verification Plan (Neng / 质检员)

**Role**: Neng (质检员)  
**Reference**: `docs/meditation.admin.spec.md` (exact fields, `med_paragraphs`, `med_section_raws`, `med_section_audios`, `paragraph_type` = intro/breath/verse, `word_count_status`, star rating via `usage_count`, audio association)  
**Scope**: Paragraph Tab + Section-Raw Tab (new sub-tabs in MeditationPage)  
**Admin Entry**: http://localhost:5175/partner (apps/web)  
**Process Owner**: Neng executes verification; closed-loop with Kong after any fix.  
**Date Prepared**: 2026-07-02  
**Status**: Ready for execution once Kong delivers code. **Do not modify code during verification.**

## 0. Prerequisites & Environment

1. Workspace: `cd /Users/kevin/code/liwu && ls package.json` (confirm correct root).
2. Dev server: `npm run dev:web` (or `npm --workspace @liwu/web run dev`). Confirm listening on **5175**.
   - Verify: `lsof -i:5175 -sTCP:LISTEN` or `curl -I http://localhost:5175`.
3. Browser: Chrome (or equivalent). Clear cache if needed. Add `localhost:5175` to CloudBase web safe domains if prompted.
4. Admin credentials: User must have tag `超级管理员` or `管理员` (SUPER_ADMIN_ROLE_TAG_NAME / ADMIN_ROLE_TAG_NAME in Partner.jsx).
   - Dev mock: Login modal → phone (e.g. 13800138000) → send code → enter `1234`.
   - Real: Ensure tag assigned in `user_tags` / tags collections.
5. CloudBase env: `liwu-d8gek6jjdab1d087c` (from cloudbaserc.json + DATABASE_CONFIG).
6. Tools for verification:
   - Browser dev tools (Network, Console, Application > Local Storage).
   - CloudBase console (https://console.cloud.tencent.com/tcb) for direct DB inspection.
   - Terminal for `cloudbase` CLI (if usable) or nosql helpers.
7. Baseline: Run current MeditationPage → confirm **old** SUB_TABS (library/presets/composition/calendar) work, no new tabs yet. Snapshot current state.

**Pass/Fail Gate**: All prereqs must pass before proceeding to data setup or functional tests. Record environment snapshot (browser console errors, port status).

## 1. Test Data Setup (in CloudBase)

**Goal**: Pre-populate `med_paragraphs` + `med_section_raws` + `med_section_audios` (and minimal audios) so tabs have realistic data. **Only use new `med_*` collections.** No writes to `app_settings`, legacy meditation* keys, or other collections during setup.

### 1.1 Create Collections (if missing)
1. CloudBase Console → Database → Collection Management.
2. Create (if not exist):
   - `med_paragraphs`
   - `med_section_raws`
   - `med_section_audios`
3. Set permissions (per spec):
   - Read/Write: restricted to partner admin roles (use security rules or role tags; for test, at minimum allow the test admin's `_openid` or authenticated users with matching tags).
   - Anonymous: no access.
4. Verify: Use CloudBase console query or (if CLI works) nosql count on each.
   - Expected: Collections exist, empty or prepped.

**Acceptance**: Collections listed; permissions prevent anonymous read. Record requestId / trace if errors.

### 1.2 Seed Sample Paragraphs (`med_paragraphs`)
Use CloudBase console "Add Document" or nosql INSERT. Create **at least 12** docs with variety:

- **Types**: Mix of `intro`, `breath`, `verse` (at least 4 each).
- **Fields** (exact per spec):
  - `_id`: auto or manual short id.
  - `text`: pure Chinese text (vary length 10-200 chars). Examples:
    - intro (short): "欢迎来到理悟冥想空间。"
    - breath (medium): "慢慢吸气... 感受腹部鼓起... 缓缓呼出... 释放所有压力。"
    - verse (longer): Full heart quote ~80-120 chars.
  - `paragraph_type`: "intro" | "breath" | "verse"
  - `tags`: array e.g. `["calm", "intro"]` or `[]`
  - `category`: optional e.g. "greeting"
  - `usage_count`: vary for stars: 0, 2, 5, 12, 25, 50 (higher = more stars)
  - `source`: "manual" or "ai"
  - `ai_rewritten_from`: null or existing `_id` for 2-3 docs.
  - `created_at`, `updated_at`: ISO strings e.g. "2026-07-02T10:00:00.000Z"
  - `created_by`: test admin UID or "test-admin"
- Ensure variety in length for later count tests.
- Do **not** touch legacy fields or collections.

**Verification Step**: Query collection → confirm ≥12 docs, correct types, fields present, no extra legacy data.

### 1.3 Seed Sample Section-Raws (`med_section_raws`)
Create **at least 6**:

- `section_type`: "sec-intro", "sec-breath", "sec-verse", "sec-prelude", etc. (match spec examples).
- `paragraph_ids`: ordered array of 1-4 valid `_id`s from seeded paragraphs (use different combos).
- `target_char_count`: per spec guidance (intro≈30, breath≈100, verse≈150, etc.; use exact from spec table).
- `current_char_count`: 0 or pre-compute sum of selected texts' char length (for initial state).
- `word_count_status`: "ok", "slightly_under", "under", "slightly_over", "over" (seed a mix).
- `audio_id`: null or link to a seeded audio (see 1.4).
- `created_at`/`updated_at`/`created_by`: as above.

**Verification**: Confirm arrays reference real paragraphs; counts match seeded text lengths initially.

### 1.4 Seed Sample Audios (`med_section_audios`)
Create **3-5** minimal:

- `section_raw_id`: link to one of above section_raws.
- `file_id`: use a real CloudBase fileId (upload a small test MP3/Opus via existing library tab first, or reuse known).
- `audio_url`: temp or final URL (will be proxied).
- `duration`: e.g. 25.5 (seconds)
- `mime_type`: "audio/mpeg" or "audio/ogg; codecs=\"opus\""
- timestamps + created_by.

**Alternative**: Upload one audio via existing "音频库" tab first (to test reuse), capture its fileId, then link.

**Verification**: Cross-check links; audio playable via getTempFileURL if needed.

**Acceptance (Data Setup)**: 
- All 3 collections have docs.
- Paragraphs cover all 3 `paragraph_type` values.
- At least one section_raw with >1 paragraph_ids (ordered).
- Zero impact on legacy collections (query `app_settings` for meditation keys unchanged).
- Record exact sample _ids used in a test log for repeatability.

**Cleanup Note**: After full pass, optional delete test docs (or mark with `test: true` tag).

## 2. Functional Tests - Paragraph Tab ("段落文本库")

**Entry**: After login → 冥想 tab → click "段落文本库" pill (or first sub-tab). Expect data table/list of paragraphs.

### 2.1 Read / List
- **Case 2.1.1**: Default load shows all seeded paragraphs (≥12 rows).
  - Steps: Navigate tab; wait for load.
  - Expected: List populates; each row shows text snippet, paragraph_type, tags, usage_count/star, created_at, actions (edit/delete/AI-rewrite).
  - Pass: All seeded visible, no duplicates, correct type labels.
- **Case 2.1.2**: Pagination or scroll if > page size (if implemented).

### 2.2 Filters & Search
- **Case 2.2.1**: Filter by `paragraph_type` (pills or dropdown: all / intro / breath / verse).
  - Steps: Click "intro" filter.
  - Expected: Only intro paragraphs shown; count updates.
  - Repeat for breath/verse.
  - Pass: Accurate filtering; "all" resets.
- **Case 2.2.2**: Text search (input box).
  - Steps: Type partial text from a seeded paragraph (e.g. "吸气").
  - Expected: Real-time or on-enter filter to matching rows.
  - Pass: Matches only containing text; case-insensitive if applicable.
- **Case 2.2.3**: Combined filter + search + tags (if tags filter present).
  - Pass: Intersection works.

### 2.3 CRUD
- **Case 2.3.1 Create**:
  - Steps: Click "新增段落" or + button → form (text textarea required, paragraph_type select, tags input, source manual/ai).
  - Fill: text (Chinese), type="breath", tags=["test"], source="manual".
  - Save.
  - Expected: New row appears in list; doc in `med_paragraphs` with all fields + timestamps + created_by; usage_count=0.
  - Pass: Visible immediately; CloudBase query confirms.
- **Case 2.3.2 Read Detail / Edit**:
  - Steps: Click edit on a row → form prefilled.
  - Modify text + type.
  - Save.
  - Expected: List updates; `updated_at` changes; no new doc.
- **Case 2.3.3 Delete**:
  - Steps: Delete button (with confirm) on test row.
  - Expected: Row removed; doc deleted from collection; no orphans.
  - Pass: Confirm via CloudBase query; other data intact.
- **Case 2.3.4 Edge**: Empty text → save blocked with prompt. Duplicate? (if unique enforced).

### 2.4 Star Rating (usage_count)
- **Case 2.4.1 Display**:
  - Steps: View rows with varying usage_count.
  - Expected: Visual stars (e.g. ★ filled proportional to count, or "★4 (25次)" badge). Higher count = more prominent.
  - Pass: Matches seeded values; updates if count changes (future).
- **Case 2.4.2 Sorting** (if star/sort control): Sort by usage desc → highest first.

### 2.5 AI Rewrite (仿写)
- **Case 2.5.1**:
  - Steps: Click "AI仿写" or rewrite button on a paragraph.
  - Expected: Loading state; new paragraph created (or modal preview); `ai_rewritten_from` set to source `_id`; `source`="ai"; appears in list.
  - Pass: New doc linked; original unchanged. (If AI not wired, UI shows graceful "AI service unavailable" or mock.)

**Acceptance (Paragraph Tab)**: CRUD full cycle works on `med_paragraphs` only. Filters real-time. Stars accurate. No console errors on actions.

## 3. Functional Tests - Section-Raw Tab ("原始音频库")

**Entry**: Click "原始音频库" sub-tab pill.

### 3.1 Read / List
- List of section_raw entries showing: section_type, paragraph count, current/target char, status badge (color-coded: green=ok, yellow=slight, red=over/under), audio status (linked or not), actions (edit/compose, upload, preview).

### 3.2 Selecting & Ordering Paragraphs
- **Case 3.2.1 Select into raw**:
  - Steps: For a section_raw (or create new), open composer → search/filter paragraphs → select (checkbox or add button) several (mix types).
  - Expected: Added to ordered list on right/ below; real-time current_char_count updates (sum of selected text.length).
  - Pass: Accurate char sum; selected paragraphs shown with type badges.
- **Case 3.2.2 Ordering**:
  - Steps: Drag-drop or up/down/remove buttons on selected list.
  - Reorder; save.
  - Expected: `paragraph_ids` array persisted in exact order; list reflects.
  - Pass: On reload, order same; char count stable.
- **Case 3.2.3 Remove / clear**:
  - Expected: Updates count; can empty.

### 3.3 Word/Char Count Calculation & Status
- **Case 3.3.1 Real-time prompts**:
  - Steps: Add/remove/reorder paragraphs in composer.
  - Expected: Live update of current_char_count vs target_char_count; status badge changes dynamically.
  - Pass: Status logic per seeded targets (exact thresholds: define in test log e.g. within 10% = ok, 10-20% slight, >20% over/under).
- **Case 3.3.2 Status values**:
  - Verify all 5 statuses appear across seeded + edited rows.
  - On save: `word_count_status` + `current_char_count` stored correctly.
- **Case 3.3.3 Target edit** (if allowed): Change target → recalc status.

**Note**: Chinese "字数" = char count (text.length). "word_count_status" field name per spec.

### 3.4 Audio Upload & Association
- **Case 3.4.1 Upload link**:
  - Steps: On a section_raw row or in editor → "上传音频" → choose MP3/Opus file → upload.
  - Expected: Reuses `uploadAudioFile` (same as library tab): produces fileId + audioUrl; creates/links `med_section_audios` doc with `section_raw_id`; sets `audio_id` on the section_raw.
  - Pass: 
    - Network shows correct upload path (meditation-audio-raw/...).
    - New audio doc queryable.
    - Section raw now shows linked audio (duration, preview button).
    - Temp URL works (getAudioTempUrl).
- **Case 3.4.2 Preview**:
  - Steps: Click play on linked audio.
  - Expected: Plays (browser support check per spec for Opus); no block on valid file.
- **Case 3.4.3 Replace / remove audio**:
  - Expected: Updates link; old audio doc may remain or cleanup.

### 3.5 CRUD for Section-Raw
- Create new section_raw (choose type, target).
- Edit (change type/paragraphs/target).
- Delete (cascade? or just remove; note audio link).
- Save states: loading, success toast, error red.

**Acceptance (Section-Raw Tab)**: Full compose flow (select → order → count/status → upload audio) works end-to-end. Data only in med_* collections. Audio reuse identical to library.

## 4. UI / Interaction Tests (Both Tabs)

- **Case 4.1 Sub-tab Navigation**: Pill buttons (per `pillBtnStyle`). Switching preserves state? Fast.
- **Case 4.2 Styles**: Cards (`cardStyle`), section titles, inputs (`inputStyle`), primary/danger/ghost buttons, rounded 16px/8px, colors per spec (dark #1e293b etc.). Matches existing library/presets tabs.
- **Case 4.3 States**:
  - Saving: button disabled + "保存中...".
  - Success: brief message.
  - Error: red prompt + console.
- **Case 4.4 Responsive**: Desktop primary (admin); note mobile limited per spec.
- **Case 4.5 Real-time**: Filters/search/counts update without full reload.
- **Case 4.6 Empty States**: "暂无段落" / "请添加段落" friendly.
- **Case 4.7 Star + Badges**: Visual (no text overflow), status colors (ok=green, over=red).
- **Case 4.8 Accessibility/Keyboard**: Basic tab order, labels (spot check).

**Pass**: UI matches `ui.spec.md` + meditation.admin.spec.md styles; no layout breakage.

## 5. Data Compliance & No Legacy Impact

- **Case 5.1 Collections**:
  - All reads/writes from new tabs hit only `med_paragraphs` / `med_section_raws` / `med_section_audios`.
  - Verify via CloudBase console or Network tab (collection names in requests).
- **Case 5.2 Legacy Unchanged**:
  - Before/after: Query `app_settings` for keys like MEDITATION_AUDIO_LIBRARY_KEY etc. — identical.
  - Old tabs (library etc.) still load and function unchanged.
  - No new fields leaked to legacy docs.
- **Case 5.3 Permissions**: Non-admin cannot access tabs or data (if enforced in UI/route).
- **Case 5.4 Migration Notes**: Per spec — old tts_text etc. untouched.

**Acceptance**: 100% isolation. "Only use new med_* collections, no impact on legacy."

## 6. Integration Points

- **Case 6.1 Audio Upload Reuse**:
  - Upload in section-raw produces same result shape as library tab (`{fileId, audioUrl}`).
  - Path conventions, proxy, mime handling identical.
  - Final delivery still Opus (if transcode applies).
- **Case 6.2 Admin Access 5175**:
  - Only works on :5175 (not 5176 or prod without setup).
  - Partner.jsx ADMIN_TABS includes meditation; sub-tabs render.
- **Case 6.3 Shared Utils**:
  - Future hooks to `normalizeParagraph` etc. in meditation-database-normalizers.js (check if added; graceful if not).
  - No breakage to `buildMeditationSessionPlan` or other meditation code.
- **Case 6.4 Other Tabs**: Switching sub-tabs, full page load, no cross-contamination.

## 7. Error / Edge Cases

- Network failure / timeout on load/save.
- Invalid paragraph_id reference (should not crash list).
- Very long text (char count overflow? truncation per chapter rules but here raw).
- Browser without Opus support (preview block with message).
- Concurrent edits (last-write wins or conflict).
- Delete paragraph still referenced in section_raw (warn or allow; status?).

## 8. Full Acceptance Criteria (Pass/Fail per Item)

| # | Item | Pass Criteria | Fail Example |
|---|------|---------------|--------------|
| P1 | Paragraph CRUD | Create/edit/delete succeeds; data in med_paragraphs only; list reflects instantly | Save does nothing / writes to wrong collection |
| P2 | Paragraph filters | Type/search real-time accurate; combined works | Filter shows wrong types |
| P3 | Star rating | Visual + count matches usage_count; sort if present | Stars static or wrong |
| S1 | Section-raw compose | Select + order persists in paragraph_ids array | Order not saved or lost on reload |
| S2 | Char count + status | Real-time calc + 5 statuses correct vs target | Count wrong / status never "ok" |
| S3 | Audio upload link | Reuse works; med_section_audios created + linked; preview ok | Upload fails or no audio_id set |
| C1 | Data compliance | Only med_* touched; legacy 0 change | Any write to app_settings/meditation* |
| U1 | UI/Interaction | Styles, states, real-time match spec + existing tabs | Broken layout or no loading feedback |
| I1 | Integration | Audio reuse + 5175 admin + no regression | Different upload behavior or port issue |
| All | No console errors | Clean console on all flows | Red errors / uncaught exceptions |

**Overall Pass**: 100% of cases pass with evidence (screenshots, queries, logs). Any fail → block.

## 9. Execution Process & Closed-Loop Re-test

1. **Initial Run (Neng)**:
   - Follow sections 0-8 sequentially.
   - For each case: execute steps → check expected → mark PASS/FAIL + evidence (browser snapshot, console excerpt, CloudBase query JSON, collection _id).
   - Use todo list or this doc to track.
   - At end: full report (this file updated) + summary to team.

2. **After Kong Fix/Delivery** (closed-loop):
   - Kong notifies "code delivered / fix in PR X".
   - Neng immediately:
     - Pull latest (or restart dev).
     - Re-run **full plan** or delta (affected cases + regression on legacy).
     - Re-verify data compliance + integration.
     - Update this plan with new date, "Re-test round N", pass/fail deltas.
   - If any fail: 
     - Document exact reproduction (steps + current vs expected + logs + collection state).
     - Return to Kong with reference to this plan + evidence.
     - Do not approve.
   - Repeat loop until all criteria green.
   - Then hand to Jing for compliance review + Zang for final.

3. **Documentation**:
   - Append to this file: "Execution Log" with dates, rounds, blockers.
   - Screenshots / console dumps saved to Designs/ or attached.
   - Update linked skill refs if process evolves.

4. **Exit Criteria**:
   - All acceptance items PASS.
   - No data leakage.
   - UI/functional matches spec exactly.
   - Closed-loop documented.

**Neng Note**: Verify against **exact fields** in spec. Prioritize isolation ("new med_* only"). Use real tool output (browser + DB queries) not assumption. Report blockers honestly.

---

**Ready for Execution**. Once Kong lands the Paragraph + Section-Raw tabs implementation (updated SUB_TABS, new components or sections in MeditationPage, DB helpers for med_* CRUD, word count logic, audio link), execute from top.

**Files Referenced**:
- docs/meditation.admin.spec.md
- apps/web/src/admin/components/Dashboard/MeditationPage.jsx (current baseline)
- apps/web/src/admin/utils/audioUpload.js
- apps/app/src/services/database.js + admin wrappers
- packages/shared-utils/meditation-database-normalizers.js (future)
- AGENTS.md / data-migration-governance patterns (roles)

**Next for Neng after plan**: Monitor for Kong delivery; trigger browser + DB verification loop.