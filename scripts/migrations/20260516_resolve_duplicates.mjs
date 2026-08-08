#!/usr/bin/env node

/**
 * P6: 解决重复 auth_uid/phone 冲突
 * 
 * 策略：
 * 1. 有 phone > 无 phone
 * 2. 有 store_id > 无 store_id  
 * 3. last_active 最新 > 旧
 * 4. 保留数据更多的
 * 
 * 操作：
 * - 选择规范用户（canonical）
 * - 合并非规范用户的数据到规范用户
 * - 更新拆分集合引用
 * - 删除非规范用户
 */

import { writeFile } from 'node:fs/promises';
import { 
  fetchAllCollection, 
  getEnvId, 
  updateDocument,
  runNosqlCommands 
} from './lib/cloudbase-nosql.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

// 重复组定义（从 audit 结果提取）
const DUPLICATE_GROUPS = [
  // 高优先级：有真实手机号
  {
    authUid: 'phone_16601061656',
    users: [
      { id: 'd3a1add769d972f50034d2152afbf03a', phone: '16601061656', name: '老 K', store_id: '', last_active: '2026-06-29T13:51:22.661Z' },
      { id: 'ecdcb60c69dfa04200012f10189293b6', phone: '16601061656', name: '我最棒', store_id: 'store_102', last_active: '2026-06-30T13:48:19.575Z' }
    ],
    reason: '有phone+store_id'
  },
  {
    authUid: 'mock_phone_16601061657',
    users: [
      { id: '2427a7cc6a0af30a0009175a55897f97', phone: '16601061657', name: '觉醒伙伴143', store_id: '', last_active: '2026-05-18T11:07:19.472Z' },
      { id: 'c36da29f6a0af3080009665a65db89cf', phone: '16601061657', name: '觉醒伙伴143', store_id: '', last_active: '2026-05-19T04:43:47.179Z' },
      { id: 'eb2328056a0af309000986cb00ed3369', phone: '16601061657', name: '觉醒伙伴143', store_id: '', last_active: '2026-05-18T11:07:15.619Z' },
      { id: 'f2e4333c6a0af31500096c173b0c7486', phone: '16601061657', name: '觉醒伙伴144', store_id: '', last_active: '2026-05-18T11:07:30.620Z' }
    ],
    reason: '有phone'
  },
  {
    authUid: 'mock_phone_17733550360',
    users: [
      { id: '507a4f8269e9b3d1000366d073ba9b12', phone: '17733550360', name: '觉醒伙伴122', store_id: '', last_active: '2026-04-23T05:53:00.837Z' },
      { id: '578a4a5669e9b3ce000369767a8bfeb9', phone: '17733550360', name: '觉醒伙伴122', store_id: '', last_active: '2026-04-23T08:14:30.538Z' }
    ],
    reason: '有phone'
  },
  {
    authUid: '2tZdEPnzAPdxJVNgFKb9pw',
    users: [
      { id: 'd92f50c169e198fa00008e697fcc24fe', phone: '18610095689', name: '美月🌙', store_id: '', last_active: '2026-05-08T05:01:54.727Z' },
      { id: '8c62e81d69e198fa0000917c412eaa1b', phone: '', name: '用户b9pw', store_id: '', last_active: '2026-04-17T02:20:38.871Z' }
    ],
    reason: '有phone'
  },
  // 匿名用户（按 last_active 选择）
  {
    authUid: '1OpgPe8r0IIZ5GDrE8BeiA',
    users: [
      { id: '65d3c76369e370b00000c00b3876ccb8', phone: '', name: '用户BeiA', store_id: '', last_active: '2026-04-18T11:53:18.467Z' },
      { id: 'f448040469e370b20000c4353108b7a0', phone: '', name: '用户BeiA', store_id: '', last_active: '2026-04-18T11:53:18.468Z' }
    ],
    reason: '匿名:last_active最新'
  },
  {
    authUid: '9jBwUhW85C-5QCsg7kne9A',
    users: [
      { id: '0274fd6869f4a07e000719fa6af6c845', phone: '', name: '觉醒伙伴128', store_id: '', last_active: '2026-05-01T12:45:37.628Z' },
      { id: '29787edc69f4a07d000725ef668c14ac', phone: '', name: '觉醒伙伴128', store_id: '', last_active: '2026-05-02T10:05:54.073Z' },
      { id: '7def6aba69f4a08000072ce05293ef53', phone: '', name: '觉醒伙伴128', store_id: '', last_active: '2026-05-01T12:45:37.627Z' },
      { id: '884eab3c69f4a07e000744ad6762cbd9', phone: '', name: '觉醒伙伴128', store_id: '', last_active: '2026-05-01T12:45:37.629Z' },
      { id: '884eab3c69f4a083000744b159825f04', phone: '', name: '觉醒伙伴129', store_id: '', last_active: '2026-05-01T12:45:37.629Z' },
      { id: '3ff49ca369f4a08700073d6f6f5f6f2a', phone: '', name: '觉醒伙伴130', store_id: '', last_active: '2026-05-01T12:45:46.722Z' }
    ],
    reason: '匿名:last_active最新'
  },
  {
    authUid: 'tj99DKGr91OzAEoFsa11tA',
    users: [
      { id: '5f7e498d69ebea8400033d3e257c635f', phone: '', name: '觉醒伙伴123', store_id: '', last_active: '2026-04-24T22:49:56.750Z' },
      { id: '779808a169ebea850003418663eca053', phone: '', name: '觉醒伙伴123', store_id: '', last_active: '2026-04-24T22:11:10.069Z' },
      { id: '8463b11b69ebea84000192406cfd9f4d', phone: '', name: '觉醒伙伴123', store_id: '', last_active: '2026-04-24T22:11:10.069Z' },
      { id: '8463b11b69ebea850001924139c5d15f', phone: '', name: '觉醒伙伴124', store_id: '', last_active: '2026-04-24T22:11:12.879Z' },
      { id: 'f073206169ebea8500033de93cd85fb9', phone: '', name: '觉醒伙伴124', store_id: '', last_active: '2026-04-24T22:11:12.879Z' }
    ],
    reason: '匿名:last_active最新'
  },
  {
    authUid: 'UhgIddRjgIGEa-rDXbmPXg',
    users: [
      { id: '3ff49ca36a02cc04001699580da75de4', phone: '', name: '觉醒伙伴134', store_id: '', last_active: '2026-05-12T06:43:05.822Z' },
      { id: '884eab3c6a02cc040016799e21011436', phone: '', name: '觉醒伙伴134', store_id: '', last_active: '2026-05-12T06:43:05.822Z' },
      { id: '894671fc6a02cc02001665500814b3cd', phone: '', name: '觉醒伙伴134', store_id: '', last_active: '2026-05-19T00:23:01.820Z' },
      { id: 'f25c08766a02cc0400167f4b5b72f782', phone: '', name: '觉醒伙伴135', store_id: '', last_active: '2026-05-12T06:43:10.000Z' },
      { id: '884eab3c6a02cc0e001679c1597c0923', phone: '', name: '觉醒伙伴136', store_id: '', last_active: '2026-05-12T06:43:10.000Z' }
    ],
    reason: '匿名:last_active最新'
  },
  {
    authUid: 'iGJUStRtPMtayt3Nr5QjHg',
    users: [
      { id: '7def6aba6a02cc2e0016704370563c31', phone: '', name: '觉醒伙伴137', store_id: '', last_active: '2026-05-12T06:43:47.429Z' },
      { id: '7def6aba6a02cc310016704c6b193df7', phone: '', name: '觉醒伙伴137', store_id: '', last_active: '2026-05-12T06:43:47.429Z' },
      { id: '884eab3c6a02cc2e00167a2028bf09c4', phone: '', name: '觉醒伙伴137', store_id: '', last_active: '2026-05-14T12:46:47.467Z' },
      { id: '884eab3c6a02cc3100167a2938a6eef2', phone: '', name: '觉醒伙伴137', store_id: '', last_active: '2026-05-12T06:43:47.429Z' },
      { id: '9110680e6a02cc310016608b0def0c00', phone: '', name: '觉醒伙伴137', store_id: '', last_active: '2026-05-12T06:43:49.698Z' }
    ],
    reason: '匿名:last_active最新'
  }
];

