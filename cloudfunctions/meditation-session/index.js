// ─── meditation-session：冥想「完成度上报 + 福豆发放」写云函数（腾讯云函数 SCF） ─────
//
// 【规范依据】docs/meditation.admin.partner.spec.md（正本，v4.33 起）：
//   · **R50（完成度上报与福豆发放口径，①~⑦）**——上报 + 校验 + 发放**全部由本云函数完成**；
//     **客户端不再直写 `users` / `user_wallets` 余额**（一次到位，顺带修四个既有缺口：
//     C39 客户端直写余额 / C40 无服务端校验 / C41 幂等失效 / C42 匿名写授权）。
//   · **R50-③**：发放必须写 **`point_ledger`（事件账本为权威，不得把 `wealth_history` 嵌回 `users`）**，
//     并**同步余额**（`users.balance` + `user_wallets.balance`，后者是打包读的生效来源）。
//   · **R50-④**：`session_key` 为幂等键，**重复上报不重复发放**；**失败必须取消、绝不重复创建**。
//   · **R50-⑤**：新集合 **`med_play_sessions`＝客户端不可读写、仅云函数（服务端凭证）写**。
//   · **R50-⑥**：服务端校验最小集（session_key 幂等 / 分级计时上限 / audio_id 真实存在 /
//     单日发放上限 / 身份绑定账号）。
//   · **R49-④ v4.33 修订注**：播放过程不写服务端，**只在「完播」或用户主动结束时上报一次**。
//
// 【与单 A（meditation-read 扩 action）的区别】本函数是**独立新函数**（写侧），与 meditation-read（只读）
//   分离：只读函数保持「零写路径」不被污染（R39 ⑫ 的职责边界）。两者共享 `med_section_audios` 的读口径。
//
// 【身份（硬；R50-⑥⑤ / C42）】发放必须能追溯到调用者身份。身份按 lib/reward-contract.js
//   `resolveCallerIdentity` 的次序解析：优先**框架注入的 `event.userInfo`**（真实端侧调用）；
//   没有则回退端侧上报的 `user_id` 并标注 **verified=false**（＝ C42 缺口，**登记而非假造 uid**）。
//
// 【失败纪律（硬）】任一步失败 ⇒ **整个发放取消**（回滚账本 + 还原余额 + 会话标 `award_failed`），
//   **不得半发、不得重复创建**（对齐项目口径「API failure must cancel, never create duplicate」）。
//
// 【凭据】优先用 SCF 角色**内置凭证**；环境变量回退链与 meditation-read / transcoder 一致（便于本机 invoke）。
//   **密钥一律不打印**，只记录「是否提供了密钥」的布尔值；本文件不硬编码任何密钥。
//
// 【入参 / 出参 / 错误码 / 部署与权限】见同目录 README.md。

const tcb = require('@cloudbase/node-sdk')

const {
  ACTIONS,
  ERROR_CODES,
  MEDITATION_REWARD_SETTINGS_KEY,
  MAX_AUDIO_ID_QUERY_BATCH,
  MAX_DAILY_REWARDS_PER_IDENTITY,
  getString,
  isPlainObject,
  toFiniteNumber,
  buildError,
  resolveAction,
  buildReportInput,
  validateReportInput,
  validateSelectionAudios,
  assessListening,
  normalizeMeditationRewardSettings,
  resolveCallerIdentity,
  buildSessionRecord,
  buildPointLedgerEntry
} = require('./lib/reward-contract.js')

// 集合名（与端侧 shared database-config.js / miniprogram COLLECTIONS 对齐；云函数只打包函数目录，
// 故这里按名直写，不 require 仓库共享模块——对齐 meditation-read 的既有做法 D-B2-8）。
const COLLECTIONS = Object.freeze({
  medSectionAudios: 'med_section_audios',
  medPlaySessions: 'med_play_sessions',
  appSettings: 'app_settings',
  users: 'users',
  userWallets: 'user_wallets',
  pointLedger: 'point_ledger'
})

