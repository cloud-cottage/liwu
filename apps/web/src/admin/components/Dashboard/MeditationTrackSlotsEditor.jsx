import React from 'react';
import {
  MEDITATION_TRACK_SLOT_POLICIES,
  MEDITATION_TRACK_SLOT_SELECTOR_KINDS,
  getMeditationSectionDisplayLabelWithCode
} from '@liwu/shared-utils/meditation-track-template.js';
import {
  deriveLegacyChapterSlots,
  getChapterSlotSectionTypeOptions
} from '../../utils/meditationTrackSlots.js';

// ─── 「冥想轨道」Track 配置：章内「有序槽位」编辑器（R49-②）────────────────────────
// 分拆的独立组件（R43：新功能不堆进 MeditationPage.jsx 单文件）。
// 取值域 / 上屏名一律走既有权威 helper（**不硬编码第二份**）；保存载荷的归一由
// packages/shared-utils 的 normalizeChapterSlots 负责（本组件只产出白名单键）。

const POLICY_OPTIONS = [
  { value: MEDITATION_TRACK_SLOT_POLICIES.random, label: '池内随机（random）' },
  { value: MEDITATION_TRACK_SLOT_POLICIES.noRepeat, label: '一条配方内不重复（no_repeat）' }
];

const SELECTOR_OPTIONS = [
  { value: MEDITATION_TRACK_SLOT_SELECTOR_KINDS.pinned, label: '锁定一条具体音频（pinned）' },
  { value: MEDITATION_TRACK_SLOT_SELECTOR_KINDS.pool, label: '按类型从池内抽（pool）' }
];

const wrapStyle = {
  marginTop: '8px',
  padding: '10px 12px',
  backgroundColor: '#f8fafc',
  border: '1px solid #eceff5',
  borderRadius: '8px'
};

const rowStyle = {
  marginTop: '6px',
  padding: '8px 10px',
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px'
};

const rowHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '12px',
  color: '#475569'
};

const fieldLabelStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  marginRight: '12px',
  marginTop: '6px',
  fontSize: '12px',
  color: '#475569'
};

const selectStyle = {
  padding: '4px 8px',
  borderRadius: '6px',
  border: '1px solid #d9d9d9',
  fontSize: '12px',
  maxWidth: '280px'
};

const textInputStyle = {
  padding: '4px 8px',
  borderRadius: '6px',
  border: '1px solid #d9d9d9',
  fontSize: '12px',
  width: '200px'
};

const miniBtnStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  backgroundColor: '#fff',
  color: '#334155',
  padding: '2px 8px',
  fontSize: '12px',
  cursor: 'pointer'
};

const primaryMiniBtnStyle = {
  ...miniBtnStyle,
  border: 'none',
  backgroundColor: '#2196F3',
  color: '#fff',
  padding: '5px 12px',
  fontWeight: 600
};

const errorStyle = { color: '#ef4444', fontSize: '12px', marginTop: '4px' };

const sectionTypeLabel = (sectionType) => (
  getMeditationSectionDisplayLabelWithCode(sectionType) || sectionType || '未设置'
);

const audioOptionLabel = (audio = {}) => {
  const name = audio.label || audio.text_snapshot || '(未命名音频)';
  const duration = Number(audio.duration) > 0 ? ` · ${Math.round(Number(audio.duration))}s` : '';
  return `${name}${duration}`;
};

