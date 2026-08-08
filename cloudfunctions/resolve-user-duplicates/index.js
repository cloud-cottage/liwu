/**
 * CloudBase 云函数：用户去重
 * 部署：tcb fn deploy resolve-user-duplicates
 * 调用：tcb fn run resolve-user-duplicates
 */
const cloudbase = require('@cloudbase/node-sdk');

exports.main = async (event = {}) => {
  const { dryRun = true } = event; // 默认 dry-run，不实际写入

  const app = cloudbase.init({
    env: cloudbase.SYMBOL_CURRENT_ENV || 'liwu-d8gek6jjdab1d087c'
  });
  const db = app.database();
  const _ = db.command;

  // 获取所有用户
  const { data: users } = await db.collection('users').limit(500).get();
  const results = [];

  // 1. 按 phone 分组找出重复
  const phoneMap = {};
  for (const u of users) {
    const phone = u.phone || '';
    if (!phone) continue;
    if (!phoneMap[phone]) phoneMap[phone] = [];
    phoneMap[phone].push(u);
  }

  for (const [phone, records] of Object.entries(phoneMap)) {
    if (records.length <= 1) continue;
    // 按 last_active 排序，保留最新的
    records.sort((a, b) => {
      const ta = a.last_active || a.created_at || '';
      const tb = b.last_active || b.created_at || '';
      return tb.localeCompare(ta);
    });
    const canonical = records[0];
    const duplicates = records.slice(1);

    if (dryRun) {
      results.push({ phone, canonical: canonical._id, duplicates: duplicates.map(d => d._id), status: 'dry-run' });
      continue;
    }

    // 实际合并：将重复用户的 phone 清空，防止重复登录
    for (const dup of duplicates) {
      await db.collection('users').doc(dup._id).update({
        phone: _.remove(),
        auth_uid: _.remove(), // 可选：auth_uid 也清空
        updated_at: new Date().toISOString()
      });
    }
    await db.collection('users').doc(canonical._id).update({
      updated_at: new Date().toISOString()
    });
    results.push({ phone, canonical: canonical._id, duplicates: duplicates.map(d => d._id), status: 'completed' });

    console.log(`手机号 ${phone}: 保留 ${canonical._id} (${canonical.name}), 清理 ${duplicates.length} 条`);
  }

  // 2. 按 auth_uid 分组（已有去重记录，但查漏补缺）
  const authMap = {};
  for (const u of users) {
    const au = u.auth_uid || '';
    if (!au) continue;
    if (!authMap[au]) authMap[au] = [];
    authMap[au].push(u);
  }

  for (const [au, records] of Object.entries(authMap)) {
    if (records.length <= 1) continue;
    records.sort((a, b) => {
      const ta = a.last_active || a.created_at || '';
      const tb = b.last_active || b.created_at || '';
      return tb.localeCompare(ta);
    });
    const canonical = records[0];
    const duplicates = records.slice(1);

    if (dryRun) {
      results.push({ authUid: au, canonical: canonical._id, duplicates: duplicates.map(d => d._id), status: 'dry-run' });
      continue;
    }

    for (const dup of duplicates) {
      await db.collection('users').doc(dup._id).update({
        phone: _.remove(),
        auth_uid: _.remove(),
        updated_at: new Date().toISOString()
      });
    }
    results.push({ authUid: au, canonical: canonical._id, duplicates: duplicates.map(d => d._id), status: 'completed' });
    console.log(`auth_uid ${au}: 保留 ${canonical._id}, 清理 ${duplicates.length} 条`);
  }

  return {
    dryRun,
    totalChecked: users.length,
    phoneDupGroups: results.filter(r => r.phone).length,
    authUidDupGroups: results.filter(r => r.authUid).length,
    results
  };
};