const DEFAULT_ENV_ID = 'liwu-d8gek6jjdab1d087c'
const SCOPE = 'cloudbase-meditation-session'

const readEnvValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

const resolveEnvId = () => (readEnvValue('CLOUDBASE_ENV_ID', 'TCB_ENV', 'SCF_NAMESPACE') || DEFAULT_ENV_ID)

const getCloudBaseApp = (envId) => {
  const secretId = readEnvValue('TENCENT_SECRET_ID', 'TENCENTCLOUD_SECRET_ID', 'VITE_TENCENT_SECRET_ID')
  const secretKey = readEnvValue('TENCENT_SECRET_KEY', 'TENCENTCLOUD_SECRET_KEY', 'VITE_TENCENT_SECRET_KEY')

  return secretId && secretKey
    ? tcb.init({ env: envId, secretId, secretKey })
    : tcb.init({ env: envId })
}

const buildRequestId = () => `msn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

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

// 写返回体校验：resolve 回 `{code,message}`（权限/集合缺失）⇒ 抛错；`add` 必须回 id。
const assertWriteResult = (result, label) => {
  assertCloudBaseResult(result, label)
  const id = getString(result?.id || result?._id).trim()
  if (!id) {
    throw new Error(`${label} 写入未返回 id（疑似静默失败）`)
  }
  return id
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

// ─── 读取 ─────────────────────────────────────────────────────────────────────

// 按 id 批量取 `med_section_audios`（`where in` 分块 ≤ 50，返回 Map<id, doc>）。
const fetchAudiosByIds = async ({ db, ids = [] }) => {
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).map((id) => getString(id).trim()).filter(Boolean))]
  const byId = new Map()

  if (uniqueIds.length === 0) {
    return byId
  }

  const command = db.command
  for (let index = 0; index < uniqueIds.length; index += MAX_AUDIO_ID_QUERY_BATCH) {
    const chunk = uniqueIds.slice(index, index + MAX_AUDIO_ID_QUERY_BATCH)
    const result = assertCloudBaseResult(
      await db.collection(COLLECTIONS.medSectionAudios).where({ _id: command.in(chunk) }).limit(chunk.length).get(),
      COLLECTIONS.medSectionAudios
    )

    getDocuments(result).forEach((doc) => {
      const id = getString(doc?._id || doc?.id).trim()
      if (id) {
        byId.set(id, doc)
      }
    })
  }

  return byId
}

const readRewardSettings = async ({ db }) => {
  const result = assertCloudBaseResult(
    await db.collection(COLLECTIONS.appSettings).where({ key: MEDITATION_REWARD_SETTINGS_KEY }).limit(1).get(),
    COLLECTIONS.appSettings
  )

  return normalizeMeditationRewardSettings(getFirstDocument(result) || {})
}

const findSessionByKey = async ({ db, sessionKey }) => {
  const result = assertCloudBaseResult(
    await db.collection(COLLECTIONS.medPlaySessions).where({ session_key: sessionKey }).limit(1).get(),
    COLLECTIONS.medPlaySessions
  )

  return getFirstDocument(result)
}

const findLedgerByBizId = async ({ db, sessionKey }) => {
  const result = assertCloudBaseResult(
    await db.collection(COLLECTIONS.pointLedger)
      .where({ biz_type: 'meditation', biz_id: sessionKey })
      .limit(1)
      .get(),
    COLLECTIONS.pointLedger
  )

  return getFirstDocument(result)
}

// 单日发放数：只数**真正发放**（delta > 0）的冥想账本条目（delta:0 的打卡不计入上限）。
const countDailyAwards = async ({ db, userId, dateKey }) => {
  const command = db.command
  const result = assertCloudBaseResult(
    await db.collection(COLLECTIONS.pointLedger)
      .where({ user_id: userId, biz_type: 'meditation', activity_date_key: dateKey, delta: command.gt(0) })
      .count(),
    COLLECTIONS.pointLedger
  )

  return Number(result?.total ?? result?.data?.total ?? 0) || 0
}

const hasAnyMeditationAward = async ({ db, userId }) => {
  const command = db.command
  const result = assertCloudBaseResult(
    await db.collection(COLLECTIONS.pointLedger)
      .where({ user_id: userId, biz_type: 'meditation', delta: command.gt(0) })
      .limit(1)
      .get(),
    COLLECTIONS.pointLedger
  )

  return getDocuments(result).length > 0
}

const readUserDocument = async ({ db, userId }) => {
  const result = await db.collection(COLLECTIONS.users).doc(userId).get().catch(() => ({ data: [] }))
  assertCloudBaseResult(result, COLLECTIONS.users)
  return getFirstDocument(result)
}

const readWalletDocument = async ({ db, userId }) => {
  const result = await db.collection(COLLECTIONS.userWallets).where({ user_id: userId }).limit(1).get().catch(() => ({ data: [] }))
  assertCloudBaseResult(result, COLLECTIONS.userWallets)
  return getFirstDocument(result)
}

// ─── 写入（含「集合不存在则按需创建」的自愈，便于新集合首次落库） ──────────────────

const isCollectionMissingError = (error) => {
  const message = getString(error?.message || error?.errMsg)
  return /COLLECTION_NOT_EXIST|Table not exist|Db or Table not exist/i.test(message)
}

const addDocumentWithEnsure = async ({ db, collection, data, requestId }) => {
  try {
    return assertWriteResult(await db.collection(collection).add(data), collection)
  } catch (error) {
    if (isCollectionMissingError(error)) {
      logEvent(requestId, 'collection_autocreate', { collection })
      // 集合不存在 ⇒ 由云函数按需创建（服务端凭证）；创建失败则原样抛出（不吞）。
      await db.createCollection(collection).catch(() => {})
      await sleep(200)
      return assertWriteResult(await db.collection(collection).add(data), collection)
    }
    throw error
  }
}

// 写余额并**读回校验**（项目硬口径 R17/R38/R40：`updated:0` 三义同形，不作成功证据 ⇒ 必须读回比对）。
const setUserBalanceAndVerify = async ({ db, userId, balance, nowIso }) => {
  assertCloudBaseResult(
    await db.collection(COLLECTIONS.users).doc(userId).update({ balance, updated_at: nowIso }),
    COLLECTIONS.users
  )

  const readBack = await readUserDocument({ db, userId })
  const actual = toFiniteNumber(readBack?.balance)
  if (actual !== balance) {
    throw new Error(`users.balance 读回校验失败：期望 ${balance}，实得 ${actual}`)
  }
}

const upsertWalletAndVerify = async ({ db, userId, balance, openId, nowIso }) => {
  const existing = await readWalletDocument({ db, userId })
  const payload = { balance, updated_at: nowIso }

  if (existing) {
    assertCloudBaseResult(
      await db.collection(COLLECTIONS.userWallets).doc(existing._id).update(payload),
      COLLECTIONS.userWallets
    )
  } else {
    const openIdField = openId ? { _openid: openId } : {}
    await addDocumentWithEnsure({
      db,
      collection: COLLECTIONS.userWallets,
      data: { ...openIdField, user_id: userId, balance, reward_claims: {}, created_at: nowIso, updated_at: nowIso },
      requestId: ''
    })
  }

  const readBack = await readWalletDocument({ db, userId })
  const actual = toFiniteNumber(readBack?.balance)
  if (actual !== balance) {
    throw new Error(`user_wallets.balance 读回校验失败：期望 ${balance}，实得 ${actual}`)
  }
}

const updateSessionById = async ({ db, id, patch }) => {
  assertCloudBaseResult(
    await db.collection(COLLECTIONS.medPlaySessions).doc(id).update(patch),
    COLLECTIONS.medPlaySessions
  )
}

const removeLedgerById = async ({ db, id }) => {
  assertCloudBaseResult(await db.collection(COLLECTIONS.pointLedger).doc(id).remove(), COLLECTIONS.pointLedger)
}

// ─── action 实现 ──────────────────────────────────────────────────────────────

const buildSuccessPayload = ({
  payload,
  identity,
  repeated,
  awarded,
  rewardPoints,
  balanceAfter,
  awardSkipReason,
  sessionId,
  pointLedgerId
}) => ({
  ok: true,
  data: {
    repeated,
    awarded,
    reward_points: Number(rewardPoints || 0),
    balance_after: balanceAfter === undefined ? null : balanceAfter,
    award_skip_reason: awardSkipReason || '',
    session_id: sessionId || '',
    point_ledger_id: pointLedgerId || '',
    track_key: payload.track_key,
    track_version: payload.track_version,
    date_key: payload.date_key,
    identity: { source: identity.source, verified: identity.verified },
    ignored_fields: payload.ignored_fields
  }
})

// 发放（含按 session_key 的幂等采用与失败回滚）。返回 { ok, error? , ... }。
const performAward = async ({ db, payload, sessionId, rewardPoints, prevBalance, openId, nowIso, requestId }) => {
  const existingLedger = await findLedgerByBizId({ db, sessionKey: payload.session_key })

  let ledgerId = ''
  let newBalance = prevBalance
  let createdLedger = false

  if (existingLedger) {
    // 幂等采用：同一 session_key 已有账本条目（上一次部分失败的残留）⇒ 不再新增，直接对齐余额。
    ledgerId = getString(existingLedger._id)
    const recorded = toFiniteNumber(existingLedger.balance_after)
    newBalance = recorded === null ? prevBalance + rewardPoints : recorded
    logEvent(requestId, 'award_adopt_existing_ledger', { sessionKey: payload.session_key, ledgerId })
  } else {
    newBalance = prevBalance + rewardPoints
    const ledgerEntry = buildPointLedgerEntry({ payload, rewardPoints, balanceAfter: newBalance, nowIso })
    ledgerId = await addDocumentWithEnsure({ db, collection: COLLECTIONS.pointLedger, data: ledgerEntry, requestId })
    createdLedger = true
  }

  try {
    await setUserBalanceAndVerify({ db, userId: payload.user_id, balance: newBalance, nowIso })
    await upsertWalletAndVerify({ db, userId: payload.user_id, balance: newBalance, openId, nowIso })
    await updateSessionById({
      db,
      id: sessionId,
      patch: {
        awarded: true,
        reward_points: rewardPoints,
        balance_after: newBalance,
        point_ledger_id: ledgerId,
        status: 'awarded',
        updated_at: nowIso
      }
    })
    return { ok: true, awarded: true, rewardPoints, balanceAfter: newBalance, ledgerId }
  } catch (error) {
    logEvent(requestId, 'award_failed_rollback', { message: error?.message || 'UNKNOWN', createdLedger })
    // 失败取消：回滚账本 + 还原余额 + 会话标 award_failed（绝不半发、绝不重复创建）。
    if (createdLedger && ledgerId) {
      await removeLedgerById({ db, id: ledgerId }).catch(() => {})
    }
    await setUserBalanceAndVerify({ db, userId: payload.user_id, balance: prevBalance, nowIso }).catch(() => {})
    await upsertWalletAndVerify({ db, userId: payload.user_id, balance: prevBalance, openId: '', nowIso }).catch(() => {})
    await updateSessionById({ db, id: sessionId, patch: { status: 'award_failed', updated_at: nowIso } }).catch(() => {})
    return { ok: false, error: buildError(ERROR_CODES.awardCanceled, '发放失败，已取消本次发放（不留半发）', { reason: error?.message || 'UNKNOWN' }) }
  }
}

const handleReportCompletion = async ({ db, event, requestId }) => {
  const { input, ignoredFields } = buildReportInput(event)
  const validated = validateReportInput({ input, ignoredFields })
  if (!validated.ok) {
    return validated.error
  }

  const payload = validated.value
  const identity = resolveCallerIdentity({ event, userId: payload.user_id })

  // ①③ 音频存在性 + 各段时长不得超库内时长。
  const audioById = await fetchAudiosByIds({ db, ids: payload.selections.map((item) => item.audio_id) })
  const audioCheck = validateSelectionAudios({ selections: payload.selections, audioById })
  if (!audioCheck.ok) {
    return audioCheck.error
  }

  // ②⑤ 计时上界 + completed 一致性。
  const listeningCheck = assessListening({
    listenedSeconds: payload.listened_seconds,
    planTotalSeconds: payload.plan_total_seconds,
    completed: payload.completed
  })
  if (!listeningCheck.ok) {
    return listeningCheck.error
  }

  // 幂等（R50-④）：以 session_key（＋身份）为幂等键。
  const existingSession = await findSessionByKey({ db, sessionKey: payload.session_key })
  if (existingSession) {
    const existingIdentity = getString(existingSession.identity_key)
    if (existingIdentity && existingIdentity !== identity.identity_key) {
      return buildError(ERROR_CODES.sessionKeyConflict, 'session_key 已被其它身份占用', { session_key: payload.session_key })
    }

    const terminal = existingSession.awarded === true || existingSession.status === 'recorded' || existingSession.status === 'awarded'
    if (terminal) {
      return buildSuccessPayload({
        payload,
        identity,
        repeated: true,
        awarded: Boolean(existingSession.awarded),
        rewardPoints: existingSession.reward_points,
        balanceAfter: existingSession.balance_after,
        awardSkipReason: existingSession.awarded ? '' : 'repeat_no_award',
        sessionId: getString(existingSession._id),
        pointLedgerId: getString(existingSession.point_ledger_id)
      })
    }
    // 非终态（pending / award_failed）⇒ 复用该会话文档重试发放（幂等：账本按 biz_id 采用，不重复创建）。
  }

  // 发奖账号必须存在（先于任何写入判定；不存在 ⇒ 拒，不写）。
  const userDoc = await readUserDocument({ db, userId: payload.user_id })
  if (!userDoc) {
    return buildError(ERROR_CODES.userNotFound, '发奖账号（user_id）不存在', { user_id: payload.user_id })
  }

  // 单日发放上限（R50-⑥④）：超限 ⇒ 显式拒绝，不写。
  const dailyAwards = await countDailyAwards({ db, userId: payload.user_id, dateKey: payload.date_key })
  if (dailyAwards >= MAX_DAILY_REWARDS_PER_IDENTITY) {
    return buildError(ERROR_CODES.dailyAwardLimit, '已超过该身份单日发放上限', {
      date_key: payload.date_key,
      limit: MAX_DAILY_REWARDS_PER_IDENTITY,
      current: dailyAwards
    })
  }

  // 读取现有奖励配置（**不得自造字段**：`reward_points` / `allow_repeat_rewards`）。
  const settings = await readRewardSettings({ db })
  const alreadyAwarded = await hasAnyMeditationAward({ db, userId: payload.user_id })

  let rewardPoints = 0
  let awardSkipReason = ''

  if (settings.rewardPoints <= 0) {
    rewardPoints = 0
    awardSkipReason = 'zero_reward'
  } else if (settings.allowRepeatRewards === false && alreadyAwarded) {
    rewardPoints = 0
    awardSkipReason = 'allow_repeat_disabled'
  } else {
    rewardPoints = settings.rewardPoints
  }

  const nowIso = new Date().toISOString()

  // 写会话记录（先落 claim；`med_play_sessions` 仅云函数可写）。
  let sessionId = existingSession ? getString(existingSession._id) : ''
  if (!sessionId) {
    const sessionRecord = buildSessionRecord({
      payload,
      identity,
      planTotalSeconds: payload.plan_total_seconds,
      status: rewardPoints > 0 ? 'pending' : 'recorded',
      nowIso
    })
    sessionId = await addDocumentWithEnsure({ db, collection: COLLECTIONS.medPlaySessions, data: sessionRecord, requestId })
  }

  if (rewardPoints <= 0) {
    if (existingSession) {
      await updateSessionById({ db, id: sessionId, patch: { status: 'recorded', awarded: false, reward_points: 0, updated_at: nowIso } })
    }
    return buildSuccessPayload({
      payload,
      identity,
      repeated: false,
      awarded: false,
      rewardPoints: 0,
      balanceAfter: existingSession ? existingSession.balance_after : null,
      awardSkipReason,
      sessionId,
      pointLedgerId: ''
    })
  }

  const walletDoc = await readWalletDocument({ db, userId: payload.user_id })
  const prevBalance = toFiniteNumber(walletDoc?.balance) ?? toFiniteNumber(userDoc?.balance) ?? 0

  const awardResult = await performAward({
    db,
    payload,
    sessionId,
    rewardPoints,
    prevBalance,
    openId: getString(userDoc?._openid || userDoc?.openid),
    nowIso,
    requestId
  })

  if (!awardResult.ok) {
    return awardResult.error
  }

  return buildSuccessPayload({
    payload,
    identity,
    repeated: false,
    awarded: true,
    rewardPoints: awardResult.rewardPoints,
    balanceAfter: awardResult.balanceAfter,
    awardSkipReason: '',
    sessionId,
    pointLedgerId: awardResult.ledgerId
  })
}

const ACTION_HANDLERS = Object.freeze({
  [ACTIONS.reportCompletion]: handleReportCompletion
})

exports.main = async (event = {}) => {
  const requestId = buildRequestId()
  const startedAt = Date.now()

  if (!isPlainObject(event)) {
    return buildError(ERROR_CODES.invalidEvent, '入参必须是对象', {
      received_type: Array.isArray(event) ? 'array' : typeof event
    })
  }

  const actionResult = resolveAction(event)
  if (!actionResult.ok) {
    logEvent(requestId, 'invalid_action', { action: getString(event.action) })
    return actionResult.error
  }

  const action = actionResult.action
  const envId = resolveEnvId()

  try {
    const app = getCloudBaseApp(envId)
    const db = app.database()

    logEvent(requestId, 'started', {
      envId,
      action,
      withSecret: Boolean(readEnvValue('TENCENT_SECRET_ID', 'TENCENTCLOUD_SECRET_ID', 'VITE_TENCENT_SECRET_ID'))
    })

    const handler = ACTION_HANDLERS[action]
    const result = await handler({ app, db, event, requestId, envId })

    logEvent(requestId, 'completed', {
      action,
      ok: result.ok,
      repeated: result?.data?.repeated,
      awarded: result?.data?.awarded,
      durationMs: Date.now() - startedAt,
      error: result.ok ? '' : result.error
    })

    return {
      ...result,
      meta: {
        request_id: requestId,
        action,
        generated_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt
      }
    }
  } catch (error) {
    logEvent(requestId, 'failed', {
      action,
      durationMs: Date.now() - startedAt,
      message: error?.message || 'UNKNOWN_ERROR',
      stack: error?.stack || ''
    })

    return buildError(ERROR_CODES.reportFailed, error?.message || '上报失败', { action })
  }
}

// 本地自测 / QA 用：暴露内部函数以便用桩对象驱动**真实执行路径**（SCF 只调用 exports.main）。
exports.__test__ = {
  handleReportCompletion,
  performAward,
  fetchAudiosByIds,
  readRewardSettings,
  findSessionByKey,
  findLedgerByBizId,
  countDailyAwards,
  hasAnyMeditationAward,
  readUserDocument,
  readWalletDocument,
  setUserBalanceAndVerify,
  upsertWalletAndVerify,
  assertCloudBaseResult,
  assertWriteResult,
  ACTION_HANDLERS,
  COLLECTIONS
}
