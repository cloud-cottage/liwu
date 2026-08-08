# Paragraph Tab P0 Partial - Focused Test Cases (Neng / 质检员)

**Context**: Based on `meditation.admin.spec.md` + current SUB_TABS update + placeholder in MeditationPage.jsx (P0 partial, data not yet wired to real `getMedParagraphs` etc.).  
**Target**: http://localhost:5175/partner (apps/web dev server). Admin login required (use dev mock phone 13800138000 + code 1234, or tagged admin).  
**Scope (focused 5-8 cases)**: Tab order/visibility (main + sub), filter pills (intro/breath/verse/all), list rendering skeleton from med_paragraphs, star display for usage_count.  
**Prepare for**: 5175 verification *once data wiring is done* (list from DB, functional filters, stars). Do not implement code.  
**Reference**: 
- docs/meditation.admin.spec.md (SUB_TABS order, paragraph fields, filter pills, star via usage_count)
- apps/web/src/admin/components/Dashboard/MeditationPage.jsx (current placeholder + SUB_TABS)
- apps/web/src/admin/services/database.js (getMedParagraphs etc. exist but unused in UI)
- meditation.admin.verification-plan.md (full plan; this is P0 slice)

## 0. Data Setup Notes (CloudBase - run before wired verification)

**Env**: liwu-d8gek6jjdab1d087c  
**Collection**: `med_paragraphs` (create if missing; set read/write for admin _openid or partner admin role tags; anonymous = no access).  
**Use CloudBase Console → Database → Add Document** (or CLI/nosql). Do **not** touch `app_settings` or legacy meditation* keys.  
**Seed at least 8-12 varied records**. Provide exact samples below for repeatability (use short _id or let auto; record the _ids you use).

**Sample med_paragraphs records** (mix types, usage_count for stars, Chinese text, timestamps ~2026-07-02):

```json
// 1. intro, usage=0 (0 stars)
{
  "text": "欢迎来到理悟冥想空间。",
  "paragraph_type": "intro",
  "tags": ["greeting", "intro"],
  "category": "greeting",
  "usage_count": 0,
  "source": "manual",
  "ai_rewritten_from": null,
  "created_at": "2026-07-02T09:00:00.000Z",
  "updated_at": "2026-07-02T09:00:00.000Z",
  "created_by": "test-admin-001"
}

// 2. intro, usage=2 
{
  "text": "请保持舒适的姿势，闭上双眼。",
  "paragraph_type": "intro",
  "tags": ["posture"],
  "usage_count": 2,
  "source": "manual",
  "created_at": "2026-07-02T09:05:00.000Z",
  "updated_at": "2026-07-02T09:05:00.000Z",
  "created_by": "test-admin-001"
}

// 3. breath, usage=5 (mid stars)
{
  "text": "慢慢吸气... 感受腹部鼓起... 缓缓呼出... 释放所有压力。",
  "paragraph_type": "breath",
  "tags": ["breathing"],
  "usage_count": 5,
  "source": "manual",
  "created_at": "2026-07-02T09:10:00.000Z",
  "updated_at": "2026-07-02T09:10:00.000Z",
  "created_by": "test-admin-001"
}

// 4. breath, usage=0
{
  "text": "吸气四秒，屏息四秒，呼气六秒。",
  "paragraph_type": "breath",
  "tags": [],
  "usage_count": 0,
  "source": "ai",
  "ai_rewritten_from": null,
  "created_at": "2026-07-02T09:15:00.000Z",
  "updated_at": "2026-07-02T09:15:00.000Z",
  "created_by": "test-admin-001"
}

// 5. verse, usage=12 (high stars)
{
  "text": "心如止水，念随息去。每一呼吸引导你回归当下。",
  "paragraph_type": "verse",
  "tags": ["heart", "verse"],
  "usage_count": 12,
  "source": "manual",
  "created_at": "2026-07-02T09:20:00.000Z",
  "updated_at": "2026-07-02T09:20:00.000Z",
  "created_by": "test-admin-001"
}

// 6. verse, usage=25 (higher)
{
  "text": "在宁静中觉察，在觉察中成长。愿你与这份平静同在。",
  "paragraph_type": "verse",
  "tags": ["wisdom"],
  "usage_count": 25,
  "source": "ai",
  "ai_rewritten_from": "p5",  // example link
  "created_at": "2026-07-02T09:25:00.000Z",
  "updated_at": "2026-07-02T09:25:00.000Z",
  "created_by": "test-admin-001"
}

// 7-8+ more: add 1-2 extra per type with varying lengths/tags/usage_count (e.g. usage=50 for 5-star visual)
```

