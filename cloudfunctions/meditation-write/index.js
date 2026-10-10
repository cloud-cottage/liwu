// ─── meditation-write：冥想写侧云函数（腾讯云函数 SCF） ─────────────────────────────
//
// 【职责】为后台提供 `med_*` 的增 / 改 / 删 / 查：
//   `med_paragraphs` / `med_section_raws` / `med_section_audios` / `med_tracks`（含 `chapters[].slots`）。
//
// 【与 meditation-read 的职责边界（硬）】
//   · `meditation-read`＝**端侧 D6 只读通道**：**无鉴权、零写路径**（R39-⑩ / R39-⑫）——匿名用户
//     也必须能听到音频（Kevin 2026-10-10 硬要求，B.7 v4.40 注 二）。**本单不改它任何 action 行为**。
//   · `meditation-write`＝**后台写侧 / 管理通道**：**所有 action（whoami 除外）必须鉴权**（见下），
//     用 SCF 内置凭证读写（服务端凭证豁免安全规则；B.7 v4.40 注 三 / A49）。
//   两者共享 `med_section_audios` 的读口径与六章模板，但**不共享函数入口**。
//
// 【鉴权（最小但非纯自报；硬）】见 README §3 的完整口径与**强度登记**。摘要：
//   ① 调用方传入 `user_id`（其自身用户标识）＋（弱绑定回退时）`auth_uid`；
//   ② 服务端解析出 `users` 文档，并校验**调用者身份与该 user_id 可关联**：
//        · 框架身份可用（`app.auth().getUserInfo()`，来自 SCF 上下文环境变量，**非客户端自报**）
//          ⇒ `users._openid` 或 `users.auth_uid` 必须命中框架身份（强绑定）；否则显式拒绝；
//        · 框架身份不可用（当前 dev 环境：web 匿名会话 / CLI 直调）
//          ⇒ 要求 `auth_uid` 与 `users.auth_uid` 一致（**弱绑定 / 可伪造**，如实登记，B 阶段换真身份）；
//   ③ **该用户必须带【管理员 / 超级管理员】标签**——复用现有 `user_tags` ＋ `tags` 判定
//      （`ADMIN_ROLE_TAG_NAMES`），**不新造第二套角色口径**；判定为**服务端读库**，不可由调用方自报。
//   ④ 任一不满足 ⇒ **显式拒绝**（结构化错误码），**绝不静默**。
//
// 【写成功判据（硬；R40-④⑤）】**不得**用 `updated >= 1` 判成功——`updated:0` 三义同形
//   （R40-②）且含对象数组载荷时非确定（R40-③）⇒ `updateDocumentAndVerify`：`updated >= 1` 即过；
//   `updated < 1` 且无 `code` ⇒ **一次性读回比对**（`Date` 归一 ISO、键序无关深比较）；一致＝幂等
//   no-op 成功；不一致 ⇒ 抛「未能确认写入生效（未检测到任何变化）」（**文案不得声称「无权限」**）。
//
// 【删除影响条数（硬；R38-①）】`deleted < 1` ⇒ 抛「影响条数为 0（文档不存在或无权删除）」。
//
// 【不得引仓库内共享模块】SCF 只打包函数目录（Zang 裁定 D-B2-8）⇒ `lib/*.js` 为权威源的
//   **精简等价副本**，各自文件头注明权威源与同步责任。
//
// 【凭据】优先用 SCF 角色**内置凭证**；环境变量回退链与 meditation-read / meditation-session 一致
//   （便于本机 invoke）。**密钥一律不打印**，只记录「是否提供了密钥」的布尔值；不硬编码任何密钥。
//
// 【入参 / 出参 / action 清单 / 部署与权限】见同目录 README.md。

const tcb = require('@cloudbase/node-sdk')