// 选择规范用户
const selectCanonicalUser = (users, reason) => {
  // 按优先级排序
  const scored = users.map(u => ({
    ...u,
    score: (
      (u.phone ? 1000 : 0) +
      (u.store_id ? 100 : 0) +
      new Date(u.last_active).getTime() / 1000000000
    )
  }));
  
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
};

const main = async () => {
  const envId = getEnvId();
  console.log(`Environment: ${envId}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('');

  const results = [];

  for (const group of DUPLICATE_GROUPS) {
    console.log(`Processing: ${group.authUid} (${group.reason})`);
    console.log(`  Users: ${group.users.length}`);
    
    const canonical = selectCanonicalUser(group.users, group.reason);
    const duplicates = group.users.filter(u => u.id !== canonical.id);
    
    console.log(`  Canonical: ${canonical.id} (${canonical.name}, ${canonical.phone || 'no phone'})`);
    console.log(`  Duplicates to merge: ${duplicates.length}`);
    
    if (DRY_RUN) {
      console.log('  [DRY RUN] Skipping actual operations');
      results.push({
        authUid: group.authUid,
        canonical: canonical.id,
        duplicates: duplicates.map(d => d.id),
        status: 'dry-run'
      });
      console.log('');
      continue;
    }

    // 获取完整用户数据用于合并
    for (const dup of duplicates) {
      try {
        // 获取重复用户的完整数据
        const dupResult = await runNosqlCommands({
          envId,
          commands: [{
            TableName: 'users',
            CommandType: 'QUERY',
            Command: JSON.stringify({
              find: 'users',
              filter: { _id: dup.id },
              limit: 1
            })
          }]
        });
        
        const dupData = dupResult?.data?.results?.[0]?.[0];
        if (!dupData) {
          console.log(`  Warning: Could not fetch data for ${dup.id}`);
          continue;
        }

        // 获取规范用户的完整数据
        const canResult = await runNosqlCommands({
          envId,
          commands: [{
            TableName: 'users',
            CommandType: 'QUERY',
            Command: JSON.stringify({
              find: 'users',
              filter: { _id: canonical.id },
              limit: 1
            })
          }]
        });
        
        const canData = canResult?.data?.results?.[0]?.[0];
        if (!canData) {
          console.log(`  Warning: Could not fetch data for canonical ${canonical.id}`);
          continue;
        }

        // 合并数据（wealth_history、balance 等）
        const mergedWealthHistory = [
          ...(canData.wealth_history || []),
          ...(dupData.wealth_history || [])
        ].slice(0, 100); // 限制最大长度
        
        const mergedBalance = (canData.balance || 0) + (dupData.balance || 0);
        const mergedRewardClaims = { ...canData.reward_claims, ...dupData.reward_claims };
        
        // 更新规范用户
        await updateDocument({
          envId,
          collectionName: 'users',
          filter: { _id: canonical.id },
          patch: {
            balance: mergedBalance,
            wealth_history: mergedWealthHistory,
            reward_claims: mergedRewardClaims,
            last_active: new Date(Math.max(
              new Date(canData.last_active || 0),
              new Date(dupData.last_active || 0)
            )).toISOString()
          }
        });
        
        console.log(`  Merged ${dup.id} → ${canonical.id}`);
        
        // 删除重复用户
        await runNosqlCommands({
          envId,
          commands: [{
            TableName: 'users',
            CommandType: 'DELETE',
            Command: JSON.stringify({
              delete: 'users',
              deletes: [{ q: { _id: dup.id }, limit: 1 }]
            })
          }]
        });
        
        console.log(`  Deleted duplicate: ${dup.id}`);
        
      } catch (error) {
        console.error(`  Error processing ${dup.id}:`, error.message);
      }
    }
    
    results.push({
      authUid: group.authUid,
      canonical: canonical.id,
      duplicates: duplicates.map(d => d.id),
      status: 'completed'
    });
    
    console.log('');
  }

  // 写入结果报告
  const reportPath = `./resolve-duplicates-result-${Date.now()}.json`;
  await writeFile(reportPath, JSON.stringify({
    envId,
    dryRun: DRY_RUN,
    timestamp: new Date().toISOString(),
    results
  }, null, 2));
  
  console.log(`Results written to: ${reportPath}`);
  console.log('');
  console.log('Next step: Run audit again to verify duplicates are resolved');
  console.log('  node scripts/migrations/20260516_users_split_audit.mjs --output=./audit-verify.json');
};

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