const parseTags = (raw = '') => (
  String(raw)
    .split(/[,，、]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
);

// 只保留白名单 4 键（`slot_index` / `section_type` / `selector` / `policy`），
// 并令 `slot_index` 恒等于数组序（同章唯一且有序；顺序调整即数组重排）。
const toCanonicalSlots = (slots = []) => (
  slots.map((slot, index) => ({
    slot_index: index,
    section_type: slot?.section_type ?? '',
    selector: slot?.selector ?? null,
    policy: slot?.policy ?? ''
  }))
);

const MeditationTrackSlotsEditor = ({ chapter, poolAudios = [], errors = [], onChange }) => {
  const sectionTypeOptions = getChapterSlotSectionTypeOptions(chapter.chapter_key);
  const slots = Array.isArray(chapter.slots) ? chapter.slots : [];
  const legacyDerived = slots.length === 0 ? deriveLegacyChapterSlots(chapter) : [];

  const commit = (nextSlots) => onChange(toCanonicalSlots(nextSlots));

  const makeReadableSlot = (sectionType) => ({
    slot_index: 0,
    section_type: sectionType,
    selector: {
      kind: MEDITATION_TRACK_SLOT_SELECTOR_KINDS.pool,
      section_type: sectionType,
      tags: []
    },
    policy: MEDITATION_TRACK_SLOT_POLICIES.random
  });

  const addSlot = () => commit([...slots, makeReadableSlot(sectionTypeOptions[0]?.section_type || '')]);

  const removeSlot = (index) => commit(slots.filter((_slot, position) => position !== index));

  const moveSlot = (index, direction) => {
    const target = index + direction;

    if (target < 0 || target >= slots.length) {
      return;
    }

    const next = slots.slice();
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const patchSlot = (index, patch) => commit(slots.map((slot, position) => (
    position === index ? { ...slot, ...patch } : slot
  )));

  const patchSelector = (index, patch) => commit(slots.map((slot, position) => (
    position === index ? { ...slot, selector: { ...(slot.selector || {}), ...patch } } : slot
  )));

  const changeSectionType = (index, sectionType) => {
    const selector = slots[index]?.selector || {};
    const nextSelector = selector.kind === MEDITATION_TRACK_SLOT_SELECTOR_KINDS.pool
      ? { ...selector, section_type: sectionType }
      : selector;

    patchSlot(index, { section_type: sectionType, selector: nextSelector });
  };

  const changeSelectorKind = (index, kind) => {
    if (kind === MEDITATION_TRACK_SLOT_SELECTOR_KINDS.pinned) {
      patchSlot(index, { selector: { kind, audio_id: '' } });
      return;
    }

    const sectionType = slots[index]?.section_type || sectionTypeOptions[0]?.section_type || '';
    patchSlot(index, {
      selector: { kind, section_type: sectionType, tags: [] }
    });
  };

  const candidateAudios = (sectionType = '') => (
    poolAudios.filter((audio) => (audio?.section_type || '') === sectionType)
  );

  const renderLegacyReadOnly = () => (
    <div style={wrapStyle}>
      <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
        {sectionTypeOptions.length > 0 ? '本章为老数据：尚无有序槽位，按现有 Section 序列派生展示（只读）。' : '本章无可用段类型。'}
        <span style={{ color: '#94a3b8' }}>保存本页不会写入槽位。</span>
      </div>
      {legacyDerived.map((slot, index) => (
        <div key={`legacy-${index}`} style={{ fontSize: '12px', color: '#64748b', margin: '2px 0' }}>
          #{index + 1} {sectionTypeLabel(slot.section_type)}
          <span style={{ color: '#94a3b8' }}>（派生 · 只读）</span>
        </div>
      ))}
      <button
        type="button"
        style={{ ...primaryMiniBtnStyle, marginTop: '6px' }}
        onClick={() => commit(legacyDerived.map((slot) => makeReadableSlot(slot.section_type)))}
      >
        以现有序列初始化可编辑槽位
      </button>
    </div>
  );

  const renderSlotRow = (slot, index) => {
    const selector = slot.selector || {};
    const kind = selector.kind || '';
    const rowErrors = errors.filter((error) => error.index === index);
    const tagsValue = Array.isArray(selector.tags) ? selector.tags.join(', ') : '';

    return (
      <div key={`slot-${index}`} style={rowStyle}>
        <div style={rowHeaderStyle}>
          <span style={{ fontWeight: 600 }}>#{index + 1}</span>
          <span style={{ color: '#94a3b8' }}>slot_index {slot.slot_index}</span>
          <button type="button" style={miniBtnStyle} onClick={() => moveSlot(index, -1)} disabled={index === 0}>↑ 上移</button>
          <button type="button" style={miniBtnStyle} onClick={() => moveSlot(index, 1)} disabled={index === slots.length - 1}>↓ 下移</button>
          <button type="button" style={{ ...miniBtnStyle, color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => removeSlot(index)}>删除</button>
        </div>

        <label style={fieldLabelStyle}>
          段类型
          <select style={selectStyle} value={slot.section_type || ''} onChange={(event) => changeSectionType(index, event.target.value)}>
            <option value="">请选择段类型</option>
            {sectionTypeOptions.map((option) => (
              <option key={option.section_type} value={option.section_type}>{option.label}</option>
            ))}
          </select>
        </label>

        <label style={fieldLabelStyle}>
          选择器
          <select style={selectStyle} value={kind} onChange={(event) => changeSelectorKind(index, event.target.value)}>
            <option value="">请选择选择器</option>
            {SELECTOR_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        {kind === MEDITATION_TRACK_SLOT_SELECTOR_KINDS.pinned && (
          <label style={fieldLabelStyle}>
            锁定音频
            <select style={selectStyle} value={selector.audio_id || ''} onChange={(event) => patchSelector(index, { audio_id: event.target.value })}>
              <option value="">请选择音频</option>
              {candidateAudios(slot.section_type).map((audio) => (
                <option key={audio._id || audio.id} value={audio._id || audio.id}>{audioOptionLabel(audio)}</option>
              ))}
            </select>
          </label>
        )}

        {kind === MEDITATION_TRACK_SLOT_SELECTOR_KINDS.pool && (
          <label style={fieldLabelStyle}>
            标签收窄（可选）
            <input
              style={textInputStyle}
              placeholder="逗号分隔，可留空"
              value={tagsValue}
              onChange={(event) => patchSelector(index, { tags: parseTags(event.target.value) })}
            />
          </label>
        )}

        <label style={fieldLabelStyle}>
          策略
          <select style={selectStyle} value={slot.policy || ''} onChange={(event) => patchSlot(index, { policy: event.target.value })}>
            <option value="">请选择策略</option>
            {POLICY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        {rowErrors.map((error) => (
          <div key={`${error.code}-${error.index}`} style={errorStyle}>❌ {error.message}</div>
        ))}
      </div>
    );
  };

  return (
    <div style={wrapStyle} data-meditation-track-slots-chapter={chapter.chapter_key}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
        有序槽位（章内顺序即数组序；slot_index 由顺序派生）
      </div>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
        每槽绑定一个段类型；pinned 锁定一条具体音频，pool 在池内抽（可选标签收窄）；策略可选池内随机或一条配方内不重复（no_repeat）。
      </div>
      {slots.length === 0
        ? renderLegacyReadOnly()
        : (
          <>
            {slots.map(renderSlotRow)}
            <button type="button" style={{ ...primaryMiniBtnStyle, marginTop: '8px' }} onClick={addSlot}>添加槽位</button>
          </>
        )}
    </div>
  );
};

export default MeditationTrackSlotsEditor;
