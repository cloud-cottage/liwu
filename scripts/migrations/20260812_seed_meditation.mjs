#!/usr/bin/env node

/**
 * 种子脚本 — 为冥想管理页面创建 med_paragraphs / med_section_raws / med_section_audios 集合并填充示例数据
 * 用法：TARGET_ACCESS_KEY=xxx node scripts/migrations/20260812_seed_meditation.mjs
 */

import cloudbase from '@cloudbase/node-sdk';

const ENV = 'liwu-d8gek6jjdab1d087c';

const key = process.env.TARGET_ACCESS_KEY;
if (!key) { console.error('需要 TARGET_ACCESS_KEY'); process.exit(1); }

const app = cloudbase.init({ env: ENV, accessKey: key });
const db = app.database();

const now = () => new Date().toISOString();

const ensureColl = async (name) => {
  try { await db.createCollection(name); console.log(`  ✅ ${name}`); }
  catch(e) { if (!e.message?.includes('exist')) console.log(`  ⚠️ ${name}: ${e.message?.slice(0,60)}`); }
};

const sampleParagraphs = [
  {
    text: "欢迎来到理悟冥想空间。",
    paragraph_type: "intro",
    tags: ["greeting", "intro"],
    category: "greeting",
    usage_count: 0,
    source: "manual",
    ai_rewritten_from: null,
    created_at: "2026-07-02T09:00:00.000Z",
    updated_at: "2026-07-02T09:00:00.000Z",
    created_by: "test-admin-001"
  },
  {
    text: "请保持舒适的姿势，闭上双眼。",
    paragraph_type: "intro",
    tags: ["posture"],
    usage_count: 2,
    source: "manual",
    created_at: "2026-07-02T09:05:00.000Z",
    updated_at: "2026-07-02T09:05:00.000Z",
    created_by: "test-admin-001"
  },
  {
    text: "慢慢吸气... 感受腹部鼓起... 缓缓呼出... 释放所有压力。",
    paragraph_type: "breath",
    tags: ["breathing"],
    usage_count: 5,
    source: "manual",
    created_at: "2026-07-02T09:10:00.000Z",
    updated_at: "2026-07-02T09:10:00.000Z",
    created_by: "test-admin-001"
  },
  {
    text: "吸气四秒，屏息四秒，呼气六秒。",
    paragraph_type: "breath",
    tags: [],
    usage_count: 0,
    source: "ai",
    ai_rewritten_from: null,
    created_at: "2026-07-02T09:15:00.000Z",
    updated_at: "2026-07-02T09:15:00.000Z",
    created_by: "test-admin-001"
  },
  {
    text: "一花一世界，一叶一菩提。静观呼吸，回归本心。",
    paragraph_type: "verse",
    tags: ["zen", "poetry"],
    usage_count: 12,
    source: "manual",
    created_at: "2026-07-02T09:20:00.000Z",
    updated_at: "2026-07-02T09:20:00.000Z",
    created_by: "test-admin-001"
  },
  {
    text: "行到水穷处，坐看云起时。",
    paragraph_type: "verse",
    tags: ["zen", "poetry", "calm"],
    usage_count: 8,
    source: "ai",
    ai_rewritten_from: null,
    created_at: "2026-07-02T09:25:00.000Z",
    updated_at: "2026-07-02T09:25:00.000Z",
    created_by: "test-admin-001"
  },
];

const main = async () => {
  console.log('📦 创建冥想管理集合...');
  for (const c of ['med_paragraphs', 'med_section_raws', 'med_section_audios']) {
    await ensureColl(c);
  }

  console.log('\n📝 写入 med_paragraphs 示例数据...');
  for (let i = 0; i < sampleParagraphs.length; i++) {
    const p = sampleParagraphs[i];
    const result = await db.collection('med_paragraphs').add(p);
    console.log(`  ✅ [${i + 1}/${sampleParagraphs.length}] ${p.text.slice(0, 30)}... → ${result.id}`);
  }

  console.log(`\n✅ 完成！共写入 ${sampleParagraphs.length} 条 med_paragraphs 数据。`);
  console.log('   刷新 /partner → 冥想 → 段落文本库 即可看到数据。');
};

main().catch(e => { console.error(e); process.exit(1); });
