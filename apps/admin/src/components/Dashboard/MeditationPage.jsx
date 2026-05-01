import React, { useState, useCallback } from 'react';
import { uploadAudioFile } from '../../utils/audioUpload.js';
import { synthesizeSpeech, blobUrlToFile } from '../../utils/ttsService.js';
import { MEDITATION_AUDIO_LIBRARY_TYPES } from '../../services/database.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_LABELS = {
  bowl: '颂钵库',
  greeting: '问候库',
  nature: '自然库',
  breath: '呼吸库',
  quote: '心语库',
  goodbye: '告别库'
};

const SESSION_LABELS = {
  morning: '早课',
  noon: '午课',
  afternoon: '下午课',
  evening: '晚课'
};

const SUB_TABS = [
  { key: 'library', label: '音频库' },
  { key: 'presets', label: '冥想库' },
  { key: 'composition', label: '冥想设置' },
  { key: 'calendar', label: '冥想日历' }
];

// ─── Shared Styles ────────────────────────────────────────────────────────────

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

const pillBtnStyle = (active) => ({
  padding: '6px 16px',
  borderRadius: '20px',
  border: 'none',
  fontSize: '13px',
  fontWeight: active ? '600' : '400',
  cursor: 'pointer',
  backgroundColor: active ? '#1e293b' : '#f1f5f9',
  color: active ? '#fff' : '#64748b',
  transition: 'all 0.15s'
});

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

const dangerBtnStyle = {
  padding: '5px 12px',
  border: '1px solid #fca5a5',
  borderRadius: '6px',
  fontSize: '12px',
  cursor: 'pointer',
  backgroundColor: '#fff5f5',
  color: '#dc2626'
};