const {
  COLLECTIONS,
  ERROR_CODES,
  ACTIONS,
  ADMIN_ROLE_TAG_NAMES,
  MAX_QUERY_BATCH_SIZE,
  getString,
  isPlainObject,
  buildError,
  resolveAction,
  readRequiredId,
  readRequiredData,
  readOptionalLimit,
  pickComparableSubset,
  deepEqualLoose,
  resolveDeletedCount,
  buildSlotValidationMessage,
  validateMeditationTrackSlots,
  buildParagraphCreatePayload,
  buildParagraphUpdatePayload,
  buildSectionRawCreatePayload,
  buildSectionRawUpdatePayload,
  buildSectionAudioCreatePayload,
  buildSectionAudioUpdatePayload,
  buildTrackCreatePayload,
  buildTrackUpdatePayload
} = require('./lib/write-contract.js')

const DEFAULT_ENV_ID = 'liwu-d8gek6jjdab1d087c'
const SCOPE = 'cloudbase-meditation-write'

const readEnvValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

const resolveEnvId = () => (
  readEnvValue('CLOUDBASE_ENV_ID', 'TCB_ENV', 'SCF_NAMESPACE') || DEFAULT_ENV_ID
)

// 云函数内优先用 SCF 角色**内置凭证**（无需密钥）；环境变量回退链命名与既有云函数一致。
// ⚠ 任何情况下不打印密钥，只记录「是否提供了密钥」。
const getCloudBaseApp = (envId) => {
  const secretId = readEnvValue('TENCENT_SECRET_ID', 'TENCENTCLOUD_SECRET_ID', 'VITE_TENCENT_SECRET_ID')
  const secretKey = readEnvValue('TENCENT_SECRET_KEY', 'TENCENTCLOUD_SECRET_KEY', 'VITE_TENCENT_SECRET_KEY')

  return secretId && secretKey
    ? tcb.init({ env: envId, secretId, secretKey })
    : tcb.init({ env: envId })
}

