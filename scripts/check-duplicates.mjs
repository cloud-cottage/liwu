/**
 * 查询 CloudBase users 集合中的重复数据（使用 @cloudbase/node-sdk）
 * 用法: node scripts/check-duplicates.mjs [--env <envId>]
 */
import cloudbase from '@cloudbase/node-sdk';

const ENV_ID = process.argv[2]?.replace('--env=', '') || 'liwu-d8gek6jjdab1d087c';

const app = cloudbase.init({ env: ENV_ID });
const db = app.database();

const { data: users } = await db.collection('users').limit(500).get();
console.log(`总用户数: ${users.length}`);

// === 1. 按 phone 分组 ===
const phoneMap = {};
for (const u of users) {
  const phone = u.phone || '';
  if (!phone) continue;
  if (!phoneMap[phone]) phoneMap[phone] = [];
  phoneMap[phone].push({ _id: u._id, phone: u.phone, auth_uid: u.auth_uid, uid: u.uid, name: u.name, status: u.status, last_active: u.last_active });
}

console.log('\n=== 📞 手机号重复 ===');
let phoneDups = 0;
for (const [phone, records] of Object.entries(phoneMap)) {
  if (records.length > 1) {
    phoneDups++;
    records.sort((a, b) => ((b.last_active || '') > (a.last_active || '') ? 1 : -1));
    console.log(`\n[${phone}] ${records.length}条 | 建议保留: ${records[0]._id} (${records[0].name}, ${records[0].last_active})`);
    records.forEach(r => console.log(`  _id:${r._id} name:${r.name} auth_uid:${r.auth_uid || '-'} uid:${r.uid} active:${r.last_active}`));
  }
}
console.log(`\n手机号重复组数: ${phoneDups}`);

// === 2. 按 auth_uid 分组 ===
const authMap = {};
for (const u of users) {
  const au = u.auth_uid || '';
  if (!au) continue;
  if (!authMap[au]) authMap[au] = [];
  authMap[au].push({ _id: u._id, phone: u.phone, auth_uid: u.auth_uid, uid: u.uid, name: u.name, status: u.status, last_active: u.last_active });
}

console.log('\n=== 🔑 auth_uid 重复 ===');
let authDups = 0;
for (const [au, records] of Object.entries(authMap)) {
  if (records.length > 1) {
    authDups++;
    records.sort((a, b) => ((b.last_active || '') > (a.last_active || '') ? 1 : -1));
    console.log(`\n[${au}] ${records.length}条 | 建议保留: ${records[0]._id} (${records[0].name})`);
    records.forEach(r => `  _id:${r._id} phone:${r.phone} name:${r.name}`);
  }
}
console.log(`\nauth_uid 重复组数: ${authDups}`);

if (phoneDups === 0 && authDups === 0) {
  console.log('\n✅ 无重复数据');
} else {
  console.log(`\n⚠️ 共 ${phoneDups + authDups} 组重复需要处理`);
}

process.exit(0);
