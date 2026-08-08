import React, { useState, useEffect } from 'react';
import DatabaseService from '../../services/database.js';

const cardStyle = {
  backgroundColor: '#fff',
  borderRadius: '16px',
  padding: '28px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  marginBottom: '24px'
};

const sectionTitleStyle = {
  fontSize: '15px',
  fontWeight: '600',
  color: '#1e293b',
  marginBottom: '16px',
  paddingBottom: '8px',
  borderBottom: '1px solid #f1f5f9'
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '13px',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  outline: 'none',
  boxSizing: 'border-box'
};

const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: '500',
  color: '#64748b',
  marginBottom: '4px'
};

const primaryBtnStyle = {
  padding: '7px 16px',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: '500',
  cursor: 'pointer',
  backgroundColor: '#1e293b',
  color: '#fff'
};

export default function AiSettings({ settings, saving, error, onSave }) {
  const [form, setForm] = useState({
    provider: settings.provider || 'deepseek',
    apiEndpoint: settings.apiEndpoint || 'https://api.deepseek.com',
    apiKey: settings.apiKey || '',
    model: settings.model || 'deepseek-chat',
    enabled: settings.enabled !== false
  });
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const dbSettings = await DatabaseService.getAiSettings();
        if (dbSettings) {
          setForm({
            provider: dbSettings.provider || 'deepseek',
            apiEndpoint: dbSettings.apiEndpoint || 'https://api.deepseek.com',
            apiKey: dbSettings.apiKey || '',
            model: dbSettings.model || 'deepseek-chat',
            enabled: dbSettings.enabled !== false
          });
        }
      } catch (e) {
        setLocalError('加载失败: ' + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
    setTestResult(null);
  };

  const handleSave = async () => {
    setSaved(false);
    try {
      await Promise.resolve(onSave(form));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // error handled by parent via settingsError
    }
  };

  const handleTest = async () => {
    if (!form.apiKey) return;
    setTesting(true);
    setTestResult(null);
    try {
      const apiKey = form.apiKey.replace(/[^\x20-\x7E]/g, '').trim();
      const url = form.apiEndpoint?.includes('api.deepseek.com')
        ? '/api/ai/proxy/v1/models'
        : `${(form.apiEndpoint || 'https://api.deepseek.com').replace(/\/+$/, '')}/v1/models`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      setTestResult(response.ok);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error('AI connection test failed:', response.status, text.slice(0, 200));
      }
    } catch (err) {
      console.error('AI connection test error:', err);
      setTestResult(false);
    } finally {
      setTesting(false);
    }
  };

  const renderForm = () => (
    <div style={cardStyle}>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>AI 服务商</label>
        <select value={form.provider} onChange={(e) => handleChange('provider', e.target.value)} style={inputStyle}>
          <option value="deepseek">DeepSeek</option>
          <option value="openai">OpenAI</option>
          <option value="custom">自定义</option>
        </select>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>API 地址</label>
        <input value={form.apiEndpoint} onChange={(e) => handleChange('apiEndpoint', e.target.value)} style={inputStyle} placeholder="https://api.deepseek.com" />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>API Key</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input type={showKey ? 'text' : 'password'} value={form.apiKey} onChange={(e) => handleChange('apiKey', e.target.value)} style={inputStyle} placeholder="sk-..." />
          <button style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setShowKey((s) => !s)}>
            {showKey ? '隐藏' : '显示'}
          </button>
        </div>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>模型名称</label>
        <input value={form.model} onChange={(e) => handleChange('model', e.target.value)} style={inputStyle} placeholder="deepseek-chat" />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.enabled} onChange={(e) => handleChange('enabled', e.target.checked)} style={{ accentColor: '#6366f1' }} />
          启用 AI 功能
        </label>
      </div>
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={primaryBtnStyle} onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存设置'}
          </button>
          <button style={{ padding: '7px 16px', border: '1px solid #818cf8', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', backgroundColor: '#eef2ff', color: '#4338ca' }} onClick={handleTest} disabled={testing || !form.apiKey}>
            {testing ? '测试中...' : '测试连接'}
          </button>
          {saved && (<span style={{ marginLeft: '8px', fontSize: '12px', color: '#16a34a' }}>✅ 保存成功</span>)}
          {testResult !== null && (<span style={{ marginLeft: '8px', fontSize: '12px', color: testResult ? '#16a34a' : '#dc2626' }}>{testResult ? '✅ 连接成功' : '❌ 连接失败'}</span>)}
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>设置将存储到云端数据库</span>
        </div>
      </div>
      {!form.apiKey && (<div style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: '#fef9c3', borderRadius: '8px', fontSize: '12px', color: '#713f12' }}>⚠️ 请填写 API Key 以启用 AI 仿写功能</div>)}
    </div>
  );

  return (
    <div>
      <div style={sectionTitleStyle}>人工智能设置</div>
      {error && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: '#991b1b', marginBottom: '16px' }}>
          {error}
        </div>
      )}
      {localError && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: '#991b1b', marginBottom: '16px' }}>
          {localError}
        </div>
      )}
      {loading ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>加载中...</div>
      ) : (
        renderForm()
      )}
    </div>
  );
}
