import React, { useState, useCallback } from 'react';
import DatabaseService from '../../services/database.js';

const sectionTitleStyle = {
  fontSize: '15px', fontWeight: '600', color: '#1e293b',
  marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9'
};

const cardStyle = {
  backgroundColor: '#fff', borderRadius: '16px', padding: '24px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '24px'
};

export default function DataDiagnostic({ onClose }) {
  const [users, setUsers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [duplicates, setDuplicates] = useState(null);
  const [cleaning, setCleaning] = useState(false);

  const handleScan = useCallback(async () => {
    setLoading(true);
    setDuplicates(null);
    try {
      const allUsers = await DatabaseService.getUsers();
      setUsers(allUsers);

      // 检测手机号重复
      const phoneMap = {};
      for (const u of allUsers) {
        const phone = u.phone || '';
        if (!phone) continue;
        if (!phoneMap[phone]) phoneMap[phone] = [];
        phoneMap[phone].push(u);
      }
      const phoneDups = Object.entries(phoneMap)
        .filter(([, records]) => records.length > 1)
        .map(([phone, records]) => ({
          key: phone,
          type: 'phone',
          records: records.sort((a, b) => ((b.lastActive || '') > (a.lastActive || '') ? 1 : -1))
        }));

      // 检测 auth_uid 重复
      const authMap = {};
      for (const u of allUsers) {
        const au = u.authUid || '';
        if (!au) continue;
        if (!authMap[au]) authMap[au] = [];
        authMap[au].push(u);
      }
      const authDups = Object.entries(authMap)
        .filter(([, records]) => records.length > 1)
        .map(([au, records]) => ({
          key: au,
          type: 'auth_uid',
          records: records.sort((a, b) => ((b.lastActive || '') > (a.lastActive || '') ? 1 : -1))
        }));

      setDuplicates({ phoneDups, authDups, total: allUsers.length });
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClean = useCallback(async () => {
    if (!duplicates) return;
    if (!window.confirm(`确定清理 ${duplicates.phoneDups.length + duplicates.authDups.length} 组重复数据？此操作不可撤销。`)) return;
    setCleaning(true);
    try {
      for (const group of [...duplicates.phoneDups, ...duplicates.authDups]) {
        const [, ...dups] = group.records;
        for (const dup of dups) {
          await DatabaseService.updateUser(dup.id, { phone: '', authUid: '' });
        }
      }
      await handleScan(); // 重新扫描
      alert('✅ 清理完成');
    } catch (err) {
      console.error('Clean failed:', err);
      alert('❌ 清理失败：' + err.message);
    } finally {
      setCleaning(false);
    }
  }, [duplicates, handleScan]);

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={sectionTitleStyle}>数据诊断</div>
        <button
          style={{ padding: '4px 10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: '#f1f5f9', color: '#475569' }}
          onClick={onClose}
        >关闭</button>
      </div>

      <button
        style={{ padding: '7px 16px', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', backgroundColor: '#1e293b', color: '#fff' }}
        onClick={handleScan}
        disabled={loading}
      >
        {loading ? '扫描中...' : '🔍 扫描用户数据'}
      </button>

      {duplicates && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
            共 {duplicates.total} 个用户 | 
            手机号重复 {duplicates.phoneDups.length} 组 |
            auth_uid 重复 {duplicates.authDups.length} 组
          </div>

          {duplicates.phoneDups.length === 0 && duplicates.authDups.length === 0 && (
            <div style={{ padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '8px', color: '#15803d', fontSize: '13px' }}>
              ✅ 无重复数据
            </div>
          )}

          {[...duplicates.phoneDups, ...duplicates.authDups].map((group) => (
            <div key={group.key} style={{ marginTop: '12px', padding: '10px', backgroundColor: '#fef9c3', borderRadius: '8px', fontSize: '12px' }}>
              <div style={{ fontWeight: '600', color: '#713f12', marginBottom: '6px' }}>
                {group.type === 'phone' ? '📞' : '🔑'} 重复{group.type === 'phone' ? '手机号' : 'auth_uid'}: {group.key.slice(0, 30)} ({group.records.length}条)
              </div>
              {group.records.map((r, i) => (
                <div key={r.id} style={{ padding: '2px 0', color: i === 0 ? '#15803d' : '#991b1b', fontWeight: i === 0 ? '600' : '400' }}>
                  {i === 0 ? '✅ ' : '🗑️ '}{r.name || '未命名'} | phone:{r.phone} | authUid:{r.authUid} | last:{r.lastActive}
                </div>
              ))}
            </div>
          ))}

          {(duplicates.phoneDups.length > 0 || duplicates.authDups.length > 0) && (
            <button
              style={{ marginTop: '16px', padding: '7px 16px', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', backgroundColor: '#dc2626', color: '#fff' }}
              onClick={handleClean}
              disabled={cleaning}
            >
              {cleaning ? '清理中...' : '🗑️ 清理全部重复（清空重复记录的手机号和auth_uid）'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