const buildRequestId = () => `mwr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

const logEvent = (requestId, stage, details = {}) => {
  console.log(JSON.stringify({ scope: SCOPE, requestId, stage, ...details }))
}

// CloudBase SDK 在「集合不存在 / 权限被拒」等错误时以 **resolve** 返回 `{ code, message }` 而不是 reject ⇒
// 只 try/catch 会把失败读成成功 ⇒ 必须显式校验返回体（口径同 meditation-read#assertCloudBaseResult）。
const assertCloudBaseResult = (result, label) => {
  if (result && typeof result === 'object' && !Array.isArray(result) && result.code && result.message) {
    throw new Error(`${label} 操作失败：${result.message}（${result.code}）`)
  }

  return result
}

const getDocuments = (result) => {
  const data = result?.data

  if (Array.isArray(data)) {
    return data
  }

  return data && typeof data === 'object' ? [data] : []
}

const getFirstDocument = (result) => getDocuments(result)[0] || null

const chunkArray = (list = [], size = MAX_QUERY_BATCH_SIZE) => {
  const chunks = []
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size))
  }
  return chunks
}

// ─── 身份与鉴权（见文件头 §鉴权） ───────────────────────────────────────────────

// 读取**框架注入的调用者身份**（来自 SCF 上下文环境变量，非客户端自报）：
// TCB_UUID / TCB_CUSTOM_USER_ID / WX_OPENID / TCB_ISANONYMOUS_USER。任何异常 ⇒ 视为「无上下文身份」。
const readFrameworkIdentity = (app) => {
  const empty = { openId: '', appId: '', uid: '', customUserId: '', isAnonymous: false, hasContext: false }

  try {
    const auth = app && typeof app.auth === 'function' ? app.auth() : null
    if (!auth || typeof auth.getUserInfo !== 'function') {
      return empty
    }

    const info = auth.getUserInfo() || {}
    const openId = getString(info.openId).trim()
    const uid = getString(info.uid).trim()
    const customUserId = getString(info.customUserId).trim()

    return {
      openId,
      appId: getString(info.appId).trim(),
      uid,
      customUserId,
      isAnonymous: info.isAnonymous === true,
      hasContext: Boolean(openId || uid || customUserId)
    }
  } catch {
    return empty
  }
}

// 解析调用者自身对应的 `users` 文档：`_id` → `auth_uid` → `uid`（数字）逐级回退。
const resolveUserDocument = async ({ db, callerUserId }) => {
  const users = db.collection(COLLECTIONS.users)
  let doc = null

  try {
    const byId = await users.doc(callerUserId).get()
    assertCloudBaseResult(byId, COLLECTIONS.users)
    doc = getFirstDocument(byId)
  } catch {
    doc = null
  }

  if (doc) {
    return doc
  }

  const byAuthUid = assertCloudBaseResult(
    await users.where({ auth_uid: callerUserId }).limit(1).get(),
    COLLECTIONS.users
  )
  doc = getFirstDocument(byAuthUid)

  if (doc) {
    return doc
  }

  if (/^\d+$/.test(callerUserId)) {
    const byUid = assertCloudBaseResult(
      await users.where({ uid: Number(callerUserId) }).limit(1).get(),
      COLLECTIONS.users
    )
    doc = getFirstDocument(byUid)
  }

  return doc || null
}

// 读取该用户名下的标签名（`user_tags` → `tags`），**复用现有角色体系**。
const loadUserTagNames = async ({ db, userId }) => {
  const linksResult = assertCloudBaseResult(
    await db.collection(COLLECTIONS.userTags).where({ user_id: userId }).limit(200).get(),
    COLLECTIONS.userTags
  )
  const tagIds = [...new Set(
    getDocuments(linksResult).map((link) => getString(link?.tag_id).trim()).filter(Boolean)
  )]

  if (tagIds.length === 0) {
    return []
  }

  const command = db.command
  const names = []

  for (const chunk of chunkArray(tagIds)) {
    const tagsResult = assertCloudBaseResult(
      await db.collection(COLLECTIONS.tags).where({ _id: command.in(chunk) }).limit(chunk.length).get(),
      COLLECTIONS.tags
    )
    getDocuments(tagsResult).forEach((tag) => {
      const name = getString(tag?.name).trim()
      if (name) {
        names.push(name)
      }
    })
  }

  return names
}

// 鉴权：身份关联 ＋ 管理员标签。返回 `{ ok:true, ... }` 或 `{ ok:false, error, ... }`（显式、非静默）。
const authorizeAdmin = async ({ app, db, callerUserId, callerAuthUid }) => {
  const normalizedUserId = getString(callerUserId).trim()

  if (!normalizedUserId) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.authRequired, '缺少参数：user_id（调用者自身用户标识）', { param: 'user_id' })
    }
  }

  const framework = readFrameworkIdentity(app)
  const user = await resolveUserDocument({ db, callerUserId: normalizedUserId })

  if (!user) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.authUserNotFound, `user_id 无法解析为用户：${normalizedUserId}`, {
        user_id: normalizedUserId
      })
    }
  }

  const resolvedUserId = getString(user._id || user.id).trim()
  const userOpenId = getString(user._openid || user.openid).trim()
  const userAuthUid = getString(user.auth_uid).trim()

  let binding = ''

  if (framework.hasContext) {
    // 强绑定：框架身份（SCF 上下文，非客户端自报）必须能关联该 users 文档。
    const candidates = [framework.openId, framework.uid, framework.customUserId]
      .map((value) => getString(value).trim())
      .filter(Boolean)
    const matched = candidates.some((candidate) => candidate === userOpenId || candidate === userAuthUid)

    if (!matched) {
      return {
        ok: false,
        error: buildError(ERROR_CODES.authIdentityMismatch, '调用者身份与 user_id 不匹配（框架身份无法关联该用户）', {
          binding: 'framework_context'
        })
      }
    }

    binding = 'framework_context'
  } else {
    // 弱绑定回退（当前 dev 环境）：要求 `auth_uid` 与库内一致。**可伪造，见 README §3 强度登记。**
    const claimedAuthUid = getString(callerAuthUid).trim()

    if (!claimedAuthUid) {
      return {
        ok: false,
        error: buildError(ERROR_CODES.authIdentityUnverified, '无法校验身份：无框架身份时须提供 auth_uid（弱绑定）', {
          param: 'auth_uid'
        })
      }
    }

    if (!userAuthUid || userAuthUid !== claimedAuthUid) {
      return {
        ok: false,
        error: buildError(ERROR_CODES.authIdentityMismatch, 'auth_uid 与 user_id 不匹配', {
          binding: 'claimed_auth_uid'
        })
      }
    }

    binding = 'claimed_auth_uid'
  }

  const tagNames = await loadUserTagNames({ db, userId: resolvedUserId })
  const isAdmin = tagNames.some((name) => ADMIN_ROLE_TAG_NAMES.includes(name))

  if (!isAdmin) {
    return {
      ok: false,
      error: buildError(ERROR_CODES.authNotAdmin, '用户不具备【管理员 / 超级管理员】标签，拒绝访问', {
        user_id: resolvedUserId,
        admin_role_tags: [...ADMIN_ROLE_TAG_NAMES]
      })
    }
  }

  return { ok: true, user, user_id: resolvedUserId, binding, is_admin: true }
}

// ─── 写原语（R40 读回比对 / R38-① 删除断言） ────────────────────────────────────

const addDocument = async ({ db, collection, data }) => {
  const result = assertCloudBaseResult(await db.collection(collection).add(data), collection)
  const id = getString(result?.id || result?._id).trim()

  if (!id) {
    throw new Error(`${collection} 写入未返回 id（疑似静默失败）`)
  }

  return id
}

// R40-④⑤：`updated >= 1` 即过；`updated < 1` 且无 `code` ⇒ 一次性读回比对。
const updateDocumentAndVerify = async ({ db, collection, id, payload, entityLabel }) => {
  const result = assertCloudBaseResult(await db.collection(collection).doc(id).update(payload), collection)
  const updated = Number(result?.updated ?? result?.data?.updated ?? 0)

  if (Number.isFinite(updated) && updated >= 1) {
    return { updated, readBack: false }
  }

  const readResult = assertCloudBaseResult(await db.collection(collection).doc(id).get(), collection)
  const document = getFirstDocument(readResult)

  if (!document) {
    throw new Error(`${entityLabel}保存失败：未能确认写入生效（读回未找到该文档）`)
  }

  const subset = pickComparableSubset(document, payload)
  if (!deepEqualLoose(subset, payload)) {
    throw new Error(`${entityLabel}保存失败：未能确认写入生效（未检测到任何变化）`)
  }

  return { updated: Number.isFinite(updated) ? updated : 0, readBack: true }
}

// R38-①：影响条数断言（`deleted < 1` ⇒ 抛，文案不声称「无权限」）。
const removeDocumentStrict = async ({ db, collection, id, entityLabel }) => {
  const result = assertCloudBaseResult(await db.collection(collection).doc(id).remove(), collection)
  const deleted = resolveDeletedCount(result)

  if (!(deleted >= 1)) {
    throw new Error(`${entityLabel}删除失败：影响条数为 0（文档不存在或无权删除）`)
  }

  return { deleted }
}

const fetchDocumentById = async ({ db, collection, id }) => {
  const result = assertCloudBaseResult(await db.collection(collection).doc(id).get(), collection)
  return getFirstDocument(result)
}

const listDocuments = async ({ db, collection, limit }) => {
  const result = assertCloudBaseResult(await db.collection(collection).limit(limit).get(), collection)
  return getDocuments(result)
}

const buildDocNotFound = (collection, id) => buildError(
  ERROR_CODES.docNotFound,
  `文档不存在：${collection}/${id}`,
  { collection, id }
)

// ─── 集合 CRUD 工厂（list / get / create / update / remove 五件套） ───────────────

const createCollectionHandlers = ({
  collection,
  entityLabel,
  actions,
  buildCreatePayload,
  buildUpdatePayload,
  beforeWrite,
  resolveUpdatePayload
}) => {
  const names = actions

  const handlers = {
    [names.list]: async ({ db, event }) => {
      const documents = await listDocuments({ db, collection, limit: readOptionalLimit(event) })
      return { ok: true, data: { collection, count: documents.length, documents } }
    },

    [names.get]: async ({ db, event }) => {
      const idResult = readRequiredId(event)
      if (!idResult.ok) {
        return idResult.error
      }

      const document = await fetchDocumentById({ db, collection, id: idResult.value })
      if (!document) {
        return buildDocNotFound(collection, idResult.value)
      }

      return { ok: true, data: { collection, document } }
    },

    [names.create]: async ({ db, event, requestId }) => {
      const dataResult = readRequiredData(event)
      if (!dataResult.ok) {
        return dataResult.error
      }

      const nowIso = new Date().toISOString()
      const payload = buildCreatePayload(dataResult.value, nowIso)

      if (typeof beforeWrite === 'function') {
        beforeWrite(payload)
      }

      const id = await addDocument({ db, collection, data: payload })
      logEvent(requestId, 'created', { collection, id })

      return { ok: true, data: { collection, id, document: { ...payload, _id: id } } }
    },

    [names.update]: async ({ db, event, requestId }) => {
      const idResult = readRequiredId(event)
      if (!idResult.ok) {
        return idResult.error
      }

      const dataResult = readRequiredData(event)
      if (!dataResult.ok) {
        return dataResult.error
      }

      const nowIso = new Date().toISOString()
      // 部分更新（med_tracks 专属）：resolveUpdatePayload 需读既有文档做逐章合并 ⇒ 用它替代确定性
      // 的 buildUpdatePayload；返回 `{ ok:false, error }` 视为结构化错误直接短路（如文档不存在）。
      let payload
      if (typeof resolveUpdatePayload === 'function') {
        const resolved = await resolveUpdatePayload({
          db,
          collection,
          id: idResult.value,
          data: dataResult.value,
          nowIso
        })

        if (resolved && resolved.ok === false && typeof resolved.error === 'string') {
          return resolved
        }

        payload = resolved
      } else {
        payload = buildUpdatePayload(dataResult.value, nowIso)
      }

      if (typeof beforeWrite === 'function') {
        beforeWrite(payload)
      }

      const { updated, readBack } = await updateDocumentAndVerify({
        db,
        collection,
        id: idResult.value,
        payload,
        entityLabel
      })
      logEvent(requestId, 'updated', { collection, id: idResult.value, updated, readBack })

      return { ok: true, data: { collection, id: idResult.value, updated, read_back_verified: readBack } }
    },

    [names.remove]: async ({ db, event, requestId }) => {
      const idResult = readRequiredId(event)
      if (!idResult.ok) {
        return idResult.error
      }

      const { deleted } = await removeDocumentStrict({
        db,
        collection,
        id: idResult.value,
        entityLabel
      })
      logEvent(requestId, 'removed', { collection, id: idResult.value, deleted })

      return { ok: true, data: { collection, id: idResult.value, deleted } }
    }
  }

  return { names, handlers }
}

// med_tracks 专属：写入前槽位校验（空 slots ＝ 老语义、不校验；非法 ⇒ 显式拒绝并给文案）。
const assertTrackSlotsWritable = (payload = {}) => {
  const result = validateMeditationTrackSlots({ chapters: payload?.chapters })

  if (!result.ok) {
    throw new Error(buildSlotValidationMessage(result))
  }
}

const paragraphs = createCollectionHandlers({
  collection: COLLECTIONS.medParagraphs,
  entityLabel: '冥想段落',
  actions: {
    list: ACTIONS.listParagraphs,
    get: ACTIONS.getParagraph,
    create: ACTIONS.createParagraph,
    update: ACTIONS.updateParagraph,
    remove: ACTIONS.removeParagraph
  },
  buildCreatePayload: buildParagraphCreatePayload,
  buildUpdatePayload: buildParagraphUpdatePayload
})

const sectionRaws = createCollectionHandlers({
  collection: COLLECTIONS.medSectionRaws,
  entityLabel: 'Section-Raw',
  actions: {
    list: ACTIONS.listSectionRaws,
    get: ACTIONS.getSectionRaw,
    create: ACTIONS.createSectionRaw,
    update: ACTIONS.updateSectionRaw,
    remove: ACTIONS.removeSectionRaw
  },
  buildCreatePayload: buildSectionRawCreatePayload,
  buildUpdatePayload: buildSectionRawUpdatePayload
})

const sectionAudios = createCollectionHandlers({
  collection: COLLECTIONS.medSectionAudios,
  entityLabel: '候选音频',
  actions: {
    list: ACTIONS.listSectionAudios,
    get: ACTIONS.getSectionAudio,
    create: ACTIONS.createSectionAudio,
    update: ACTIONS.updateSectionAudio,
    remove: ACTIONS.removeSectionAudio
  },
  buildCreatePayload: buildSectionAudioCreatePayload,
  buildUpdatePayload: buildSectionAudioUpdatePayload
})

const tracks = createCollectionHandlers({
  collection: COLLECTIONS.medTracks,
  entityLabel: '冥想轨道',
  actions: {
    list: ACTIONS.listTracks,
    get: ACTIONS.getTrack,
    create: ACTIONS.createTrack,
    update: ACTIONS.updateTrack,
    remove: ACTIONS.removeTrack
  },
  buildCreatePayload: buildTrackCreatePayload,
  buildUpdatePayload: buildTrackUpdatePayload,
  // updateTrack＝**真部分更新**：先读既有文档，再做「只改传入字段 + chapters 逐章合并」的载荷组装
  // （未传 `chapters` ⇒ 载荷不含该键、库内章节原样保留，绝不重建）。文档不存在 ⇒ 结构化 DOC_NOT_FOUND。
  resolveUpdatePayload: async ({ db, id, data, nowIso }) => {
    const existing = await fetchDocumentById({ db, collection: COLLECTIONS.medTracks, id })

    if (!existing) {
      return buildDocNotFound(COLLECTIONS.medTracks, id)
    }

    return buildTrackUpdatePayload(data, nowIso, existing)
  },
  beforeWrite: assertTrackSlotsWritable
})

// med_section_raws 的删除（C9：`med_section_raws` 无删除路径；实施删除须连带处理候选音频与引用）：
// 默认**拒绝**删除仍挂着候选音频的 raw（显式提示、不静默）；传 `cascade:true` 时才连带删除该 raw 的
// `med_section_audios`（`section_raw_id` 命中）。旧 Track / 段落引用不在本集合内，需由调用方自行处理。
const handleRemoveSectionRaw = async ({ db, event, requestId }) => {
  const idResult = readRequiredId(event)
  if (!idResult.ok) {
    return idResult.error
  }

  const rawId = idResult.value
  const audiosResult = assertCloudBaseResult(
    await db.collection(COLLECTIONS.medSectionAudios).where({ section_raw_id: rawId }).limit(500).get(),
    COLLECTIONS.medSectionAudios
  )
  const candidates = getDocuments(audiosResult).filter((audio) => getString(audio?.section_raw_id) === rawId)
  const cascade = event?.cascade === true

  if (candidates.length > 0 && !cascade) {
    return buildError(
      ERROR_CODES.invalidParams,
      `该 Section-Raw 仍挂着 ${candidates.length} 条候选音频；如确认连带删除，请传 cascade:true（C9）`,
      { id: rawId, candidate_audio_count: candidates.length, cascade_required: true }
    )
  }

  let removedAudioCount = 0
  for (const audio of candidates) {
    const audioId = getString(audio?._id || audio?.id).trim()
    if (!audioId) {
      continue
    }
    await removeDocumentStrict({
      db,
      collection: COLLECTIONS.medSectionAudios,
      id: audioId,
      entityLabel: '候选音频'
    })
    removedAudioCount += 1
  }

  const { deleted } = await removeDocumentStrict({
    db,
    collection: COLLECTIONS.medSectionRaws,
    id: rawId,
    entityLabel: 'Section-Raw'
  })
  logEvent(requestId, 'removed', { collection: COLLECTIONS.medSectionRaws, id: rawId, deleted, removedAudioCount })

  return {
    ok: true,
    data: {
      collection: COLLECTIONS.medSectionRaws,
      id: rawId,
      deleted,
      cascade: cascade,
      removed_candidate_audio_count: removedAudioCount
    }
  }
}

const handleWhoami = async ({ app, db, event }) => {
  const framework = readFrameworkIdentity(app)
  const auth = await authorizeAdmin({
    app,
    db,
    callerUserId: event?.user_id ?? event?.userId,
    callerAuthUid: event?.auth_uid ?? event?.authUid
  })

  return {
    ok: true,
    data: {
      authorized: auth.ok === true,
      error_code: auth.ok ? '' : auth.error.error,
      binding: auth.ok ? auth.binding : '',
      user_id: auth.ok ? auth.user_id : getString(event?.user_id ?? event?.userId).trim(),
      is_admin: auth.ok === true,
      framework_identity_present: framework.hasContext,
      framework_identity_source: framework.hasContext ? 'scf_context' : 'absent'
    }
  }
}

// action → handler 映射（list / get / create / update / remove 五件套 ＋ whoami ＋ section-raw 删除特例）。
const ACTION_HANDLERS = Object.freeze({
  [ACTIONS.whoami]: handleWhoami,

  ...paragraphs.handlers,
  ...sectionRaws.handlers,
  [ACTIONS.removeSectionRaw]: handleRemoveSectionRaw,
  ...sectionAudios.handlers,
  ...tracks.handlers
})

exports.main = async (event = {}) => {
  const requestId = buildRequestId()
  const startedAt = Date.now()

  // ① 入参必须是对象（字符串 / 数组 / null 一律结构化报错）。
  if (!isPlainObject(event)) {
    return buildError(ERROR_CODES.invalidEvent, '入参必须是对象', {
      received_type: Array.isArray(event) ? 'array' : typeof event
    })
  }

  // ② action 校验（写函数无缺省 action；非法值 / 非字符串一律报错）。
  const actionResult = resolveAction(event)
  if (!actionResult.ok) {
    logEvent(requestId, 'invalid_action', { action: getString(event.action) })
    return { ...actionResult.error, meta: { request_id: requestId, action: getString(event.action) } }
  }

  const action = actionResult.action
  const envId = resolveEnvId()

  const buildMeta = (handlerMeta = {}) => ({
    ...handlerMeta,
    request_id: requestId,
    action,
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt
  })

  try {
    const app = getCloudBaseApp(envId)
    const db = app.database()

    logEvent(requestId, 'started', {
      envId,
      action,
      withSecret: Boolean(readEnvValue('TENCENT_SECRET_ID', 'TENCENTCLOUD_SECRET_ID', 'VITE_TENCENT_SECRET_ID'))
    })

    // ③ whoami：只回报鉴权结果，不做写操作、不抛。
    if (action === ACTIONS.whoami) {
      const result = await handleWhoami({ app, db, event, requestId })
      logEvent(requestId, 'completed', { action, ok: true, authorized: result.data.authorized })
      return { ...result, meta: buildMeta() }
    }

    // ④ 鉴权门（所有写 / 后台侧 action）：任一不满足 ⇒ 显式拒绝（绝不静默）。
    const auth = await authorizeAdmin({
      app,
      db,
      callerUserId: event?.user_id ?? event?.userId,
      callerAuthUid: event?.auth_uid ?? event?.authUid
    })

    if (!auth.ok) {
      logEvent(requestId, 'auth_denied', { action, error: auth.error.error })
      return { ...auth.error, meta: buildMeta() }
    }

    // ⑤ 执行。
    const handler = ACTION_HANDLERS[action]
    const result = await handler({ app, db, event, requestId, auth })

    logEvent(requestId, 'completed', {
      action,
      ok: result.ok,
      binding: auth.binding,
      durationMs: Date.now() - startedAt,
      error: result.ok ? '' : result.error
    })

    return { ...result, meta: buildMeta() }
  } catch (error) {
    // 兜底：**任何**异常都收敛成结构化错误（不抛未捕获异常、不返回部分数据当成功）。
    logEvent(requestId, 'failed', {
      action,
      durationMs: Date.now() - startedAt,
      message: error?.message || 'UNKNOWN_ERROR',
      stack: error?.stack || ''
    })

    return { ...buildError(ERROR_CODES.writeFailed, error?.message || '写入失败', { action }), meta: buildMeta() }
  }
}

// 本地自测 / QA 用：暴露内部函数以便用桩对象驱动**真实执行路径**（SCF 只调用 exports.main）。
exports.__test__ = {
  authorizeAdmin,
  readFrameworkIdentity,
  resolveUserDocument,
  loadUserTagNames,
  addDocument,
  updateDocumentAndVerify,
  removeDocumentStrict,
  fetchDocumentById,
  listDocuments,
  handleRemoveSectionRaw,
  handleWhoami,
  assertTrackSlotsWritable,
  ACTION_HANDLERS,
  COLLECTIONS,
  ERROR_CODES,
  ACTIONS
}