const ghostBtnStyle = {
  padding: '5px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  fontSize: '12px',
  cursor: 'pointer',
  backgroundColor: '#fff',
  color: '#475569'
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const formatSeconds = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// ─── AudioLibrarySection ─────────────────────────────────────────────────────

const AudioLibrarySection = ({ type, items, onSaveItem, onDeleteItem }) => {
  const [expanded, setExpanded] = useState(false);
  const [addMode, setAddMode] = useState(null); // 'file' | 'tts'
  const [editingId, setEditingId] = useState(null);

  // File upload form state
  const [fileForm, setFileForm] = useState({ title: '', file: null, duration: '' });
  const [fileUploading, setFileUploading] = useState(false);
  const [fileError, setFileError] = useState('');

  // TTS form state
  const [ttsForm, setTtsForm] = useState({ ttsText: '', isSSML: false });
  const [ttsSubmitting, setTtsSubmitting] = useState(false);
  const [ttsError, setTtsError] = useState('');

  // Edit form state
  const [editForm, setEditForm] = useState({});

  // Audio playback state
  const audioRef = React.useRef(null);
  const manualAudioInputRef = React.useRef(null);
  const pendingManualUploadItemRef = React.useRef(null);
  const [playingId, setPlayingId] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);
  const [uploadingAudioId, setUploadingAudioId] = useState(null);
  const [itemFeedbackMap, setItemFeedbackMap] = useState({});

  const typeItems = items.filter((item) => item.type === type);

  const handleFileUpload = async () => {
    setFileError('');
    if (!fileForm.title.trim()) { setFileError('请填写标题'); return; }
    if (!fileForm.file) { setFileError('请选择音频文件'); return; }
    setFileUploading(true);
    try {
      const cloudPath = `meditation-audio/${type}/${generateId()}-${fileForm.file.name}`;
      const { fileId, audioUrl } = await uploadAudioFile({ file: fileForm.file, cloudPath });
      const newItem = {
        id: generateId(),
        type,
        title: fileForm.title.trim(),
        fileId,
        audioUrl,
        duration: Number(fileForm.duration) || 0,
        ttsText: '',
        createdAt: new Date().toISOString()
      };
      await onSaveItem(newItem, null);
      setFileForm({ title: '', file: null, duration: '' });
      setAddMode(null);
    } catch (err) {
      setFileError(err.message || '上传失败');
    } finally {
      setFileUploading(false);
    }
  };

  const handleTtsSubmit = async () => {
    setTtsError('');
    if (!ttsForm.ttsText.trim()) { setTtsError('请填写朗读文本'); return; }
    setTtsSubmitting(true);
    try {
      const text = ttsForm.ttsText.trim();
      const newItem = {
        id: generateId(),
        type,
        title: text.replace(/<[^>]+>/g, '').slice(0, 20),
        fileId: '',
        audioUrl: '',
        duration: 0,
        ttsText: text,
        createdAt: new Date().toISOString()
      };
      await onSaveItem(newItem, null);
      setTtsForm({ ttsText: '', isSSML: false });
      setAddMode(null);
    } catch (err) {
      setTtsError(err.message || '提交失败');
    } finally {
      setTtsSubmitting(false);
    }
  };

  const handleGenerateAudio = async (item) => {
    setGeneratingId(item.id);
    setItemFeedbackMap((currentMap) => ({
      ...currentMap,
      [item.id]: null
    }));
    try {
      const blobUrl = await synthesizeSpeech(item.ttsText);
      const file = await blobUrlToFile(blobUrl, `${item.id}.mp3`);
      const cloudPath = `meditation-audio/${item.type}/${item.id}.mp3`;
      const { fileId, audioUrl } = await uploadAudioFile({ file, cloudPath });
      await onSaveItem({ ...item, fileId, audioUrl }, item.id);
      URL.revokeObjectURL(blobUrl);
      setItemFeedbackMap((currentMap) => ({
        ...currentMap,
        [item.id]: {
          type: 'success',
          text: '音频已生成并上传。'
        }
      }));
    } catch (err) {
      setItemFeedbackMap((currentMap) => ({
        ...currentMap,
        [item.id]: {
          type: 'error',
          text: err.userMessage || err.message || '音频生成失败。'
        }
      }));
    } finally {
      setGeneratingId(null);
    }
  };

  const handleOpenManualUpload = (item) => {
    pendingManualUploadItemRef.current = item;
    manualAudioInputRef.current?.click();
  };

  const handleManualAudioSelected = async (event) => {
    const file = event.target.files?.[0] || null;
    const targetItem = pendingManualUploadItemRef.current;
    event.target.value = '';

    if (!file || !targetItem) {
      pendingManualUploadItemRef.current = null;
      return;
    }

    setUploadingAudioId(targetItem.id);
    setItemFeedbackMap((currentMap) => ({
      ...currentMap,
      [targetItem.id]: null
    }));

    try {
      const cloudPath = `meditation-audio/${targetItem.type}/${targetItem.id}-${file.name}`;
      const { fileId, audioUrl } = await uploadAudioFile({ file, cloudPath });
      await onSaveItem({ ...targetItem, fileId, audioUrl }, targetItem.id);
      setItemFeedbackMap((currentMap) => ({
        ...currentMap,
        [targetItem.id]: {
          type: 'success',
          text: '音频已上传。'
        }
      }));
    } catch (err) {
      setItemFeedbackMap((currentMap) => ({
        ...currentMap,
        [targetItem.id]: {
          type: 'error',
          text: err.message || '音频上传失败。'
        }
      }));
    } finally {
      pendingManualUploadItemRef.current = null;
      setUploadingAudioId(null);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({ title: item.title, duration: String(item.duration || ''), ttsText: item.ttsText || '' });
  };

  const handleSaveEdit = async (item) => {
    const isTts = !!item.ttsText;
    const title = isTts ? (editForm.ttsText || '').trim().slice(0, 20) : editForm.title.trim();
    await onSaveItem({ ...item, title, duration: Number(editForm.duration) || 0, ttsText: editForm.ttsText }, item.id);
    setEditingId(null);
  };

  const handlePlayToggle = (item) => {
    if (playingId === item.id) {
      audioRef.current && audioRef.current.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(item.audioUrl);
      audioRef.current.onended = () => setPlayingId(null);
      audioRef.current.play();
      setPlayingId(item.id);
    }
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px' }}>
      {/* Header */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', backgroundColor: '#f8fafc', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{TYPE_LABELS[type]}</span>
          <span style={{ fontSize: '12px', color: '#94a3b8', backgroundColor: '#e2e8f0', padding: '2px 8px', borderRadius: '10px' }}>{typeItems.length} 条</span>
        </div>
        <span style={{ color: '#94a3b8', fontSize: '12px' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '16px 18px' }}>
          <input
            ref={manualAudioInputRef}
            type="file"
            accept="audio/*"
            onChange={handleManualAudioSelected}
            style={{ display: 'none' }}
          />
          {/* Item list */}
          {typeItems.length === 0 && (
            <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '12px' }}>暂无音频，请添加</div>
          )}
          {typeItems.map((item) => (
            <div key={item.id} style={{ border: '1px solid #f1f5f9', borderRadius: '8px', padding: '12px', marginBottom: '8px', backgroundColor: '#fafafa' }}>
              {editingId === item.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {!item.ttsText && (
                    <div>
                      <label style={labelStyle}>标题</label>
                      <input style={inputStyle} value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} />
                    </div>
                  )}
                  <div>
                    <label style={labelStyle}>时长（秒）</label>
                    <input style={inputStyle} type="number" value={editForm.duration} onChange={(e) => setEditForm((f) => ({ ...f, duration: e.target.value }))} />
                  </div>
                  {!!item.ttsText && (
                    <div>
                      <label style={labelStyle}>朗读文本（标题自动取前20字）</label>
                      <textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} value={editForm.ttsText} onChange={(e) => setEditForm((f) => ({ ...f, ttsText: e.target.value }))} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={primaryBtnStyle} onClick={() => handleSaveEdit(item)}>保存</button>
                    <button style={ghostBtnStyle} onClick={() => setEditingId(null)}>取消</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{item.title}</div>
                      {item.duration > 0 && (
                        <span style={{ fontSize: '11px', color: '#fff', backgroundColor: '#6366f1', borderRadius: '10px', padding: '1px 7px', fontWeight: '600', flexShrink: 0 }}>
                          {formatSeconds(item.duration)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                      {item.ttsText ? 'TTS文本' : '音频文件'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {item.ttsText && !item.audioUrl && (
                      <>
                        <button
                          style={{ padding: '4px 10px', border: '1px solid #a7f3d0', borderRadius: '6px', fontSize: '12px', cursor: generatingId === item.id ? 'wait' : 'pointer', backgroundColor: '#f0fdf4', color: '#15803d' }}
                          onClick={() => handleGenerateAudio(item)}
                          disabled={!!generatingId || !!uploadingAudioId}
                          title="调用腾讯TTS生成音频并上传"
                        >
                          {generatingId === item.id ? '生成中...' : '⚡ 生成音频'}
                        </button>
                        <button
                          style={ghostBtnStyle}
                          onClick={() => handleOpenManualUpload(item)}
                          disabled={!!generatingId || !!uploadingAudioId}
                          title="手动上传已有音频文件"
                        >
                          {uploadingAudioId === item.id ? '上传中...' : '补传音频'}
                        </button>
                      </>
                    )}
                    {item.audioUrl && (
                      <button
                        style={{ padding: '4px 10px', border: '1px solid #c7d2fe', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', backgroundColor: playingId === item.id ? '#e0e7ff' : '#fff', color: '#4f46e5' }}
                        onClick={() => handlePlayToggle(item)}
                        title={playingId === item.id ? '暂停' : '试听'}
                      >
                        {playingId === item.id ? '⏸' : '▶'}
                      </button>
                    )}
                    <button style={ghostBtnStyle} onClick={() => startEdit(item)}>编辑</button>
                    <button style={dangerBtnStyle} onClick={() => onDeleteItem(item.id)}>删除</button>
                  </div>
                </div>
              )}
              {itemFeedbackMap[item.id]?.text && (
                <div
                  style={{
                    marginTop: '10px',
                    fontSize: '12px',
                    lineHeight: 1.6,
                    color: itemFeedbackMap[item.id].type === 'error' ? '#b91c1c' : '#166534'
                  }}
                >
                  {itemFeedbackMap[item.id].text}
                </div>
              )}
            </div>
          ))}

          {/* Add buttons */}
          {addMode === null && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button style={ghostBtnStyle} onClick={() => setAddMode('file')}>+ 上传音频文件</button>
              <button style={ghostBtnStyle} onClick={() => setAddMode('tts')}>+ AI TTS 文本</button>
            </div>
          )}

          {/* File upload form */}
          {addMode === 'file' && (
            <div style={{ border: '1px dashed #c7d2fe', borderRadius: '8px', padding: '14px', marginTop: '10px', backgroundColor: '#f5f3ff' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={labelStyle}>标题 *</label>
                  <input style={inputStyle} value={fileForm.title} onChange={(e) => setFileForm((f) => ({ ...f, title: e.target.value }))} placeholder="输入音频标题" />
                </div>
                <div>
                  <label style={labelStyle}>音频文件 *</label>
                  <input
                    type="file"
                    accept="audio/*"
                    style={{ fontSize: '13px', color: '#475569' }}
                    onChange={(e) => setFileForm((f) => ({ ...f, file: e.target.files[0] || null }))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>时长（秒，可选）</label>
                  <input style={inputStyle} type="number" value={fileForm.duration} onChange={(e) => setFileForm((f) => ({ ...f, duration: e.target.value }))} placeholder="0" />
                </div>
                {fileError && <div style={{ color: '#dc2626', fontSize: '12px' }}>{fileError}</div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={primaryBtnStyle} onClick={handleFileUpload} disabled={fileUploading}>
                    {fileUploading ? '上传中...' : '上传'}
                  </button>
                  <button style={ghostBtnStyle} onClick={() => { setAddMode(null); setFileError(''); }}>取消</button>
                </div>
              </div>
            </div>
          )}

          {/* TTS form */}
          {addMode === 'tts' && (
            <div style={{ border: '1px dashed #a7f3d0', borderRadius: '8px', padding: '14px', marginTop: '10px', backgroundColor: '#f0fdf4' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={labelStyle}>朗读文本 *（标题自动取前20字）</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#475569', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={ttsForm.isSSML}
                      onChange={(e) => setTtsForm((f) => ({ ...f, isSSML: e.target.checked, ttsText: e.target.checked ? '<speak>\n  \n</speak>' : '' }))}
                    />
                    SSML 格式
                  </label>
                </div>
                <textarea
                  style={{ ...inputStyle, minHeight: ttsForm.isSSML ? '120px' : '80px', resize: 'vertical', fontFamily: ttsForm.isSSML ? 'monospace' : 'inherit' }}
                  value={ttsForm.ttsText}
                  onChange={(e) => setTtsForm((f) => ({ ...f, ttsText: e.target.value }))}
                  placeholder={ttsForm.isSSML
                    ? '<speak>\n  你好，欢迎开始今天的冥想练习。\n  <break time="1s"/>\n  请闭上眼睛。\n</speak>'
                    : '输入需要 AI TTS 转换的文字内容'}
                />
                {ttsError && <div style={{ color: '#dc2626', fontSize: '12px' }}>{ttsError}</div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button style={primaryBtnStyle} onClick={handleTtsSubmit} disabled={ttsSubmitting}>
                    {ttsSubmitting ? '提交中...' : '保存'}
                  </button>
                  <button style={ghostBtnStyle} onClick={() => { setAddMode(null); setTtsError(''); }}>取消</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── AudioLibraryTab ──────────────────────────────────────────────────────────

const AudioLibraryTab = ({ library, saving, onUpdate }) => {
  const handleSaveItem = useCallback(async (item, replacingId) => {
    const currentItems = library.items || [];
    let nextItems;
    if (replacingId) {
      nextItems = currentItems.map((i) => (i.id === replacingId ? item : i));
    } else {
      nextItems = [...currentItems, item];
    }
    await onUpdate({ ...library, items: nextItems });
  }, [library, onUpdate]);

  const handleDeleteItem = useCallback(async (itemId) => {
    const nextItems = (library.items || []).filter((i) => i.id !== itemId);
    await onUpdate({ ...library, items: nextItems });
  }, [library, onUpdate]);

  return (
    <div>
      <div style={sectionTitleStyle}>六大音频库管理</div>
      {saving && <div style={{ color: '#6366f1', fontSize: '12px', marginBottom: '12px' }}>保存中...</div>}
      {MEDITATION_AUDIO_LIBRARY_TYPES.map((type) => (
        <AudioLibrarySection
          key={type}
          type={type}
          items={library.items || []}
          onSaveItem={handleSaveItem}
          onDeleteItem={handleDeleteItem}
        />
      ))}
    </div>
  );
};

// ─── MeditationPresetsTab ─────────────────────────────────────────────────────

const SECTION_LABELS = {
  bowl: '颂钵',
  greeting: '问候',
  nature: '自然',
  breath: '呼吸',
  quote: '心语',
  goodbye: '告别'
};

const PresetSectionPicker = ({ sectionType, selectedIds, audioItems, onChange }) => {
  const typeItems = audioItems.filter((i) => i.type === sectionType);
  const [showPicker, setShowPicker] = useState(false);

  const toggleItem = (itemId) => {
    const next = selectedIds.includes(itemId)
      ? selectedIds.filter((id) => id !== itemId)
      : [...selectedIds, itemId];
    onChange(next);
  };

  const selectedItems = selectedIds.map((id) => typeItems.find((i) => i.id === id)).filter(Boolean);

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: '500', color: '#475569' }}>{SECTION_LABELS[sectionType]}</span>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
          {selectedIds.length === 0 ? '未选择' : selectedIds.length === 1 ? '固定' : `${selectedIds.length}条随机`}
        </span>
      </div>

      {/* Selected items display */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
        {selectedItems.map((item) => (
          <span
            key={item.id}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '3px 10px', borderRadius: '14px', fontSize: '12px',
              backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe'
            }}
          >
            {item.title}
            <span
              onClick={() => onChange(selectedIds.filter((id) => id !== item.id))}
              style={{ cursor: 'pointer', color: '#93c5fd', fontWeight: '600' }}
            >×</span>
          </span>
        ))}
      </div>

      <button style={ghostBtnStyle} onClick={() => setShowPicker((v) => !v)}>
        {showPicker ? '收起' : `+ 从${TYPE_LABELS[sectionType]}选择`}
      </button>

      {showPicker && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', marginTop: '6px', maxHeight: '200px', overflowY: 'auto', backgroundColor: '#fafafa' }}>
          {typeItems.length === 0 && (
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>该类型暂无音频，请先在音频库添加</div>
          )}
          {typeItems.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <label
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                  cursor: 'pointer', borderRadius: '6px',
                  backgroundColor: checked ? '#eff6ff' : 'transparent'
                }}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleItem(item.id)} />
                <span style={{ fontSize: '13px', color: '#1e293b' }}>{item.title}</span>
                {item.duration > 0 && (
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{formatSeconds(item.duration)}</span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

const MeditationPresetsTab = ({ meditationLibrary, audioLibrary, saving, onUpdate }) => {
  const meditations = meditationLibrary.meditations || [];
  const audioItems = audioLibrary.items || [];
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', sections: {} });

  const startCreate = () => {
    setEditingId('__new__');
    setEditForm({
      name: '',
      sections: { bowl: [], greeting: [], nature: [], breath: [], quote: [], goodbye: [] }
    });
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      sections: {
        bowl: [...(item.sections.bowl || [])],
        greeting: [...(item.sections.greeting || [])],
        nature: [...(item.sections.nature || [])],
        breath: [...(item.sections.breath || [])],
        quote: [...(item.sections.quote || [])],
        goodbye: [...(item.sections.goodbye || [])]
      }
    });
  };

  const handleSave = async () => {
    if (!editForm.name.trim()) return;
    let nextMeditations;
    if (editingId === '__new__') {
      nextMeditations = [...meditations, { id: generateId(), name: editForm.name.trim(), sections: editForm.sections }];
    } else {
      nextMeditations = meditations.map((m) =>
        m.id === editingId ? { ...m, name: editForm.name.trim(), sections: editForm.sections } : m
      );
    }
    await onUpdate({ ...meditationLibrary, meditations: nextMeditations });
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    const nextMeditations = meditations.filter((m) => m.id !== id);
    await onUpdate({ ...meditationLibrary, meditations: nextMeditations });
    setEditingId(null);
  };

  const updateSection = (sectionType, ids) => {
    setEditForm((f) => ({ ...f, sections: { ...f.sections, [sectionType]: ids } }));
  };

  const getSummary = (item) => {
    const filled = MEDITATION_AUDIO_LIBRARY_TYPES.filter((t) => (item.sections[t] || []).length > 0);
    return filled.map((t) => {
      const count = item.sections[t].length;
      return `${SECTION_LABELS[t]}${count > 1 ? `×${count}` : ''}`;
    }).join(' · ');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={sectionTitleStyle}>冥想库管理</div>
        {saving && <span style={{ fontSize: '12px', color: '#6366f1' }}>保存中...</span>}
      </div>
      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '18px' }}>
        每条冥想由六类音频组合而成。选择多条音频时，运行时随机选取一条。
      </div>

      {/* Preset list */}
      {meditations.length === 0 && !editingId && (
        <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>暂无冥想，请添加</div>
      )}
      {meditations.map((item) => (
        <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', marginBottom: '10px', backgroundColor: editingId === item.id ? '#f8fafc' : '#fff' }}>
          {editingId === item.id ? (
            <div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>冥想名称</label>
                <input
                  style={inputStyle}
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="输入冥想名称"
                />
              </div>
              {MEDITATION_AUDIO_LIBRARY_TYPES.map((t) => (
                <PresetSectionPicker
                  key={t}
                  sectionType={t}
                  selectedIds={editForm.sections[t] || []}
                  audioItems={audioItems}
                  onChange={(ids) => updateSection(t, ids)}
                />
              ))}
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <button style={primaryBtnStyle} onClick={handleSave}>保存</button>
                <button style={dangerBtnStyle} onClick={() => handleDelete(item.id)}>删除</button>
                <button style={ghostBtnStyle} onClick={() => setEditingId(null)}>取消</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b', marginBottom: '3px' }}>{item.name}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{getSummary(item) || '未配置音频'}</div>
              </div>
              <button style={ghostBtnStyle} onClick={() => startEdit(item)}>编辑</button>
            </div>
          )}
        </div>
      ))}

      {/* New preset form */}
      {editingId === '__new__' && (
        <div style={{ border: '1px dashed #c7d2fe', borderRadius: '10px', padding: '16px', backgroundColor: '#f5f3ff', marginBottom: '10px' }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>冥想名称</label>
            <input
              style={inputStyle}
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="输入冥想名称"
            />
          </div>
          {MEDITATION_AUDIO_LIBRARY_TYPES.map((t) => (
            <PresetSectionPicker
              key={t}
              sectionType={t}
              selectedIds={editForm.sections[t] || []}
              audioItems={audioItems}
              onChange={(ids) => updateSection(t, ids)}
            />
          ))}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button style={primaryBtnStyle} onClick={handleSave}>添加</button>
            <button style={ghostBtnStyle} onClick={() => setEditingId(null)}>取消</button>
          </div>
        </div>
      )}

      {!editingId && (
        <button style={{ ...ghostBtnStyle, marginTop: '8px' }} onClick={startCreate}>+ 新增冥想</button>
      )}
    </div>
  );
};

// ─── CompositionTab ───────────────────────────────────────────────────────────

const TOTAL_SECONDS = 900; // 15 minutes
const TRACK_HEIGHT = 40;
const TRACK_GAP = 6;
const LABEL_WIDTH = 68;
const RULER_HEIGHT = 24;

// One fixed track per type (10 tracks: bowl + greeting + nature×4 + breath + quote + goodbye)
// Track index → { type, label, trackLabel }
const TRACKS = [
  { type: 'bowl',     label: '颂钵库',  color: '#7c3aed', bg: '#ede9fe' },
  { type: 'greeting', label: '问候库',  color: '#0369a1', bg: '#e0f2fe' },
  { type: 'nature',   label: '自然库①', color: '#15803d', bg: '#dcfce7' },
  { type: 'nature',   label: '自然库②', color: '#15803d', bg: '#dcfce7' },
  { type: 'nature',   label: '自然库③', color: '#15803d', bg: '#dcfce7' },
  { type: 'nature',   label: '自然库④', color: '#15803d', bg: '#dcfce7' },
  { type: 'breath',   label: '呼吸库',  color: '#b45309', bg: '#fef3c7' },
  { type: 'quote',    label: '心语库',  color: '#be185d', bg: '#fce7f3' },
  { type: 'goodbye',  label: '告别库',  color: '#475569', bg: '#f1f5f9' },
];

// Assign each segment to a track index. nature segments fill nature tracks in order.
const assignTracksToSegments = (segments) => {
  // Sort by startSeconds first
  const sorted = [...segments].sort((a, b) => a.startSeconds - b.startSeconds);
  const result = [];
  let natureIdx = 0;
  for (const seg of sorted) {
    let trackIdx;
    if (seg.type === 'nature') {
      trackIdx = 2 + (natureIdx % 4);
      natureIdx++;
    } else {
      trackIdx = TRACKS.findIndex((t) => t.type === seg.type);
    }
    result.push({ seg, trackIdx });
  }
  return result;
};

// Ruler tick marks: every minute label, minor ticks every 30s
const RULER_TICKS = Array.from({ length: 16 }, (_, i) => i * 60); // 0,60,120,...,900

const CompositionTab = ({ settings, library, saving, onUpdate }) => {
  const segments = settings.segments || [];
  const [selectedId, setSelectedId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [addMode, setAddMode] = useState(false);
  const [addForm, setAddForm] = useState({ type: 'bowl', startSeconds: '0', durationSeconds: '30' });

  const itemsByType = useCallback((type) => (library.items || []).filter((i) => i.type === type), [library]);

  const assigned = assignTracksToSegments(segments);
  const selectedSeg = segments.find((s) => s.id === selectedId) || null;

  const openEdit = (seg) => {
    setSelectedId(seg.id);
    setAddMode(false);
    setEditForm({
      type: seg.type,
      startSeconds: String(seg.startSeconds),
      durationSeconds: String(seg.durationSeconds),
    });
  };

  const closePanel = () => { setSelectedId(null); setAddMode(false); };

  const handleSaveEdit = async () => {
    const nextSegments = segments.map((s) =>
      s.id === selectedId
        ? { ...s, type: editForm.type, startSeconds: Number(editForm.startSeconds) || 0, durationSeconds: Number(editForm.durationSeconds) || 0 }
        : s
    );
    await onUpdate({ ...settings, segments: nextSegments });
    setSelectedId(null);
  };

  const handleDelete = async (segId) => {
    await onUpdate({ ...settings, segments: segments.filter((s) => s.id !== segId) });
    setSelectedId(null);
  };

  const handleAdd = async () => {
    const newSeg = {
      id: generateId(),
      type: addForm.type,
      startSeconds: Number(addForm.startSeconds) || 0,
      durationSeconds: Number(addForm.durationSeconds) || 30,
    };
    await onUpdate({ ...settings, segments: [...segments, newSeg] });
    setAddMode(false);
    setAddForm({ type: 'bowl', startSeconds: '0', durationSeconds: '30' });
  };

  // px per second in the timeline area
  // We render relative via percentages so this is just for reference
  const pct = (secs) => `${(secs / TOTAL_SECONDS) * 100}%`;

  const totalHeight = TRACKS.length * (TRACK_HEIGHT + TRACK_GAP);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={sectionTitleStyle}>冥想时间轴设置</div>
        {saving && <span style={{ fontSize: '12px', color: '#6366f1' }}>保存中...</span>}
      </div>
      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '18px' }}>
        点击时间轴上的色块可编辑；点击空白处新增片段。共 10 条音轨，15 分钟总时长。
      </div>

      {/* ── Timeline ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', userSelect: 'none' }}>
        {/* Track labels column */}
        <div style={{ width: LABEL_WIDTH, flexShrink: 0, paddingTop: RULER_HEIGHT }}>
          {TRACKS.map((track, idx) => (
            <div
              key={idx}
              style={{
                height: TRACK_HEIGHT,
                marginBottom: TRACK_GAP,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingRight: '8px'
              }}
            >
              <span style={{ fontSize: '11px', color: track.color, fontWeight: '600', whiteSpace: 'nowrap' }}>
                {track.label}
              </span>
            </div>
          ))}
        </div>

        {/* Timeline area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Ruler */}
          <div style={{ position: 'relative', height: RULER_HEIGHT, borderBottom: '1px solid #e2e8f0', marginBottom: 0 }}>
            {RULER_TICKS.map((secs) => (
              <div
                key={secs}
                style={{
                  position: 'absolute',
                  left: pct(secs),
                  top: 0,
                  transform: secs === 0 ? 'none' : secs === TOTAL_SECONDS ? 'translateX(-100%)' : 'translateX(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  pointerEvents: 'none'
                }}
              >
                <span style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '14px' }}>
                  {secs === 0 ? '0s' : `${secs / 60}min`}
                </span>
                <div style={{ width: '1px', height: '6px', backgroundColor: '#cbd5e1' }} />
              </div>
            ))}
            {/* Minor ticks every 30s */}
            {Array.from({ length: 30 }, (_, i) => (i + 1) * 30).filter((s) => s % 60 !== 0 && s < TOTAL_SECONDS).map((secs) => (
              <div
                key={`m${secs}`}
                style={{
                  position: 'absolute',
                  left: pct(secs),
                  bottom: 0,
                  transform: 'translateX(-50%)',
                  width: '1px',
                  height: '4px',
                  backgroundColor: '#e2e8f0',
                  pointerEvents: 'none'
                }}
              />
            ))}
          </div>

          {/* Track rows */}
          <div style={{ position: 'relative', height: totalHeight }}>
            {/* Grid lines */}
            {RULER_TICKS.map((secs) => (
              <div
                key={`grid-${secs}`}
                style={{
                  position: 'absolute',
                  left: pct(secs),
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  backgroundColor: secs === 0 || secs === TOTAL_SECONDS ? '#cbd5e1' : '#f1f5f9',
                  pointerEvents: 'none'
                }}
              />
            ))}

            {/* Track backgrounds — clickable to add */}
            {TRACKS.map((track, idx) => (
              <div
                key={`track-bg-${idx}`}
                onClick={() => {
                  setSelectedId(null);
                  setAddMode(true);
                  setAddForm((f) => ({ ...f, type: track.type, startSeconds: '0', durationSeconds: '30' }));
                }}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: idx * (TRACK_HEIGHT + TRACK_GAP),
                  height: TRACK_HEIGHT,
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  cursor: 'copy',
                  border: '1px solid #f1f5f9'
                }}
              />
            ))}

            {/* Segment blocks */}
            {assigned.map(({ seg, trackIdx }) => {
              const track = TRACKS[trackIdx];
              const isSelected = seg.id === selectedId;
              const topPx = trackIdx * (TRACK_HEIGHT + TRACK_GAP);
              const leftPct = pct(seg.startSeconds);
              const widthPct = `${(seg.durationSeconds / TOTAL_SECONDS) * 100}%`;
              const audioItem = itemsByType(seg.type).find((i) => i.id === seg.audioItemId);
              return (
                <div
                  key={seg.id}
                  onClick={(e) => { e.stopPropagation(); openEdit(seg); }}
                  title={`${track.label}  ${formatSeconds(seg.startSeconds)} → ${formatSeconds(seg.startSeconds + seg.durationSeconds)}`}
                  style={{
                    position: 'absolute',
                    left: leftPct,
                    width: widthPct,
                    top: topPx + 2,
                    height: TRACK_HEIGHT - 4,
                    backgroundColor: track.bg,
                    border: `2px solid ${isSelected ? track.color : track.color + '88'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: '6px',
                    boxSizing: 'border-box',
                    boxShadow: isSelected ? `0 0 0 2px ${track.color}44` : 'none',
                    zIndex: isSelected ? 2 : 1
                  }}
                >
                  <span style={{ fontSize: '10px', fontWeight: '600', color: track.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {audioItem ? audioItem.title : formatSeconds(seg.durationSeconds)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Edit / Add Panel ──────────────────────────────────────── */}
      {(selectedSeg || addMode) && (
        <div style={{ marginTop: '20px', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px', backgroundColor: '#f8fafc' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', marginBottom: '14px' }}>
            {addMode ? '新增片段' : `编辑片段 — ${TYPE_LABELS[(selectedSeg || {}).type]}`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>音频类型</label>
              <select
                style={inputStyle}
                value={addMode ? addForm.type : editForm.type}
                onChange={(e) => addMode
                  ? setAddForm((f) => ({ ...f, type: e.target.value }))
                  : setEditForm((f) => ({ ...f, type: e.target.value }))
                }
              >
                {MEDITATION_AUDIO_LIBRARY_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>开始（秒）</label>
              <input
                style={inputStyle}
                type="number"
                min="0"
                max={TOTAL_SECONDS}
                value={addMode ? addForm.startSeconds : editForm.startSeconds}
                onChange={(e) => addMode
                  ? setAddForm((f) => ({ ...f, startSeconds: e.target.value }))
                  : setEditForm((f) => ({ ...f, startSeconds: e.target.value }))
                }
              />
            </div>
            <div>
              <label style={labelStyle}>时长（秒）</label>
              <input
                style={inputStyle}
                type="number"
                min="1"
                value={addMode ? addForm.durationSeconds : editForm.durationSeconds}
                onChange={(e) => addMode
                  ? setAddForm((f) => ({ ...f, durationSeconds: e.target.value }))
                  : setEditForm((f) => ({ ...f, durationSeconds: e.target.value }))
                }
              />
            </div>
            <div>
              <label style={labelStyle}>结束时间</label>
              <div style={{ padding: '8px 12px', fontSize: '13px', color: '#475569', backgroundColor: '#f1f5f9', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                {formatSeconds(
                  (Number(addMode ? addForm.startSeconds : editForm.startSeconds) || 0) +
                  (Number(addMode ? addForm.durationSeconds : editForm.durationSeconds) || 0)
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {addMode ? (
              <>
                <button style={primaryBtnStyle} onClick={handleAdd}>添加</button>
                <button style={ghostBtnStyle} onClick={closePanel}>取消</button>
              </>
            ) : (
              <>
                <button style={primaryBtnStyle} onClick={handleSaveEdit}>保存</button>
                <button style={dangerBtnStyle} onClick={() => handleDelete(selectedId)}>删除</button>
                <button style={ghostBtnStyle} onClick={closePanel}>取消</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add button when no panel open */}
      {!selectedSeg && !addMode && (
        <button
          style={{ ...ghostBtnStyle, marginTop: '16px' }}
          onClick={() => { setAddMode(true); setAddForm({ type: 'bowl', startSeconds: '0', durationSeconds: '30' }); }}
        >
          + 新增片段
        </button>
      )}
    </div>
  );
};

// ─── CalendarTab ──────────────────────────────────────────────────────────────

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const CalendarTab = ({ calendar, meditationLibrary, saving, onUpdate }) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [editingDate, setEditingDate] = useState(null);
  const [editForm, setEditForm] = useState({ morning: [], noon: [], afternoon: [], evening: [] });

  const days = calendar.days || {};
  const presets = meditationLibrary.meditations || [];

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfWeek = (year, month) => new Date(year, month, 1).getDay();

  const openDay = (dateKey) => {
    const day = days[dateKey] || {};
    setEditForm({
      morning: day.morning || [],
      noon: day.noon || [],
      afternoon: day.afternoon || [],
      evening: day.evening || []
    });
    setEditingDate(dateKey);
  };

  const handleSaveDay = async () => {
    const nextDays = { ...days };
    const isEmpty = editForm.morning.length === 0 && editForm.noon.length === 0
      && editForm.afternoon.length === 0 && editForm.evening.length === 0;
    if (isEmpty) {
      delete nextDays[editingDate];
    } else {
      nextDays[editingDate] = { ...editForm };
    }
    await onUpdate({ ...calendar, days: nextDays });
    setEditingDate(null);
  };

  const handleClearDay = async () => {
    const nextDays = { ...days };
    delete nextDays[editingDate];
    await onUpdate({ ...calendar, days: nextDays });
    setEditingDate(null);
  };

  const togglePreset = (sessionKey, presetId) => {
    setEditForm((f) => {
      const arr = f[sessionKey] || [];
      const has = arr.includes(presetId);
      return { ...f, [sessionKey]: has ? arr.filter((id) => id !== presetId) : [...arr, presetId] };
    });
  };

  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const firstDayOfWeek = getFirstDayOfWeek(selectedYear, selectedMonth);

  const calendarCells = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(d);
  }

  const formatDateKey = (day) => {
    const mm = String(selectedMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${selectedYear}-${mm}-${dd}`;
  };

  const sessionCount = (dateKey) => {
    const day = days[dateKey];
    if (!day) return 0;
    return [day.morning, day.noon, day.afternoon, day.evening].filter((arr) => arr && arr.length > 0).length;
  };

  return (
    <div>
      <div style={sectionTitleStyle}>冥想日历管理</div>
      {saving && <div style={{ color: '#6366f1', fontSize: '12px', marginBottom: '12px' }}>保存中...</div>}

      {/* Year/Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button style={ghostBtnStyle} onClick={() => setSelectedYear((y) => y - 1)}>‹ 上一年</button>
          <span style={{ fontWeight: '600', fontSize: '15px', color: '#1e293b', minWidth: '60px', textAlign: 'center' }}>{selectedYear}</span>
          <button style={ghostBtnStyle} onClick={() => setSelectedYear((y) => y + 1)}>下一年 ›</button>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {MONTHS.map((m, idx) => (
            <button key={idx} style={pillBtnStyle(selectedMonth === idx)} onClick={() => setSelectedMonth(idx)}>{m}</button>
          ))}
        </div>
      </div>

      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
        {WEEKDAYS.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', fontWeight: '500', padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {calendarCells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const dateKey = formatDateKey(day);
          const count = sessionCount(dateKey);
          const hasData = count > 0;
          return (
            <div
              key={dateKey}
              onClick={() => openDay(dateKey)}
              style={{
                padding: '8px 4px',
                borderRadius: '8px',
                cursor: 'pointer',
                backgroundColor: hasData ? '#eff6ff' : '#f8fafc',
                border: hasData ? '1px solid #bfdbfe' : '1px solid #f1f5f9',
                textAlign: 'center',
                minHeight: '48px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px'
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: hasData ? '600' : '400', color: hasData ? '#1d4ed8' : '#475569' }}>{day}</div>
              {hasData && <div style={{ fontSize: '10px', color: '#6366f1' }}>{count} 节</div>}
            </div>
          );
        })}
      </div>

      {/* Day edit modal */}
      {editingDate && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '460px', maxWidth: '94vw', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
              {editingDate} — 课程设置
            </div>
            {Object.entries(SESSION_LABELS).map(([sessionKey, sessionLabel]) => {
              const selected = editForm[sessionKey] || [];
              return (
                <div key={sessionKey} style={{ marginBottom: '18px' }}>
                  <label style={labelStyle}>
                    {sessionLabel}
                    {selected.length > 0 && (
                      <span style={{ fontWeight: '400', color: '#6366f1', marginLeft: '8px', fontSize: '11px' }}>
                        {selected.length === 1 ? '固定' : `${selected.length}条随机`}
                      </span>
                    )}
                  </label>
                  {presets.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>暂无冥想预设，请先在「冥想库」中创建</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {presets.map((preset) => {
                        const checked = selected.includes(preset.id);
                        return (
                          <label
                            key={preset.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              backgroundColor: checked ? '#eff6ff' : '#f8fafc',
                              border: checked ? '1px solid #93c5fd' : '1px solid #e2e8f0'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePreset(sessionKey, preset.id)}
                              style={{ accentColor: '#6366f1' }}
                            />
                            <span style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b' }}>{preset.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {saving && <div style={{ color: '#6366f1', fontSize: '12px', marginBottom: '10px' }}>保存中...</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button style={dangerBtnStyle} onClick={handleClearDay}>清除当天</button>
              <button style={ghostBtnStyle} onClick={() => setEditingDate(null)}>取消</button>
              <button style={primaryBtnStyle} onClick={handleSaveDay}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── MeditationPage ───────────────────────────────────────────────────────────

const MeditationPage = ({
  meditationAudioLibrary,
  meditationCompositionSettings,
  meditationCalendar,
  meditationLibrary,
  savingMeditationAudioLibrary,
  savingMeditationCompositionSettings,
  savingMeditationCalendar,
  savingMeditationLibrary,
  updateMeditationAudioLibrary,
  updateMeditationCompositionSettings,
  updateMeditationCalendar,
  updateMeditationLibrary,
  settingsError
}) => {
  const [activeSubTab, setActiveSubTab] = useState('library');

  return (
    <div>
      {/* Sub-tab pill nav */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {SUB_TABS.map((tab) => (
          <button key={tab.key} style={pillBtnStyle(activeSubTab === tab.key)} onClick={() => setActiveSubTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {settingsError && (
        <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde047', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: '#713f12', marginBottom: '16px' }}>
          {settingsError}
        </div>
      )}

      <div style={cardStyle}>
        {activeSubTab === 'library' && (
          <AudioLibraryTab
            library={meditationAudioLibrary}
            saving={savingMeditationAudioLibrary}
            onUpdate={updateMeditationAudioLibrary}
          />
        )}
        {activeSubTab === 'presets' && (
          <MeditationPresetsTab
            meditationLibrary={meditationLibrary}
            audioLibrary={meditationAudioLibrary}
            saving={savingMeditationLibrary}
            onUpdate={updateMeditationLibrary}
          />
        )}
        {activeSubTab === 'composition' && (
          <CompositionTab
            settings={meditationCompositionSettings}
            library={meditationAudioLibrary}
            saving={savingMeditationCompositionSettings}
            onUpdate={updateMeditationCompositionSettings}
          />
        )}
        {activeSubTab === 'calendar' && (
          <CalendarTab
            calendar={meditationCalendar}
            meditationLibrary={meditationLibrary}
            saving={savingMeditationCalendar}
            onUpdate={updateMeditationCalendar}
          />
        )}
      </div>
    </div>
  );
};

export default MeditationPage;