**Verification of setup** (run via console query or after wiring): 
- `db.collection('med_paragraphs').where({paragraph_type: 'intro'}).get()` → ≥2
- All have `usage_count`, `paragraph_type` in {"intro","breath","verse"}, `text` present.
- Record your exact _ids + counts in test log.
- Confirm collection query returns data; no legacy writes.

**Cleanup**: After tests, optionally delete or add `test: true` marker.

## 1-7. Focused Test Cases (Ready for Execution)

1. **Main Meditation tab visibility and order**  
   - Steps: Open http://localhost:5175/partner → login as admin → observe top-level tab bar (ADMIN_TABS).  
   - Expected: "冥想" tab is visible (after "福豆", before "觉察"). Clicking it loads MeditationPage without error. Non-admins do not see or cannot access (if enforced).  
   - Current (P0): Visible per Partner.jsx.  
   - Data note: No data dependency.  
   - Pass criteria: Tab present in correct position per ADMIN_TABS order; no 404/redirect on click.

2. **Sub-tab (SUB_TABS) order and visibility - Paragraph first**  
   - Steps: Navigate to 冥想 tab → inspect horizontal pill nav (before the card).  
   - Expected: Pills in exact spec order: 段落文本库 (paragraph), 原始音频库 (section-raw), 音频库, 冥想库, 冥想设置, 冥想日历. "段落文本库" is first and default (activeSubTab='paragraph'). All pills use pillBtnStyle (rounded, color on active).  
   - Current (P0): SUB_TABS defined with paragraph first; section-raw pill present but its content area not yet wired (may show blank card).  
   - Pass: Order matches code + spec; switching pills updates active state visually (background/color change).

3. **Paragraph sub-tab renders title + placeholder structure**  
   - Steps: Ensure active sub-tab is "段落文本库" (first pill). Inspect inside the card.  
   - Expected: Section title "段落文本库" (using sectionTitleStyle). Placeholder text "Placeholder table for med_paragraphs:" or equivalent. Table skeleton visible (headers: Text / ID, paragraph_type, empty col). No crash, no legacy data mixed.  
   - Current (P0): Matches the static JSX in MeditationPage.jsx (one example row "示例 intro 段落...").  
   - Pass: Structure present; styles match cardStyle/sectionTitleStyle.

4. **Filter pills visibility and labels (intro/breath/verse/all)**  
   - Steps: In Paragraph tab, locate filter area (flex gap row of pills after title). Click each if interactive. Note 'all' if present.  
   - Expected (full, post-wiring): Pills or equivalent: "all" (or "全部"), "intro", "breath", "verse". Default "all" shows everything. Clicking filters the list (client or query). Labels accurate, use pillBtnStyle, count of visible updates. "all" resets to full list.  
   - Current (P0): Three static pills rendered via map(['intro','breath','verse']) — labels match, but non-functional (no state, no 'all', no filtering, no onClick). 'all' pill not yet in code.  
   - Data setup note: Use the seeded records above (multiple per type).  
   - Pass (current): Pills visible with correct 3 labels. (Post-wiring: full 4 pills functional, real-time update.)

5. **List rendering from med_paragraphs (skeleton + post-wiring)**  
   - Steps: View the table/list area in Paragraph tab. (Post-wiring: ensure DB seeded + refresh/load.) Query CloudBase directly to cross-check.  
   - Expected: List/table renders rows from `med_paragraphs` collection (via getMedParagraphs or equivalent). Each row shows at minimum: text snippet (or full short text), paragraph_type label/badge, tags if present, created_at. No duplicates. Empty state friendly message if 0 records. Real data appears immediately on load.  
   - Current (P0): Static placeholder "med_paragraphs data will appear here" + 1 hardcoded example row. No actual fetch or render from collection.  
   - Data setup note: After seeding ≥8 records (mix types), once wired expect ≥8 rows matching seeded (verify via console: collection count + UI rows).  
   - Pass (current): Placeholder indicates data source correctly. (Post-wiring + data: exact match to seeded docs; text/ type visible; no console errors on load.)

6. **Star display for usage_count**  
   - Steps: View rows (current placeholder or post-wiring list). Look for star/ rating column or badge (spec: "最右侧的列有星级评分"). Vary usage_count in data. Click or hover if interactive. Cross-check against DB usage_count.  
   - Expected: Visual stars (e.g. ★★★★☆ or "★ 4 (12次)" or filled stars proportional to usage_count). Higher usage_count = more filled/prominent stars. Appears per row. Updates if count changes (future). Sorted or highlighted by usage optionally. Matches spec "star rating via usage_count".  
   - Current (P0): No star column or visuals in placeholder table (headers stop at paragraph_type + empty).  
   - Data setup note: Use samples with usage_count = 0,2,5,12,25,50+. Expect visual differentiation (e.g. 0=none, 5=★★★, 25=★★★★★).  
   - Pass (current): Column area reserved or note in placeholder. (Post-wiring: stars render accurately from usage_count field; matches seeded values.)

7. **Basic interaction, no errors, tab state** (covers switching + readiness)  
   - Steps: Switch sub-tabs multiple times (paragraph ↔ others). Inspect browser Console + Network (for future data calls). Reload page while on paragraph tab. Test pill clicks (current static).  
   - Expected: Smooth switch, active pill styling persists. No console errors/red on load/switch. For paragraph: no uncaught exceptions. Once wired: Network shows med_paragraphs queries (not legacy), filters/search work real-time, list updates without full reload. State (activeSubTab) preserved on tab switch if applicable.  
   - Current (P0): Placeholder static; old tabs (library etc.) still functional. Switching to paragraph shows placeholder cleanly.  
   - Pass: Clean console; UI responsive; paragraph tab always first/default. (Post-wiring: real DB calls visible, no legacy impact.)

8. **(Bonus for completeness) Filter + list combined readiness**  
   - Steps: (Post data wiring) Select a filter pill (e.g. "breath") → observe list. Then "all". Search if input present.  
   - Expected: Only matching paragraph_type shown; row count updates; "all" restores full seeded set. Combined with search (text contains) works if implemented. Stars still visible on filtered rows.  
   - Data note: Use seeded with multiple per type.  
   - Current (P0): N/A (static).  
   - Pass (post-wiring): Accurate, real-time.

## Execution Instructions
- Run on clean 5175 dev server (`npm run dev:web` in /Users/kevin/code/liwu).
- Use Chrome devtools: Elements (to inspect pills/table), Console (errors), Network (DB calls post-wiring), Application.
- Cross-verify with CloudBase console queries after each major step.
- Record: PASS/FAIL + screenshot/JSON evidence + exact seeded _ids used.
- Baseline first: Confirm old SUB_TABS (library+) still work unchanged.
- This slice focuses P0 UI skeleton. Full CRUD/AI/Section-Raw in verification-plan.md.
- Once Kong wires data (use getMedParagraphs in Paragraph section, add 'all' + state to filters, add star column rendering, wire list), re-execute cases 4-8 with real data.
- Report to Kong with reference to this file + spec.

**Acceptance for P0 UI slice**: Tabs ordered correctly + visible; filter pills structure present (labels match); placeholder clearly indicates med_paragraphs source; no breakage to existing tabs; ready for data wiring verification at 5175.

**Next**: After wiring complete, execute + update this doc with results.
## Baseline results recorded in companion file: docs/baseline-skeleton-test-report-2026-07-02.md (see that for full numbered PASS/BASELINE + evidence). Server on 5175 verified. Ready for post-wiring re-run.
