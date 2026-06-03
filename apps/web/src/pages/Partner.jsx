import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCloudAwareness } from '@app/context/CloudAwarenessContext.jsx'
import { shopService, userProfileService } from '@app/services/cloudbase.js'
import { readSession } from '@liwu/auth'
import DatabaseService from '../admin/services/database.js'
import ShopManagement from '../admin/components/Dashboard/ShopManagement.jsx'
import {
  DEFAULT_SHOP_PARTNER_PRICING_SETTINGS,
  resolvePartnerDiscountPricing
} from '@liwu/shared-utils/shop-partner-pricing-settings.js'
import { DEFAULT_PLATFORM_SERVICE_FEE_SETTINGS } from '@liwu/shared-utils/platform-service-fee-settings.js'
import {
  BRAND_SCOPE_DEFINITIONS,
  resolveProductTypeByCategoryName
} from '@liwu/shared-utils/brand-scope-mapping.js'
import {
  COURSE_BRAND_SCOPE_TAG_NAME,
  resolveDailyBeansConsumption
} from '@liwu/shared-utils/fortune-daily-settlement-core.js'
import { BRAND_LEAD_ROLE_TAG_NAME, BRAND_MEMBER_ROLE_TAG_NAME } from '../admin/services/database.js'
import { useTheme } from '@app/context/ThemeContext.jsx'
import UserList from '../admin/components/Dashboard/UserList.jsx'
import UserEditModal from '../admin/components/Dashboard/UserEditModal.jsx'
import TagManager from '../admin/components/Dashboard/TagManager.jsx'
import TagStatistics from '../admin/components/Dashboard/TagStatistics.jsx'
import TagManagement from '../admin/components/Dashboard/TagManagement.jsx'
import DatabaseStatus from '../admin/components/Dashboard/DatabaseStatus.jsx'
import AwarenessTagSettings from '../admin/components/Dashboard/AwarenessTagSettings.jsx'
import ThemeSettings from '../admin/components/Dashboard/ThemeSettings.jsx'
import StudentMembershipSettings from '../admin/components/Dashboard/StudentMembershipSettings.jsx'
import MeditationPage from '../admin/components/Dashboard/MeditationPage.jsx'
import { useDatabase } from '../admin/hooks/useDatabase.js'
import '../admin/index.css'
const SUPER_ADMIN_ROLE_TAG_NAME = '超级管理员'
const ADMIN_ROLE_TAG_NAME = '管理员'
const AGENT_ROLE_TAG_NAME = '代理商'
const PARTNER_ROLE_SWITCH_COLLAPSED_KEY = 'liwu_partner_role_switch_collapsed'
const OVERVIEW_RANGE_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'week', label: '近 7 天' },
  { key: 'month', label: '近 30 天' },
  { key: 'quarter', label: '近 90 天' }
]
const ADMIN_TABS = [
  { key: 'overview', label: '总览' },
  { key: 'users', label: '用户' },
  { key: 'shop', label: '工坊' },
  { key: 'fortune', label: '福豆' },
  { key: 'meditation', label: '冥想' },
  { key: 'awareness', label: '觉察' },
  { key: 'settings', label: '设置' }
]

const createEmptyBrandSku = () => ({
  id: '',
  skuName: '',
  skuCode: '',
  pricePoints: 0,
  priceCash: 0,
  rewardPointsReturn: 0,
  stock: 0,
  status: 'active'
})

const createEmptyBrandGalleryItem = () => ({
  id: `gallery_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  url: '',
  showcaseEnabled: false,
  showcaseAspectRatio: ''
})

const normalizePhone = (value = '') => String(value || '').replace(/\D/g, '').slice(-11)

const buildDefaultStoreId = (user = {}) => {
  const explicitStoreId = String(user?.storeId || '').trim()
  if (explicitStoreId) {
    return explicitStoreId
  }

  const normalizedUid = Number(user?.uid || 0)
  if (normalizedUid > 0) {
    return `store_${normalizedUid}`
  }

  const userId = String(user?.id || '').trim()
  return userId ? `store_${userId}` : ''
}

const getPartnerUserCompletenessScore = (user = {}) => (
  (Array.isArray(user?.tags) ? user.tags.length * 10 : 0)
  + (String(user?.storeId || '').trim() ? 4 : 0)
  + (String(user?.storeOwnerUserId || '').trim() ? 3 : 0)
  + (String(user?.storeRole || '').trim() ? 2 : 0)
)

const pickPreferredPartnerUser = (users = []) => (
  [...users].sort((left, right) => getPartnerUserCompletenessScore(right) - getPartnerUserCompletenessScore(left))[0] || null
)

const mergePartnerUsers = (users = []) => {
  const normalizedUsers = Array.isArray(users) ? users.filter(Boolean) : []
  if (normalizedUsers.length === 0) {
    return null
  }

  const preferredUser = pickPreferredPartnerUser(normalizedUsers)
  if (!preferredUser) {
    return null
  }

  const mergedTagsByName = new Map()
  normalizedUsers.forEach((user) => {
    getValidTags(user.tags).forEach((tag) => {
      const tagName = getTagName(tag)
      if (tagName && !mergedTagsByName.has(tagName)) {
        mergedTagsByName.set(tagName, tag)
      }
    })
  })

  return {
    ...preferredUser,
    tags: [...mergedTagsByName.values()]
  }
}

const buildSyntheticPartnerUserFromBrand = ({
  brand = null,
  brandMember = null,
  fallbackCurrentUser = null,
  fallbackPhone = ''
} = {}) => {
  if (!brand) {
    return null
  }

  const ownerUserId = String(brand.ownerUserId || '').trim()
  if (!ownerUserId) {
    return null
  }

  const fallbackUser = fallbackCurrentUser || {}
  const nextPhone = normalizePhone(fallbackPhone || fallbackUser.phone || brand.contactPhone || '')

  return {
    ...(fallbackUser || {}),
    id: ownerUserId,
    uid: Number(fallbackUser.uid || 0) || 102,
    authUid: String(fallbackUser.authUid || '').trim(),
    phone: nextPhone,
    name: fallbackUser.name || brand.contactName || brand.name || '',
    storeId: String(brand.slug || '').trim(),
    storeName: String(brand.name || '').trim(),
    storeRole: brandMember?.role === 'owner' ? 'lead' : (fallbackUser.storeRole || 'lead'),
    storeOwnerUserId: ownerUserId,
    storeDescription: fallbackUser.storeDescription || brand.description || '',
    storeContact: fallbackUser.storeContact || brand.contactPhone || '',
    tags: Array.isArray(fallbackUser.tags) ? fallbackUser.tags : []
  }
}

const isDateWithinRange = (value, rangeKey = 'all') => {
  if (rangeKey === 'all') {
    return true
  }

  const timestamp = new Date(value || 0).getTime()
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return false
  }

  const now = Date.now()
  const diffMs = now - timestamp
  const dayMs = 24 * 60 * 60 * 1000
  const maxDays = rangeKey === 'week' ? 7 : rangeKey === 'month' ? 30 : 90
  return diffMs <= maxDays * dayMs
}

const readPartnerRoleSwitchCollapsed = () => {
  if (typeof window === 'undefined') {
    return true
  }

  const storedValue = window.localStorage.getItem(PARTNER_ROLE_SWITCH_COLLAPSED_KEY)
  return storedValue === null ? true : storedValue === '1'
}

const getTagName = (tag = {}) => String(tag.name || tag.label || '').trim();
const getValidTags = (tags = []) => (
  Array.isArray(tags)
    ? tags.filter((tag) => getTagName(tag))
    : []
)

const ROLE_CARDS = [
  {
    title: '代理商',
    points: [
      '浏览商品，可按供应商与大类筛选',
      '批量下单，后端自动按大类 + 供应商拆分子订单',
      '查看主订单与子订单、物流进度、再次购买入口',
      '按需直接联系供应商'
    ]
  },
  {
    title: '品牌方',
    points: [
      '查看总览、资金与账单，负责店铺经营协同',
      '编辑店铺信息，并邀请用户加入自己的店铺',
      '可进入商品管理与接单发货工作区',
      '每位主理人需绑定至少一个品牌品类标签'
    ]
  },
  {
    title: '管理员',
    points: [
      '管理大类与品类、供应商权限',
      '审核商品与供应商开通状态',
      '监控超时未发货与纠纷订单',
      '查看订单异常并介入处理'
    ]
  }
]

const MODULE_GROUPS = [
  {
    title: '代理商门户',
    sections: [
      { heading: '商品模块', body: '按大类浏览商品，支持搜索、筛选、批量加购与最小起订量限制。' },
      { heading: '购物车与订单', body: '支持跨供应商一起下单，提交后自动拆分为主订单与多个子订单。' },
      { heading: '物流跟踪', body: '按子订单维度展示多个包裹与快递进度。' },
      { heading: '消息与通讯', body: '站内信或第三方客服桥接。' },
      { heading: '对账展示', body: '展示每个子订单应付金额与支付状态。' }
    ]
  },
  {
    title: '品牌方后台',
    sections: [
      { heading: '商品管理', body: '商品 CRUD、批量导入导出、库存预警与大类限制。' },
      { heading: '接单发货', body: '待接单、确认接单、拒单、待发货、填写快递单号、历史订单。' },
      { heading: '发货合并提示', body: '可提示同一批发客户/主订单下的子订单是否合并包裹。' },
      { heading: '资金与账单', body: '记录收款与支付状态，并支持对账导出。' },
      { heading: '店铺设置', body: '店铺资料、发货地址、客服联系方式与成员邀请。' }
    ]
  },
  {
    title: '管理员后台',
    sections: [
      { heading: '供应商管理', body: '入驻审核、禁用启用、分配大类权限。' },
      { heading: '类目管理', body: '大类 / 品类创建与供应商范围绑定。' },
      { heading: '商品审核', body: '可选的供应商商品审核流。' },
      { heading: '异常监控', body: '超时未接单与纠纷订单查询。' }
    ]
  }
]

const ROLE_PORTAL_MAP = {
  代理商: {
    title: '代理商门户',
    modules: ['总览', '商品模块', '购物车与订单', '物流跟踪', '消息与通讯', '对账展示']
  },
  品牌方: {
    title: '品牌方后台',
    modules: ['总览', '商品管理', '接单发货', '发货合并提示', '资金与账单', '店铺设置']
  },
  管理员: {
    title: '管理员后台',
    modules: ['供应商管理', '类目管理', '商品审核', '异常监控']
  }
}

const MODULE_DETAIL_MAP = {
  总览: {
    summary: '当前身份的经营总览，聚焦关键累计金额与近期成交节奏。',
    bullets: [
      '汇总真实合作伙伴订单与子订单数据。',
      '使用已发货 / 已完成作为已确认口径。',
      '同时观察累计金额与近期成交走势。'
    ],
    actions: ['查看已确认订单', '进入对账展示', '导出汇总']
  },
  商品模块: {
    summary: '给批发客户的商品浏览入口，强调大类筛选、供应商供货提示、起订量和批量加购。',
    bullets: [
      '按大类浏览商品，不直接暴露供应商，但可用“由 XX 供货”小字提示来源。',
      '支持价格、库存、商品属性筛选。',
      '支持最小起订量与批量加购。',
      '为后续搜索、收藏、再购买预留入口。'
    ],
    actions: ['新建采购单', '导出商品清单', '批量加购']
  },
  '购物车与订单': {
    summary: '面向批发客户的订单工作区，核心是“一个主订单 + 多个子订单”的拆单视图。',
    bullets: [
      '跨供应商商品可一起下单，由后端按“大类 + 供应商”自动拆单。',
      '主订单视角汇总展示整体金额、状态和支付结果。',
      '子订单视角展示供应商、物流与再次购买。',
      '状态流转：待付款 → 待发货 → 已发货 → 已完成 / 退款维权。'
    ],
    actions: ['查看主订单', '查看子订单', '发起售后']
  },
  物流跟踪: {
    summary: '按子订单维度跟踪包裹，不同供应商各自拥有独立运单号和进度。',
    bullets: [
      '一个主订单可以展示多个包裹。',
      '每个包裹绑定一个供应商、一个快递单号。',
      '支持按时间线查看最新节点与签收状态。'
    ],
    actions: ['刷新物流', '异常上报']
  },
  '消息与通讯': {
    summary: '连接批发客户与供应商的客服通道。',
    bullets: [
      '站内信可用于订单协同与售后记录。',
      '也可跳转微信或第三方客服桥接。',
      '为后续虚拟号码与平台客服介入预留能力。'
    ],
    actions: ['新建会话', '转交平台客服']
  },
  对账展示: {
    summary: '批发客户的只读对账视图，用来确认每个子订单应付金额和支付状态。',
    bullets: [
      '按子订单展示应付金额。',
      '支持手动确认或后续支付回调更新状态。',
      '便于多供应商场景下快速核对收款进度。'
    ],
    actions: ['导出对账单', '标记已确认']
  },
  商品管理: {
    summary: '供应商的商品工作区，覆盖上架、编辑、库存、起订量与批量导入。',
    bullets: [
      '商品 CRUD。',
      '批量导入 / 导出。',
      '库存预警。',
      '受平台大类权限限制。'
    ],
    actions: ['新建商品', '批量导入', '导出库存']
  },
  接单发货: {
    summary: '供应商按子订单工作，确认接单、拒单、发货和查询历史。',
    bullets: [
      '待接单列表。',
      '确认接单后进入备货中。',
      '拒绝接单需填写原因并通知批发客户。',
      '发货时填写快递单号，进入已发货。'
    ],
    actions: ['确认接单', '拒绝接单', '填写单号']
  },
  发货合并提示: {
    summary: '同一供应商在同一天或同一主订单里，可按规则提示是否合并包裹。',
    bullets: [
      '系统提示可合并发货，但不强制。',
      '后续可按业务决定是否支持一包多子订单。'
    ],
    actions: ['查看合并建议', '拆分发货']
  },
  '资金与账单': {
    summary: '供应商视角的收款与账单记录区。',
    bullets: [
      '记录收款状态。',
      '展示每个子订单的支付状态。',
      '支持时间范围导出对账单。'
    ],
    actions: ['确认收款', '导出账单']
  },
  店铺设置: {
    summary: '供应商基础资料维护区。',
    bullets: [
      '发货地址',
      '退货地址',
      '客服联系方式'
    ],
    actions: ['编辑店铺资料']
  },
  供应商管理: {
    summary: '平台管理员管理供应商生命周期的入口。',
    bullets: [
      '入驻审核',
      '启用 / 禁用',
      '限制可操作大类'
    ],
    actions: ['审核供应商', '调整权限']
  },
  类目管理: {
    summary: '平台维护大类与品类，并绑定供应商可操作范围。',
    bullets: [
      '创建大类与品类',
      '绑定可选供应商范围',
      '决定前台筛选结构'
    ],
    actions: ['新建大类', '新建品类']
  },
  商品审核: {
    summary: '可选的供应商商品审核流。',
    bullets: [
      '开启后，供应商商品需平台审核通过才会展示给批发客户。',
      '支持审核意见记录。'
    ],
    actions: ['通过', '驳回']
  },
  异常监控: {
    summary: '平台介入处理异常订单与纠纷的工作区。',
    bullets: [
      '超时未接单提醒',
      '超时未发货提醒',
      '纠纷订单查询'
    ],
    actions: ['发送催办', '人工介入']
  }
}

const DATA_RELATIONS = [
  '大类（零食、饮料、日用品）',
  '品类（膨化食品、碳酸饮料）',
  '商品（SPU / SKU），归属于某个供应商',
  '主订单下按「大类 + 供应商」自动拆成多个子订单',
  '每个子订单对应一个供应商和一个快递单号'
]

const MODULE_PREVIEW_MAP = {
  商品模块: {
    columns: ['商品', '大类', '起订量', '库存', '供货方提示'],
    rows: [
      ['山茶香薰礼盒', '日常仪式', '12 件', '218', '由 S1 供货'],
      ['晨光玻璃杯', '空间器物', '24 件', '96', '由 S2 供货'],
      ['竹纤维收纳盒', '心意礼物', '10 件', '140', '由 S3 供货']
    ]
  },
  '购物车与订单': {
    columns: ['主订单', '子订单', '供应商', '状态', '金额'],
    rows: [
      ['PO-20260508-001', 'SO-A01', 'S1', '待付款', '¥1,280'],
      ['PO-20260508-001', 'SO-B01', 'S2', '待发货', '¥860'],
      ['PO-20260508-002', 'SO-C01', 'S3', '已发货', '¥540']
    ]
  },
  物流跟踪: {
    columns: ['子订单', '供应商', '快递单号', '最新节点', '状态'],
    rows: [
      ['SO-B01', 'S2', 'YT893445672', '上海分拨中心发出', '运输中'],
      ['SO-C01', 'S3', 'SF348902771', '客户签收', '已签收']
    ]
  },
  '消息与通讯': {
    columns: ['会话', '对象', '主题', '最近更新时间', '状态'],
    rows: [
      ['MSG-1001', '供应商 S1', '起订量确认', '05/08 10:40', '待回复'],
      ['MSG-1002', '平台客服', '物流异常咨询', '05/08 09:10', '处理中']
    ]
  },
  对账展示: {
    columns: ['子订单', '供应商', '应付金额', '支付状态', '备注'],
    rows: [
      ['SO-A01', 'S1', '¥1,280', '待确认', '线下转账'],
      ['SO-B01', 'S2', '¥860', '已确认', '平台回调已同步']
    ]
  },
  商品管理: {
    columns: ['商品', '大类', '库存', '起订量', '状态'],
    rows: [
      ['山茶香薰礼盒', '日常仪式', '218', '12 件', '上架中'],
      ['晨光玻璃杯', '空间器物', '96', '24 件', '待审核']
    ]
  },
  接单发货: {
    columns: ['子订单', '批发客户', '商品数', '当前状态', '操作'],
    rows: [
      ['SO-A01', '客户 A', '8', '待接单', '确认 / 拒单'],
      ['SO-A02', '客户 B', '5', '备货中', '填写单号']
    ]
  },
  发货合并提示: {
    columns: ['主订单', '子订单组', '供应商', '建议', '备注'],
    rows: [
      ['PO-20260508-001', 'SO-A01 + SO-A02', 'S1', '可合并发货', '同一客户、同一天']
    ]
  },
  '资金与账单': {
    columns: ['子订单', '收款金额', '支付状态', '对账单', '更新时间'],
    rows: [
      ['SO-A01', '¥1,280', '已确认', '导出', '05/08 11:30'],
      ['SO-A02', '¥540', '待确认', '导出', '05/08 09:40']
    ]
  },
  店铺设置: {
    columns: ['设置项', '当前值', '说明'],
    rows: [
      ['发货地址', '上海市闵行区 ×× 路', '用于默认出库'],
      ['退货地址', '上海市闵行区 ×× 仓', '售后退件'],
      ['客服联系方式', '微信 S1-service', '批发客户可见']
    ]
  },
  供应商管理: {
    columns: ['供应商', '负责大类', '状态', '最近订单', '操作'],
    rows: [
      ['S1', '日常仪式', '启用', 'SO-A01', '禁用 / 编辑'],
      ['S2', '空间器物', '审核中', '-', '通过 / 驳回']
    ]
  },
  类目管理: {
    columns: ['大类', '品类数', '供应商范围', '拆单规则'],
    rows: [
      ['日常仪式', '12', 'S1, S4', '按大类 + 供应商'],
      ['空间器物', '8', 'S2, S5', '按大类 + 供应商']
    ]
  },
  商品审核: {
    columns: ['商品', '供应商', '提交时间', '状态', '操作'],
    rows: [
      ['山茶香薰礼盒', 'S1', '05/08 08:40', '待审核', '通过 / 驳回'],
      ['晨光玻璃杯', 'S2', '05/07 17:10', '已驳回', '查看原因']
    ]
  },
  异常监控: {
    columns: ['异常单', '类型', '供应商', '持续时长', '处理动作'],
    rows: [
      ['SO-X01', '超时未接单', 'S3', '18 小时', '提醒 / 介入'],
      ['SO-X02', '超时未发货', 'S2', '31 小时', '催发 / 退款']
    ]
  }
}

const ROLE_METRICS_MAP = {
  代理商: [
    { label: '待付款主订单', value: '12' },
    { label: '运输中包裹', value: '7' },
    { label: '待确认对账', value: '4' }
  ],
  品牌方: [
    { label: '待接单子订单', value: '18' },
    { label: '待发货子订单', value: '9' },
    { label: '库存预警商品', value: '3' }
  ],
  管理员: [
    { label: '待审核供应商', value: '5' },
    { label: '异常订单', value: '11' },
    { label: '待处理纠纷', value: '2' }
  ]
}

const ROLE_BOARD_MAP = {
  代理商: [
    {
      title: '今日采购',
      items: ['待补货：晨光玻璃杯', '起订量提醒：山茶香薰礼盒', '推荐补单：竹纤维收纳盒']
    },
    {
      title: '订单进展',
      items: ['PO-20260508-001 待付款', 'SO-B01 待发货', 'SO-C01 物流更新']
    },
    {
      title: '需要联系',
      items: ['S1 起订量确认', 'S2 包裹异常签收', '平台客服：对账差异']
    }
  ],
  品牌方: [
    {
      title: '待接单',
      items: ['SO-A01 客户 A / 8 件', 'SO-A03 客户 C / 14 件', 'SO-A07 客户 D / 6 件']
    },
    {
      title: '待发货',
      items: ['SO-B11 已备货待填单号', 'SO-B12 已合并包裹待发', 'SO-B18 配送地址待确认']
    },
    {
      title: '资金账单',
      items: ['昨日待确认收款 3 笔', '本周导出账单', '退款申请 1 笔']
    }
  ],
  管理员: [
    {
      title: '待审核',
      items: ['供应商 S9 入驻申请', '商品：香氛礼盒待审核', '类目：空间器物新增品类']
    },
    {
      title: '异常跟进',
      items: ['SO-X01 超时未接单', 'SO-X02 超时未发货', '供应商 S3 连续拒单']
    },
    {
      title: '平台动作',
      items: ['发送催办提醒', '临时冻结供应商', '导出异常报表']
    }
  ]
}

const ROLE_PAGE_BLUEPRINTS = {
  代理商: [
    {
      title: '商品浏览页',
      areas: ['顶部筛选区', '大类 / 品类切换', '商品卡片瀑布流', '批量加购条']
    },
    {
      title: '订单中心',
      areas: ['主订单列表', '子订单抽屉', '物流轨迹', '再次购买']
    }
  ],
  品牌方: [
    {
      title: '接单工作台',
      areas: ['待接单列表', '备货中列表', '发货表单', '异常单提示']
    },
    {
      title: '商品管理页',
      areas: ['商品表格', '批量导入', '库存预警', '类目限制说明']
    }
  ],
  管理员: [
    {
      title: '供应商管理页',
      areas: ['供应商列表', '审核详情', '权限分配', '启用禁用开关']
    },
    {
      title: '异常监控页',
      areas: ['异常订单列表', '超时规则', '提醒记录', '人工介入备注']
    }
  ]
}

const ROLE_STATUS_FLOW = {
  代理商: ['待付款', '待发货', '已发货', '已完成 / 售后'],
  品牌方: ['待接单', '备货中', '待发货', '已发货'],
  管理员: ['待审核', '已通过', '异常中', '已关闭']
}

const MODULE_LAYOUT_MAP = {
  商品模块: ['筛选区', '商品网格', '批量加购条'],
  '购物车与订单': ['主订单列表', '子订单列表', '侧边详情'],
  物流跟踪: ['包裹列表', '物流时间线'],
  '消息与通讯': ['会话列表', '消息详情'],
  对账展示: ['对账筛选', '对子订单表格'],
  商品管理: ['商品表格', '库存预警卡', '批量操作'],
  接单发货: ['待接单列', '备货中列', '发货抽屉'],
  发货合并提示: ['合并建议列表', '包裹处理面板'],
  '资金与账单': ['收款记录', '导出面板'],
  店铺设置: ['基础资料', '地址设置', '客服设置'],
  供应商管理: ['供应商列表', '审核详情'],
  类目管理: ['大类树', '品类表单'],
  商品审核: ['审核列表', '审核结果详情'],
  异常监控: ['异常队列', '处理备注']
}

const ROLE_VIEW_PREVIEWS = {
  代理商: [
    {
      title: '商品浏览页原型',
      frame: ['顶部筛选', '大类切换', '商品卡片网格', '批量加购条']
    },
    {
      title: '订单中心原型',
      frame: ['主订单列表', '子订单列表', '物流抽屉', '再次购买']
    }
  ],
  品牌方: [
    {
      title: '接单工作台原型',
      frame: ['待接单列', '备货中列', '待发货列', '发货详情抽屉']
    },
    {
      title: '商品管理原型',
      frame: ['商品表格', '筛选区', '批量导入导出', '库存预警侧栏']
    }
  ],
  管理员: [
    {
      title: '供应商管理原型',
      frame: ['供应商列表', '审核详情面板', '权限分配区']
    },
    {
      title: '异常监控原型',
      frame: ['异常列表', '超时规则卡', '人工介入记录']
    }
  ]
}

const ROLE_SUBVIEW_MAP = {
  代理商: [
    {
      key: 'catalog',
      title: '商品列表',
      blocks: ['顶部筛选栏', '供应商与大类筛选', '商品网格', '批量加购浮条']
    },
    {
      key: 'orders',
      title: '订单中心',
      blocks: ['主订单列表', '子订单列表', '支付状态卡', '再次购买入口']
    },
    {
      key: 'logistics',
      title: '物流详情',
      blocks: ['包裹列表', '物流时间线', '异常申诉入口']
    }
  ],
  品牌方: [
    {
      key: 'intake',
      title: '待接单',
      blocks: ['待接单列', '订单摘要卡', '拒单原因面板']
    },
    {
      key: 'shipping',
      title: '发货台',
      blocks: ['备货中队列', '快递单号表单', '已发货列表']
    },
    {
      key: 'products',
      title: '商品管理',
      blocks: ['商品表格', '批量导入导出', '库存预警区']
    }
  ],
  管理员: [
    {
      key: 'suppliers',
      title: '供应商管理',
      blocks: ['供应商列表', '审核抽屉', '权限配置面板']
    },
    {
      key: 'taxonomy',
      title: '类目管理',
      blocks: ['大类树', '品类编辑表单', '供应商绑定区']
    },
    {
      key: 'alerts',
      title: '异常监控',
      blocks: ['异常队列', '超时规则卡', '人工介入记录']
    }
  ]
}

const ROLE_SCENARIO_MAP = {
  代理商: [
    '进入商品列表，先按大类和供应商筛选商品',
    '批量加购并校验最小起订量',
    '提交主订单，系统自动拆出多个子订单',
    '在订单中心查看主订单与各子订单状态',
    '进入物流详情查看多个包裹进度'
  ],
  品牌方: [
    '进入待接单列表确认属于自己的子订单',
    '确认接单或拒单并填写原因',
    '备货完成后填写快递单号并发货',
    '在资金账单区确认收款状态',
    '回到商品管理处理库存预警'
  ],
  管理员: [
    '审核新供应商与商品上架申请',
    '在类目管理页配置可选供应商范围',
    '进入异常监控处理超时未接单 / 未发货',
    '记录人工介入与处理结果',
    '导出异常报表或对账信息'
  ]
}

const AGENT_WORKSPACE_MAP = {
  总览: {
    title: '代理商经营总览',
    layout: {}
  },
  商品模块: {
    title: '代理商商品浏览台',
    layout: {
      filters: ['全部大类', '空间器物', '日常仪式', '心意礼物', '供应商：全部 / S1 / S2 / S3'],
      highlights: ['起订量提醒 3 条', '今日推荐补货 6 件', '跨供应商已选商品 14 件'],
      cards: [
        { name: '山茶香薰礼盒', meta: '日常仪式 · 由 S1 供货', price: '¥128 / 件', stock: '库存 218', action: '加入采购单' },
        { name: '晨光玻璃杯', meta: '空间器物 · 由 S2 供货', price: '¥36 / 件', stock: '库存 96', action: '加入采购单' },
        { name: '竹纤维收纳盒', meta: '心意礼物 · 由 S3 供货', price: '¥58 / 件', stock: '库存 140', action: '加入采购单' }
      ]
    }
  },
  '购物车与订单': {
    title: '代理商订单中心',
    layout: {
      summary: ['主订单 12', '子订单 28', '待付款 4', '待确认对账 3'],
      primaryRows: [
        ['PO-20260508-001', '3 个子订单', '¥2,140', '待付款'],
        ['PO-20260508-002', '2 个子订单', '¥860', '待发货']
      ],
      secondaryRows: [
        ['SO-A01', 'S1', '日常仪式', '待付款'],
        ['SO-B01', 'S2', '空间器物', '待发货'],
        ['SO-C01', 'S3', '心意礼物', '已发货']
      ]
    }
  },
  物流跟踪: {
    title: '代理商物流跟踪台',
    layout: {
      packages: [
        { no: 'YT893445672', supplier: 'S2', state: '运输中', trace: '上海分拨中心发出 · 05/08 12:30' },
        { no: 'SF348902771', supplier: 'S3', state: '已签收', trace: '客户签收 · 05/07 18:12' }
      ],
      side: ['异常申诉入口', '包裹合并视图', '客服协同记录']
    }
  },
  '消息与通讯': {
    title: '代理商协同会话台',
    layout: {
      conversations: [
        { name: '供应商 S1', topic: '起订量确认', state: '待回复' },
        { name: '供应商 S2', topic: '发货时间协商', state: '处理中' },
        { name: '平台客服', topic: '对账差异', state: '已升级' }
      ],
      detail: ['会话记录', '快捷回复', '转交平台客服', '外部客服桥接']
    }
  },
  对账展示: {
    title: '代理商对账中心',
    layout: {
      summary: ['应付总额 ¥8,420', '待确认 ¥1,860', '本周已确认 9 笔'],
      rows: [
        ['SO-A01', 'S1', '¥1,280', '待确认'],
        ['SO-B01', 'S2', '¥860', '已确认'],
        ['SO-C01', 'S3', '¥540', '已确认']
      ],
      tools: ['导出对账单', '标记已确认', '发起差异核对']
    }
  }
}

const PARTNER_CONFIRMED_STATUSES = ['shipped', 'completed', '已发货'];

const formatOverviewCurrency = (value = 0) => `¥${Number(value || 0).toLocaleString('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`

const formatOverviewShortDate = (value) => {
  const date = new Date(value || 0)

  if (Number.isNaN(date.getTime())) {
    return '待更新'
  }

  return date.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric'
  })
}

const formatOverviewDateTime = (value) => {
  const date = new Date(value || 0)

  if (Number.isNaN(date.getTime())) {
    return '待更新'
  }

  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

const startOfTodayInShanghai = () => {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const dateText = formatter.format(now)
  return new Date(`${dateText}T00:00:00+08:00`)
}

const isPhysicalProductCategoryName = (categoryName = '') => (
  resolveProductTypeByCategoryName(categoryName) === 'physical'
)

const resolveHeartLampStatus = (balance = 0, dailyConsumption = 0) => {
  if (balance <= 0) {
    return 'extinguished'
  }

  if (dailyConsumption <= 0) {
    return 'active'
  }

  const remainingDays = balance / dailyConsumption
  if (remainingDays <= 1) {
    return 'warning'
  }

  return 'active'
}

const OverviewMetricCard = ({ label, value, description, tone = 'default' }) => {
  const toneMap = {
    default: {
      background: '#fff',
      borderColor: 'rgba(209, 209, 199, 0.9)',
      valueColor: 'var(--color-text-primary)'
    },
    clay: {
      background: '#fff7f2',
      borderColor: 'rgba(214, 140, 101, 0.26)',
      valueColor: '#9a5a37'
    },
    olive: {
      background: '#f5f8ee',
      borderColor: 'rgba(107, 142, 35, 0.22)',
      valueColor: '#58751d'
    },
    ink: {
      background: '#f4f4f1',
      borderColor: 'rgba(44, 44, 44, 0.12)',
      valueColor: 'var(--color-accent-ink)'
    }
  }

  const activeTone = toneMap[tone] || toneMap.default

  return (
    <div
      style={{
        borderRadius: '16px',
        backgroundColor: activeTone.background,
        border: `1px solid ${activeTone.borderColor}`,
        padding: '16px',
        display: 'grid',
        gap: '8px'
      }}
    >
      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: '28px', lineHeight: 1, fontWeight: 700, color: activeTone.valueColor }}>
        {value}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
        {description}
      </div>
    </div>
  )
}

const OverviewSectionCard = ({ title, description, children }) => (
  <div
    style={{
      borderRadius: '18px',
      backgroundColor: '#fff',
      border: '1px solid var(--color-border)',
      padding: '18px',
      display: 'grid',
      gap: '14px'
    }}
  >
    <div style={{ display: 'grid', gap: '6px' }}>
      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{title}</div>
      {description && (
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
          {description}
        </div>
      )}
    </div>
    {children}
  </div>
)

const OverviewListRow = ({ title, meta, value, badge, badgeTone = 'default' }) => {
  const badgeToneMap = {
    default: {
      background: '#f3f4f1',
      color: '#5b645d'
    },
    clay: {
      background: '#fff1e8',
      color: '#9a5a37'
    },
    olive: {
      background: '#eef5df',
      color: '#58751d'
    }
  }

  const activeBadgeTone = badgeToneMap[badgeTone] || badgeToneMap.default

  return (
    <div
      style={{
        borderRadius: '14px',
        backgroundColor: '#fbfbf8',
        border: '1px solid rgba(209, 209, 199, 0.72)',
        padding: '14px 16px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.2fr) auto auto',
        gap: '14px',
        alignItems: 'center'
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{title}</div>
        {meta && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            {meta}
          </div>
        )}
      </div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>{value}</div>
      {badge ? (
        <span
          style={{
            justifySelf: 'end',
            borderRadius: '999px',
            padding: '8px 10px',
            backgroundColor: activeBadgeTone.background,
            color: activeBadgeTone.color,
            fontSize: '12px',
            fontWeight: 700,
            whiteSpace: 'nowrap'
          }}
        >
          {badge}
        </span>
      ) : null}
    </div>
  )
}

const Partner = () => {
  const { authStatus, currentUser, userTags, loading } = useCloudAwareness()
  const { themePreset } = useTheme()
  const liwuSession = readSession()
  const [resolvedProfileUser, setResolvedProfileUser] = useState(null)
  const effectiveAuthStatus = authStatus?.isAuthenticated || liwuSession?.phone
    ? {
        ...authStatus,
        isAuthenticated: true,
        isAnonymous: false,
        phoneNumber: liwuSession?.phone || authStatus?.phoneNumber || '',
        displayName: liwuSession?.displayName || authStatus?.displayName || ''
      }
    : authStatus
  const sessionBackedUser = useMemo(() => {
    const sessionUserId = String(liwuSession?.userId || authStatus?.userId || currentUser?.id || '').trim()
    const sessionUid = Number(liwuSession?.uid || authStatus?.uid || currentUser?.uid || 0)
    const sessionAuthUid = String(liwuSession?.authUid || authStatus?.authUid || currentUser?.authUid || '').trim()
    const sessionPhone = normalizePhone(liwuSession?.phone || authStatus?.phoneNumber || currentUser?.phone || '')

    if (!sessionUserId && sessionUid <= 0 && !sessionAuthUid && !sessionPhone) {
      return null
    }

    return {
      ...(currentUser || {}),
      id: sessionUserId || currentUser?.id || '',
      uid: sessionUid || Number(currentUser?.uid || 0) || 0,
      authUid: sessionAuthUid || currentUser?.authUid || '',
      phone: sessionPhone || currentUser?.phone || '',
      name: liwuSession?.displayName || authStatus?.displayName || currentUser?.name || '',
      storeId: currentUser?.storeId || '',
      storeName: currentUser?.storeName || '',
      storeRole: currentUser?.storeRole || '',
      storeOwnerUserId: currentUser?.storeOwnerUserId || ''
    }
  }, [
    authStatus?.authUid,
    authStatus?.displayName,
    authStatus?.phoneNumber,
    authStatus?.uid,
    authStatus?.userId,
    currentUser,
    liwuSession?.authUid,
    liwuSession?.displayName,
    liwuSession?.phone,
    liwuSession?.uid,
    liwuSession?.userId
  ])
  const effectiveCurrentUser = resolvedProfileUser || currentUser || sessionBackedUser || null
  const hasEffectiveSession = Boolean(
    effectiveAuthStatus?.isAuthenticated ||
    effectiveCurrentUser?.id ||
    effectiveCurrentUser?.phone ||
    effectiveCurrentUser?.authUid
  )
  const displayUser = resolvedProfileUser || effectiveCurrentUser || currentUser || null
  const [activeRole, setActiveRole] = useState('代理商')
  const [activeModule, setActiveModule] = useState('商品模块')
  const [activeSubviewKey, setActiveSubviewKey] = useState('catalog')
  const [verifiedPhone, setVerifiedPhone] = useState('')
  const [adminTab, setAdminTab] = useState('overview')
  const [roleSwitchCollapsed, setRoleSwitchCollapsed] = useState(readPartnerRoleSwitchCollapsed)
  const [overviewRange, setOverviewRange] = useState('all')
  const [agentCart, setAgentCart] = useState([])
  const [selectedAgentCategory, setSelectedAgentCategory] = useState('全部大类')
  const [selectedAgentSupplier, setSelectedAgentSupplier] = useState('全部')
  const [liveShopCategories, setLiveShopCategories] = useState([])
  const [liveShopProducts, setLiveShopProducts] = useState([])
  const [liveShopOrders, setLiveShopOrders] = useState([])
  const [liveShopOrderItems, setLiveShopOrderItems] = useState([])
  const [livePartnerOrders, setLivePartnerOrders] = useState([])
  const [livePartnerSubOrders, setLivePartnerSubOrders] = useState([])
  const [livePartnerUsers, setLivePartnerUsers] = useState([])
  const [liveCurrentUserTags, setLiveCurrentUserTags] = useState([])
  const [livePartnerBrands, setLivePartnerBrands] = useState([])
  const [livePartnerBrandMembers, setLivePartnerBrandMembers] = useState([])
  const [livePartnerBrandInvites, setLivePartnerBrandInvites] = useState([])
  const [shopPartnerPricingSettings, setShopPartnerPricingSettings] = useState(DEFAULT_SHOP_PARTNER_PRICING_SETTINGS)
  const [platformServiceFeeSettings, setPlatformServiceFeeSettings] = useState(DEFAULT_PLATFORM_SERVICE_FEE_SETTINGS)
  const [brandOrderStatuses, setBrandOrderStatuses] = useState({})
  const [submittedAgentOrder, setSubmittedAgentOrder] = useState(null)
  const [storeDraft, setStoreDraft] = useState({
    storeName: '',
    storeDescription: '',
    storeContact: '',
    storeContactName: '',
    storeWechat: '',
    communityBeansBalance: 0,
    shippingReceiver: '',
    shippingPhone: '',
    shippingDetail: '',
    returnReceiver: '',
    returnPhone: '',
    returnDetail: '',
    returnSameAsShipping: true
  })
  const [storeMemberQuery, setStoreMemberQuery] = useState('')
  const [savingStoreProfile, setSavingStoreProfile] = useState(false)
  const [invitingStoreMemberId, setInvitingStoreMemberId] = useState('')
  const [partnerDataErrors, setPartnerDataErrors] = useState({
    categories: '',
    products: '',
    orders: '',
    pricing: '',
    partnerOrders: '',
    users: '',
    brands: ''
  })
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(true)

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined
    }

    const previousTitle = document.title
    document.title = '理悟™｜合作伙伴后台'
    document.body.classList.add('liwu-web-admin-route')
    document.documentElement.classList.add('liwu-web-admin-route')

    return () => {
      document.title = previousTitle
      document.body.classList.remove('liwu-web-admin-route')
      document.documentElement.classList.remove('liwu-web-admin-route')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const nextProfile = await userProfileService.getCurrentProfile({
          refresh: true,
          allowAnonymous: true
        })
        if (!cancelled) {
          setResolvedProfileUser(nextProfile || null)
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Partner page failed to refresh current profile:', error)
          setResolvedProfileUser(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [effectiveAuthStatus?.authUid, effectiveAuthStatus?.phoneNumber])

  useEffect(() => {
    setVerifiedPhone(effectiveAuthStatus?.phoneNumber || effectiveCurrentUser?.phone || '')
    return undefined
  }, [effectiveAuthStatus?.authUid, effectiveAuthStatus?.phoneNumber, effectiveCurrentUser?.id, effectiveCurrentUser?.phone])

  useEffect(() => {
    if (loading && !hasEffectiveSession) {
      return undefined
    }

    let cancelled = false

    void (async () => {
      try {
        const [categoriesResult, productsResult] = await Promise.allSettled([
          shopService.getCategories(),
          shopService.getProducts({ limit: 24 })
        ])

        const categories = categoriesResult.status === 'fulfilled' ? categoriesResult.value : []
        const products = productsResult.status === 'fulfilled' ? productsResult.value : []

        const [shopManagementResult, pricingSettingsResult, platformServiceFeeSettingsResult, partnerOrderResult, partnerUsersResult, partnerBrandsResult] = await Promise.allSettled([
          DatabaseService.getShopManagementData(),
          DatabaseService.getShopPartnerPricingSettings(),
          DatabaseService.getPlatformServiceFeeSettings(),
          DatabaseService.getPartnerOrderData(),
          DatabaseService.getPartnerUsers(),
          DatabaseService.getPartnerBrandWorkspaceData()
        ])

        const shopManagementData = shopManagementResult.status === 'fulfilled'
          ? shopManagementResult.value
          : { products: [], orders: [], orderItems: [] }
        const nextShopPartnerPricingSettings = pricingSettingsResult.status === 'fulfilled'
          ? pricingSettingsResult.value
          : DEFAULT_SHOP_PARTNER_PRICING_SETTINGS
        const nextPlatformServiceFeeSettings = platformServiceFeeSettingsResult.status === 'fulfilled'
          ? platformServiceFeeSettingsResult.value
          : DEFAULT_PLATFORM_SERVICE_FEE_SETTINGS
        const nextPartnerOrderData = partnerOrderResult.status === 'fulfilled'
          ? partnerOrderResult.value
          : { orders: [], subOrders: [] }
        const nextPartnerUsers = partnerUsersResult.status === 'fulfilled' ? partnerUsersResult.value : []
        const nextPartnerBrands = partnerBrandsResult.status === 'fulfilled'
          ? partnerBrandsResult.value
          : { brands: [], members: [], invites: [] }

        const nextManagedProducts = shopManagementResult.status === 'fulfilled'
          ? (shopManagementData.products || [])
          : null

        if (!cancelled) {
          setLiveShopCategories(categories)
          setLiveShopProducts(nextManagedProducts || products)
          setLiveShopOrders(shopManagementData.orders || [])
          setLiveShopOrderItems(shopManagementData.orderItems || [])
          setLivePartnerOrders(nextPartnerOrderData.orders || [])
          setLivePartnerSubOrders(nextPartnerOrderData.subOrders || [])
          setLivePartnerUsers(nextPartnerUsers)
          setLivePartnerBrands(nextPartnerBrands.brands || [])
          setLivePartnerBrandMembers(nextPartnerBrands.members || [])
          setLivePartnerBrandInvites(nextPartnerBrands.invites || [])
          setShopPartnerPricingSettings(nextShopPartnerPricingSettings || DEFAULT_SHOP_PARTNER_PRICING_SETTINGS)
          setPlatformServiceFeeSettings(nextPlatformServiceFeeSettings || DEFAULT_PLATFORM_SERVICE_FEE_SETTINGS)
          setPartnerDataErrors({
            categories: categoriesResult.status === 'rejected' ? (categoriesResult.reason?.message || '分类加载失败') : '',
            products: productsResult.status === 'rejected' ? (productsResult.reason?.message || '商品加载失败') : '',
            orders: shopManagementResult.status === 'rejected' ? (shopManagementResult.reason?.message || '订单加载失败') : '',
            pricing: pricingSettingsResult.status === 'rejected' ? (pricingSettingsResult.reason?.message || '代理商折扣设置加载失败') : '',
            partnerOrders: partnerOrderResult.status === 'rejected' ? (partnerOrderResult.reason?.message || '合作方订单加载失败') : '',
            users: partnerUsersResult.status === 'rejected' ? (partnerUsersResult.reason?.message || '合作方用户加载失败') : '',
            brands: partnerBrandsResult.status === 'rejected' ? (partnerBrandsResult.reason?.message || '品牌店铺加载失败') : ''
          })
        }
      } catch {
        if (!cancelled) {
          setLiveShopCategories([])
          setLiveShopProducts([])
          setLiveShopOrders([])
          setLiveShopOrderItems([])
          setLivePartnerOrders([])
          setLivePartnerSubOrders([])
          setLivePartnerUsers([])
          setLivePartnerBrands([])
          setLivePartnerBrandMembers([])
          setLivePartnerBrandInvites([])
          setShopPartnerPricingSettings(DEFAULT_SHOP_PARTNER_PRICING_SETTINGS)
          setPlatformServiceFeeSettings(DEFAULT_PLATFORM_SERVICE_FEE_SETTINGS)
          setPartnerDataErrors({
            categories: '分类加载失败',
            products: '商品加载失败',
            orders: '订单加载失败',
            pricing: '代理商折扣设置加载失败',
            partnerOrders: '合作方订单加载失败',
            users: '合作方用户加载失败',
            brands: '品牌店铺加载失败'
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [effectiveAuthStatus?.phoneNumber, effectiveCurrentUser?.phone, hasEffectiveSession, loading, verifiedPhone])

  const activeRoleDataKey = useMemo(() => activeRole, [activeRole])
  const activePortal = useMemo(() => ROLE_PORTAL_MAP[activeRole] || ROLE_PORTAL_MAP['代理商'], [activeRole])
  const activeGroup = useMemo(
    () => MODULE_GROUPS.find((group) => group.title === activePortal.title) || MODULE_GROUPS[0],
    [activePortal]
  )
  const activeModuleDetail = useMemo(
    () => MODULE_DETAIL_MAP[activeModule] || { summary: '', bullets: [], actions: [] },
    [activeModule]
  )
  const activeModulePreview = useMemo(
    () => MODULE_PREVIEW_MAP[activeModule] || { columns: [], rows: [] },
    [activeModule]
  )
  const activeLayoutBlocks = useMemo(() => MODULE_LAYOUT_MAP[activeModule] || [], [activeModule])
  const activeMetrics = useMemo(() => ROLE_METRICS_MAP[activeRoleDataKey] || [], [activeRoleDataKey])
  const activeBoard = useMemo(() => ROLE_BOARD_MAP[activeRoleDataKey] || [], [activeRoleDataKey])
  const activeBlueprints = useMemo(() => ROLE_PAGE_BLUEPRINTS[activeRoleDataKey] || [], [activeRoleDataKey])
  const activeStatusFlow = useMemo(() => ROLE_STATUS_FLOW[activeRoleDataKey] || [], [activeRoleDataKey])
  const activeRoleViews = useMemo(() => ROLE_VIEW_PREVIEWS[activeRoleDataKey] || [], [activeRoleDataKey])
  const activeSubViews = useMemo(() => ROLE_SUBVIEW_MAP[activeRoleDataKey] || [], [activeRoleDataKey])
  const activeScenario = useMemo(() => ROLE_SCENARIO_MAP[activeRoleDataKey] || [], [activeRoleDataKey])
  const resolvedPartnerUser = useMemo(() => {
    const currentId = String(effectiveCurrentUser?.id || '').trim()
    const currentAuthUid = String(effectiveCurrentUser?.authUid || effectiveAuthStatus?.authUid || '').trim()
    const currentUid = Number(effectiveCurrentUser?.uid || 0)
    const currentPhoneCandidate = normalizePhone(effectiveCurrentUser?.phone || effectiveAuthStatus?.phoneNumber || verifiedPhone || '')

    const usersById = currentId
      ? livePartnerUsers.filter((user) => String(user.id || '').trim() === currentId)
      : []
    const usersByAuthUid = currentAuthUid
      ? livePartnerUsers.filter((user) => String(user.authUid || '').trim() === currentAuthUid)
      : []
    const usersByUid = currentUid > 0
      ? livePartnerUsers.filter((user) => Number(user.uid || 0) === currentUid)
      : []
    const usersByPhone = currentPhoneCandidate
      ? livePartnerUsers.filter((user) => normalizePhone(user.phone || '') === currentPhoneCandidate)
      : []

    return mergePartnerUsers(usersById)
      || mergePartnerUsers(usersByAuthUid)
      || mergePartnerUsers(usersByUid)
      || mergePartnerUsers(usersByPhone)
      || buildSyntheticPartnerUserFromBrand({
        brand: livePartnerBrands.length === 1 ? livePartnerBrands[0] : null,
        brandMember: livePartnerBrandMembers.length === 1 ? livePartnerBrandMembers[0] : null,
        fallbackCurrentUser: effectiveCurrentUser,
        fallbackPhone: currentPhoneCandidate
      })
      || effectiveCurrentUser
      || null
  }, [
    effectiveAuthStatus?.authUid,
    effectiveAuthStatus?.phoneNumber,
    effectiveCurrentUser,
    livePartnerBrandMembers,
    livePartnerBrands,
    livePartnerUsers,
    verifiedPhone
  ])
  const effectiveUserTags = useMemo(
    () => {
      if (Array.isArray(liveCurrentUserTags) && liveCurrentUserTags.length > 0) {
        return getValidTags(liveCurrentUserTags)
      }

      const resolvedTags = getValidTags(resolvedPartnerUser?.tags)
      if (resolvedTags.length > 0) {
        return resolvedTags
      }

      return getValidTags(userTags)
    },
    [liveCurrentUserTags, resolvedPartnerUser, userTags]
  )
  useEffect(() => {
    const targetUserId = String(resolvedPartnerUser?.id || '').trim()
    if (!targetUserId) {
      setLiveCurrentUserTags([])
      return undefined
    }

    let cancelled = false

    void (async () => {
      try {
        const nextTags = await DatabaseService.getUserTags(targetUserId)
        if (!cancelled) {
          setLiveCurrentUserTags(getValidTags(nextTags))
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Partner page failed to load current user tags:', error)
          setLiveCurrentUserTags([])
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [resolvedPartnerUser?.id])
  const currentRoleTagNames = useMemo(
    () => (effectiveUserTags || []).map(getTagName).filter(Boolean),
    [effectiveUserTags]
  )
  const adminAuthorized = currentRoleTagNames.includes(SUPER_ADMIN_ROLE_TAG_NAME) || currentRoleTagNames.includes(ADMIN_ROLE_TAG_NAME)
  const isAgentUser = currentRoleTagNames.includes(AGENT_ROLE_TAG_NAME)
  const isBrandLead = currentRoleTagNames.includes(BRAND_LEAD_ROLE_TAG_NAME) || resolvedPartnerUser?.storeRole === 'lead'
  const isBrandMember = currentRoleTagNames.includes(BRAND_MEMBER_ROLE_TAG_NAME) || resolvedPartnerUser?.storeRole === 'member'
  const displayUid = useMemo(() => {
    if (liwuSession?.uid) {
      return Number(liwuSession.uid || 0)
    }

    if (resolvedProfileUser?.uid) {
      return resolvedProfileUser.uid
    }

    if (resolvedPartnerUser?.uid) {
      return resolvedPartnerUser.uid
    }

    if (effectiveCurrentUser?.uid) {
      return effectiveCurrentUser.uid
    }

    const currentPhoneCandidate = normalizePhone(effectiveCurrentUser?.phone || effectiveAuthStatus?.phoneNumber || verifiedPhone || '')
    const currentAuthUid = String(effectiveCurrentUser?.authUid || effectiveAuthStatus?.authUid || '').trim()
    const matchedUser = livePartnerUsers.find((user) => (
      (currentAuthUid && String(user.authUid || '').trim() === currentAuthUid)
      || (currentPhoneCandidate && normalizePhone(user.phone || '') === currentPhoneCandidate)
    )) || null

    return matchedUser?.uid || 0
  }, [
    effectiveAuthStatus?.authUid,
    effectiveAuthStatus?.phoneNumber,
    effectiveCurrentUser,
    liwuSession?.uid,
    livePartnerUsers,
    resolvedPartnerUser?.uid,
    resolvedProfileUser?.uid,
    verifiedPhone
  ])
  const currentBrandScopeTagNames = useMemo(
    () => currentRoleTagNames.filter((tagName) => BRAND_SCOPE_DEFINITIONS.some((definition) => definition.tagName === tagName)),
    [currentRoleTagNames]
  )
  const currentStoreId = useMemo(
    () => buildDefaultStoreId(resolvedPartnerUser || effectiveCurrentUser || {}),
    [effectiveCurrentUser, resolvedPartnerUser]
  )
  const currentStoreName = String(resolvedPartnerUser?.storeName || '').trim()
  const currentStoreOwnerUserId = String(
    resolvedPartnerUser?.storeOwnerUserId
    || effectiveCurrentUser?.storeOwnerUserId
    || resolvedPartnerUser?.id
    || effectiveCurrentUser?.id
    || ''
  ).trim()
  const activeBrandMembership = useMemo(
    () => livePartnerBrandMembers.find((member) => member.userId === resolvedPartnerUser?.id && member.status === 'active') || null,
    [livePartnerBrandMembers, resolvedPartnerUser?.id]
  )
  const activeBrand = useMemo(() => (
    livePartnerBrands.find((brand) => brand.id === activeBrandMembership?.brandId)
    || livePartnerBrands.find((brand) => String(brand.ownerUserId || '').trim() === currentStoreOwnerUserId)
    || livePartnerBrands.find((brand) => String(brand.ownerUserId || '').trim() === String(resolvedPartnerUser?.id || '').trim())
    || livePartnerBrands.find((brand) => String(brand.slug || '').trim() === currentStoreId)
    || null
  ), [activeBrandMembership?.brandId, currentStoreId, currentStoreOwnerUserId, livePartnerBrands, resolvedPartnerUser?.id])
  const activeBrandInvites = useMemo(
    () => livePartnerBrandInvites.filter((invite) => invite.brandId === activeBrand?.id),
    [activeBrand?.id, livePartnerBrandInvites]
  )
  const visibleStoreMembers = useMemo(
    () => livePartnerBrandMembers
      .filter((member) => member.brandId === activeBrand?.id && member.status === 'active')
      .map((member) => {
        const matchedUser = livePartnerUsers.find((user) => user.id === member.userId) || null
        return matchedUser
          ? { ...matchedUser, brandMemberRole: member.role }
          : null
      })
      .filter(Boolean),
    [activeBrand?.id, livePartnerBrandMembers, livePartnerUsers]
  )
  const storeInviteCandidates = useMemo(() => {
    const normalizedQuery = String(storeMemberQuery || '').trim().toLowerCase()
    return livePartnerUsers
      .filter((user) => user.id !== currentUser?.id)
      .filter((user) => user.id !== effectiveCurrentUser?.id)
      .filter((user) => !currentStoreId || String(user.storeId || '').trim() !== currentStoreId)
      .filter((user) => {
        if (!normalizedQuery) {
          return true
        }

        return (
          String(user.name || '').toLowerCase().includes(normalizedQuery) ||
          String(user.phone || '').toLowerCase().includes(normalizedQuery) ||
          String(user.uid || '').includes(normalizedQuery)
        )
      })
      .slice(0, 8)
  }, [currentStoreId, effectiveCurrentUser?.id, livePartnerUsers, storeMemberQuery])
  const activeAgentWorkspace = useMemo(
    () => (activeRole === '代理商' ? AGENT_WORKSPACE_MAP[activeModule] || null : null),
    [activeRole, activeModule]
  )
  const agentCartSummary = useMemo(() => {
    const count = agentCart.length
    const listAmount = agentCart.reduce((sum, item) => sum + Number(item.unitPrice || 0), 0)
    const pricing = resolvePartnerDiscountPricing(listAmount, shopPartnerPricingSettings)
    const partnerAgentServiceFeeRate = Math.max(0, Number(platformServiceFeeSettings.partnerAgentRate || 0))
    const platformServiceFeeAmount = Number((pricing.payableAmount * partnerAgentServiceFeeRate).toFixed(2))
    const merchantSettleAmount = Number((pricing.payableAmount - platformServiceFeeAmount).toFixed(2))
    return {
      count,
      listAmount: pricing.listAmount,
      discountedTotal: pricing.payableAmount,
      platformServiceFeeRate: partnerAgentServiceFeeRate,
      platformServiceFeeAmount,
      merchantSettleAmount,
      discountRate: pricing.discountRate,
      matchedThreshold: pricing.matchedThreshold,
      suppliers: new Set(agentCart.map((item) => item.supplier)).size
    }
  }, [agentCart, platformServiceFeeSettings.partnerAgentRate, shopPartnerPricingSettings])
  const agentCartSubOrders = useMemo(() => {
    const groupedMap = new Map()
    agentCart.forEach((item) => {
      const groupKey = `${item.category}__${item.supplier}`
      const currentGroup = groupedMap.get(groupKey) || {
        key: groupKey,
        category: item.category,
        supplier: item.supplier,
        brandId: item.brandId || '',
        storeId: item.storeId || '',
        items: [],
        listAmount: 0
      }
      currentGroup.items.push(item)
      currentGroup.listAmount += Number(item.unitPrice || 0)
      groupedMap.set(groupKey, currentGroup)
    })

    return Array.from(groupedMap.values()).map((group, index) => {
      const pricing = resolvePartnerDiscountPricing(group.listAmount, shopPartnerPricingSettings)
      const partnerAgentServiceFeeRate = Math.max(0, Number(platformServiceFeeSettings.partnerAgentRate || 0))
      const platformServiceFeeAmount = Number((pricing.payableAmount * partnerAgentServiceFeeRate).toFixed(2))
      const merchantSettleAmount = Number((pricing.payableAmount - platformServiceFeeAmount).toFixed(2))
      return {
        ...group,
        subOrderNo: `SO-TEMP-${String(index + 1).padStart(2, '0')}`,
        itemCount: group.items.length,
        payableAmount: pricing.payableAmount,
        platformServiceFeeRate: partnerAgentServiceFeeRate,
        platformServiceFeeAmount,
        merchantSettleAmount,
        discountRate: pricing.discountRate,
        brandId: group.brandId,
        storeId: group.storeId
      }
    })
  }, [agentCart, platformServiceFeeSettings.partnerAgentRate, shopPartnerPricingSettings])
  const liveAgentProductCards = useMemo(() => (
    liveShopProducts
      .filter((product) => (
        (selectedAgentCategory === '全部大类' || product.categoryId === selectedAgentCategory) &&
        (selectedAgentSupplier === '全部' || (product.storeName || product.tags?.[0] || '品牌方') === selectedAgentSupplier)
      ))
      .slice(0, 6)
      .map((product) => {
      const unitPrice = Number(product.priceCashFrom || 0) || Number(product.pricePointsFrom || 0)
      const previewPricing = resolvePartnerDiscountPricing(agentCartSummary.listAmount, shopPartnerPricingSettings)
      const discountedUnitPrice = Number((unitPrice * previewPricing.discountRate).toFixed(2))
      return {
      name: product.name || '未命名商品',
      meta: `${product.categoryId || '工坊商品'} · ${product.subtitle || '由品牌方供货'}`,
      price: `¥${discountedUnitPrice.toFixed(2)} / 件`,
      originalPrice: unitPrice,
      stock: `库存 ${Number(product.stockTotal || 0)}`,
      action: '加入采购单',
      coverImage: product.coverImage || '',
      unitPrice,
      supplier: product.storeName || product.tags?.[0] || '品牌方',
      category: product.categoryId || '工坊商品',
      brandId: product.brandId || '',
      storeId: product.storeId || ''
      }
    })
  ), [agentCartSummary.listAmount, liveShopProducts, selectedAgentCategory, selectedAgentSupplier, shopPartnerPricingSettings])
  const liveCategoryFilters = useMemo(() => {
    const categoryNames = liveShopCategories
      .slice(0, 4)
      .map((category) => category.name || category.slug || '工坊分类')
    return ['全部大类', ...categoryNames]
  }, [liveShopCategories])
  const liveSupplierFilters = useMemo(() => {
    const supplierOptions = Array.from(new Set(
      liveShopProducts
        .map((product) => product.storeName || product.tags?.[0] || '品牌方')
        .filter(Boolean)
    )).slice(0, 4)

    return ['全部', ...supplierOptions]
  }, [liveShopProducts])
  const brandScopedProducts = useMemo(
    () => liveShopProducts.filter((product) => {
      const productBrandId = String(product.brandId || '').trim()
      const productStoreId = String(product.storeId || '').trim()
      const productStoreOwnerUserId = String(product.storeOwnerUserId || '').trim()
      const activeBrandId = String(activeBrand?.id || '').trim()
      const activeBrandSlug = String(activeBrand?.slug || '').trim()
      const resolvedUserId = String(resolvedPartnerUser?.id || '').trim()

      if (activeBrandId && productBrandId === activeBrandId) {
        return true
      }
      if (currentStoreId && productStoreId === currentStoreId) {
        return true
      }
      if (activeBrandSlug && productStoreId === activeBrandSlug) {
        return true
      }
      if (currentStoreOwnerUserId && productStoreOwnerUserId === currentStoreOwnerUserId) {
        return true
      }
      if (resolvedUserId && productStoreOwnerUserId === resolvedUserId) {
        return true
      }
      return false
    }),
    [activeBrand?.id, activeBrand?.slug, currentStoreId, currentStoreOwnerUserId, liveShopProducts, resolvedPartnerUser?.id]
  )
  const liveBrandWorkspaceProducts = useMemo(() => {
    const allowedCategoryNames = new Set(
      BRAND_SCOPE_DEFINITIONS
        .filter((definition) => currentBrandScopeTagNames.includes(definition.tagName))
        .map((definition) => definition.categoryName)
    )

    const scopedProducts = currentBrandScopeTagNames.length > 0
      ? brandScopedProducts.filter((product) => allowedCategoryNames.has(product.categoryId))
      : brandScopedProducts

    return scopedProducts.slice(0, 8).map((product, index) => ([
      product.name || '未命名商品',
      product.categoryId || '未分类',
      `${Number(product.stockTotal || 0)}`,
      `${Number(product.priceCashFrom || 0).toFixed(2)} / ${Number(product.pricePointsFrom || 0)} 福豆`,
      index % 3 === 0 ? '待审核' : '上架中'
    ]))
  }, [brandScopedProducts, currentBrandScopeTagNames])
  const brandAllowedCategories = useMemo(() => {
    const allowedCategoryNames = new Set(
      BRAND_SCOPE_DEFINITIONS
        .filter((definition) => currentBrandScopeTagNames.includes(definition.tagName))
        .map((definition) => definition.categoryName)
    )

    return currentBrandScopeTagNames.length > 0
      ? liveShopCategories.filter((category) => allowedCategoryNames.has(category.name))
      : liveShopCategories
  }, [currentBrandScopeTagNames, liveShopCategories])
  const brandAllowedCategoryNames = useMemo(
    () => brandAllowedCategories.map((category) => category.name).filter(Boolean),
    [brandAllowedCategories]
  )
  const brandScopedPartnerSubOrders = useMemo(
    () => livePartnerSubOrders.filter((subOrder) => {
      if (activeBrand?.id && subOrder.brandId) {
        return subOrder.brandId === activeBrand.id
      }
      if (currentStoreId && subOrder.storeId) {
        return subOrder.storeId === currentStoreId
      }
      return true
    }),
    [activeBrand?.id, currentStoreId, livePartnerSubOrders]
  )
  const brandScopedShopOrders = useMemo(
    () => liveShopOrders.filter((order) => {
      const relatedItems = liveShopOrderItems.filter((item) => item.orderId === order.id)
      if (relatedItems.length === 0) {
        return false
      }
      return relatedItems.some((item) => {
        const relatedProduct = liveShopProducts.find((product) => product.id === item.productId)
        if (!relatedProduct) {
          return false
        }
        if (activeBrand?.id && relatedProduct.brandId) {
          return relatedProduct.brandId === activeBrand.id
        }
        if (currentStoreId && relatedProduct.storeId) {
          return relatedProduct.storeId === currentStoreId
        }
        return false
      })
    }),
    [activeBrand?.id, currentStoreId, liveShopOrderItems, liveShopOrders, liveShopProducts]
  )
  const liveBrandFulfillmentRows = useMemo(() => (
    [
      ...brandScopedPartnerSubOrders.slice(0, 8).map((subOrder) => ([
        subOrder.subOrderNo,
        `${subOrder.itemCount || 0} 件`,
        brandOrderStatuses[subOrder.id] || subOrder.status || 'pending_payment',
        `¥${Number(subOrder.payableAmount || 0).toFixed(2)}`,
        `¥${Number(subOrder.platformServiceFeeAmount || 0).toFixed(2)}`,
        `¥${Number(subOrder.merchantSettleAmount || Number(subOrder.payableAmount || 0) - Number(subOrder.platformServiceFeeAmount || 0)).toFixed(2)}`
      ])),
      ...(submittedAgentOrder?.subOrders || []).map((subOrder) => ([
        subOrder.subOrderNo,
        `${subOrder.itemCount || 0} 件`,
        brandOrderStatuses[subOrder.subOrderNo] || subOrder.status || '待付款',
        `¥${Number(subOrder.payableAmount || 0).toFixed(2)}`,
        `¥${Number(subOrder.platformServiceFeeAmount || 0).toFixed(2)}`,
        `¥${Number(subOrder.merchantSettleAmount || Number(subOrder.payableAmount || 0) - Number(subOrder.platformServiceFeeAmount || 0)).toFixed(2)}`
      ])),
      ...brandScopedShopOrders.slice(0, 6).map((order) => {
      const itemCount = liveShopOrderItems
        .filter((item) => item.orderId === order.id)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0)
      const resolvedStatus = brandOrderStatuses[order.id] || order.status || 'pending_payment'

      return [
        order.orderNo || order.id,
        `${itemCount || 0} 件`,
        resolvedStatus,
        Number(order.totalCash || 0) > 0 ? `¥${Number(order.totalCash || 0).toFixed(2)}` : `${Number(order.totalPoints || 0)} 福豆`,
        `¥${Number(order.platformServiceFeeAmount || 0).toFixed(2)}`,
        `¥${Number(order.merchantSettleAmount || Number(order.totalCash || 0) - Number(order.platformServiceFeeAmount || 0)).toFixed(2)}`
      ]
    })
    ]
  ), [brandOrderStatuses, brandScopedPartnerSubOrders, brandScopedShopOrders, liveShopOrderItems, submittedAgentOrder])
  const liveBrandFinanceRows = useMemo(() => (
    [
      ...brandScopedPartnerSubOrders.slice(0, 8).map((subOrder) => ([
        subOrder.subOrderNo,
        `¥${Number(subOrder.payableAmount || 0).toFixed(2)}`,
        `¥${Number(subOrder.platformServiceFeeAmount || 0).toFixed(2)}`,
        `¥${Number(subOrder.merchantSettleAmount || Number(subOrder.payableAmount || 0) - Number(subOrder.platformServiceFeeAmount || 0)).toFixed(2)}`,
        brandOrderStatuses[subOrder.id] || subOrder.status || 'pending_payment',
        ['shipped', '已发货'].includes(brandOrderStatuses[subOrder.id] || subOrder.status) ? '已记录' : '待确认'
      ])),
      ...(submittedAgentOrder?.subOrders || []).map((subOrder) => ([
        subOrder.subOrderNo,
        `¥${Number(subOrder.payableAmount || 0).toFixed(2)}`,
        `¥${Number(subOrder.platformServiceFeeAmount || 0).toFixed(2)}`,
        `¥${Number(subOrder.merchantSettleAmount || Number(subOrder.payableAmount || 0) - Number(subOrder.platformServiceFeeAmount || 0)).toFixed(2)}`,
        brandOrderStatuses[subOrder.subOrderNo] || subOrder.status || '待付款',
        ['shipped', '已发货'].includes(brandOrderStatuses[subOrder.subOrderNo]) ? '已记录' : '待确认'
      ])),
      ...brandScopedShopOrders.slice(0, 6).map((order) => ([
      order.orderNo || order.id,
      Number(order.totalCash || 0) > 0 ? `¥${Number(order.totalCash || 0).toFixed(2)}` : `${Number(order.totalPoints || 0)} 福豆`,
      `¥${Number(order.platformServiceFeeAmount || 0).toFixed(2)}`,
      `¥${Number(order.merchantSettleAmount || Number(order.totalCash || 0) - Number(order.platformServiceFeeAmount || 0)).toFixed(2)}`,
      brandOrderStatuses[order.id] || order.status || 'pending_payment',
      order.paidAt || brandOrderStatuses[order.id] === 'shipped' ? '已记录' : '待确认'
    ]))
    ]
  ), [brandOrderStatuses, brandScopedPartnerSubOrders, brandScopedShopOrders, submittedAgentOrder])
  const liveBrandFulfillmentRefs = useMemo(() => ([
    ...brandScopedPartnerSubOrders.slice(0, 8).map((subOrder) => subOrder.id),
    ...((submittedAgentOrder?.subOrders || []).map((subOrder) => subOrder.subOrderNo)),
    ...brandScopedShopOrders.slice(0, 6).map((order) => order.id)
  ]), [brandScopedPartnerSubOrders, brandScopedShopOrders, submittedAgentOrder])
  const agentOverviewMetrics = useMemo(() => {
    const confirmedPartnerOrders = livePartnerOrders.filter((order) => {
      if (!isDateWithinRange(order.submittedAt, overviewRange)) {
        return false;
      }
      const subOrders = livePartnerSubOrders.filter((subOrder) => subOrder.partnerOrderId === order.id);
      return subOrders.length > 0 && subOrders.every((subOrder) => PARTNER_CONFIRMED_STATUSES.includes(subOrder.status || ''));
    });

    const confirmedRetailTotal = confirmedPartnerOrders.reduce((sum, order) => sum + Number(order.listAmount || 0), 0);
    const confirmedPayableTotal = confirmedPartnerOrders.reduce((sum, order) => sum + Number(order.payableAmount || 0), 0);
    const confirmedSavedTotal = Math.max(0, confirmedRetailTotal - confirmedPayableTotal);

    return {
      confirmedRetailTotal,
      confirmedPayableTotal,
      confirmedSavedTotal,
      confirmedOrderCount: confirmedPartnerOrders.length,
      confirmedOrders: confirmedPartnerOrders.slice(0, 5)
    };
  }, [livePartnerOrders, livePartnerSubOrders, overviewRange])
  const brandOverviewMetrics = useMemo(() => {
    const confirmedSubOrders = brandScopedPartnerSubOrders.filter((subOrder) => (
      PARTNER_CONFIRMED_STATUSES.includes(subOrder.status || '') &&
      isDateWithinRange(subOrder.updated_at || subOrder.updatedAt || subOrder.created_at || subOrder.createdAt, overviewRange)
    ));
    const totalReceived = confirmedSubOrders.reduce((sum, subOrder) => sum + Number(subOrder.payableAmount || 0), 0);
    const byCycle = OVERVIEW_RANGE_OPTIONS.map((range) => {
      const currentRangeValue = brandScopedPartnerSubOrders
        .filter((subOrder) => (
          PARTNER_CONFIRMED_STATUSES.includes(subOrder.status || '') &&
          isDateWithinRange(subOrder.updated_at || subOrder.updatedAt || subOrder.created_at || subOrder.createdAt, range.key)
        ))
        .reduce((sum, subOrder) => sum + Number(subOrder.payableAmount || 0), 0);

      return {
        label: range.label,
        value: Number(currentRangeValue.toFixed(2))
      };
    });

    return {
      totalReceived: Number(totalReceived.toFixed(2)),
      confirmedSubOrderCount: confirmedSubOrders.length,
      activeSkuCount: brandScopedProducts.filter((product) => product.status === 'active').length,
      byCycle,
      recentSubOrders: confirmedSubOrders.slice(0, 5)
    };
  }, [brandScopedPartnerSubOrders, brandScopedProducts, overviewRange])
  const heartLampMetrics = useMemo(() => {
    const todayStart = startOfTodayInShanghai()
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
    const last30DaysStart = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000)
    const last7DaysStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)

    const categoryNameById = new Map(liveShopCategories.map((category) => [category.id, category.name || '']))
    const productById = new Map(liveShopProducts.map((product) => [product.id, product]))
    const orderById = new Map(liveShopOrders.map((order) => [order.id, order]))
    const scopedPartnerSubOrderIds = new Set(brandScopedPartnerSubOrders.map((subOrder) => subOrder.id))

    const isPhysicalProduct = (product) => {
      if (!product) {
        return false
      }

      if (product.productType) {
        return product.productType === 'physical'
      }

      return isPhysicalProductCategoryName(categoryNameById.get(product.categoryId) || product.categoryName || '')
    }

    const shopPhysicalEntries = liveShopOrderItems.reduce((sum, item) => {
      const product = productById.get(item.productId)
      const order = orderById.get(item.orderId)
      if (!isPhysicalProduct(product) || !order) {
        return sum
      }

      const orderDate = new Date(order.createdAt || 0)
      if (Number.isNaN(orderDate.getTime())) {
        return sum
      }

      const itemAmount = Number(item.subtotalCash || 0) + (Number(item.subtotalPoints || 0) / 100)
      return [
        ...sum,
        {
          key: `shop-${order.id}`,
          amount: itemAmount,
          date: orderDate,
          scoped: brandScopedShopOrders.some((currentOrder) => currentOrder.id === order.id)
        }
      ]
    }, [])

    const partnerPhysicalEntries = livePartnerSubOrders
      .filter((subOrder) => isPhysicalProductCategoryName(subOrder.category || ''))
      .map((subOrder) => ({
        key: `partner-${subOrder.id}`,
        amount: Number(subOrder.payableAmount || 0),
        date: new Date(subOrder.createdAt || subOrder.updatedAt || 0),
        scoped: scopedPartnerSubOrderIds.has(subOrder.id)
      }))
      .filter((entry) => !Number.isNaN(entry.date.getTime()))

    const allPlatformPhysicalEntries = [
      ...partnerPhysicalEntries
        .map((subOrder) => ({
          key: subOrder.key,
          amount: subOrder.amount,
          date: subOrder.date
        })),
      ...shopPhysicalEntries.map((entry) => ({
        key: entry.key,
        amount: entry.amount,
        date: entry.date
      }))
    ]

    const storePhysicalEntries = [
      ...partnerPhysicalEntries
        .filter((entry) => entry.scoped)
        .map((entry) => ({
          key: entry.key,
          amount: entry.amount,
          date: entry.date
        })),
      ...shopPhysicalEntries
        .filter((entry) => entry.scoped)
        .map((entry) => ({
          key: entry.key,
          amount: entry.amount,
          date: entry.date
        }))
    ]

    const sumBetween = (entries, start, end) => entries
      .filter((entry) => entry.date >= start && entry.date < end)
      .reduce((total, entry) => total + Number(entry.amount || 0), 0)
    const countSince = (entries, start) => new Set(entries
      .filter((entry) => entry.date >= start)
      .map((entry) => entry.key)).size
    const brandScopeTags = Array.isArray(activeBrand?.brandScopeTags) ? activeBrand.brandScopeTags : []
    const isCourseBrand = brandScopeTags.includes(COURSE_BRAND_SCOPE_TAG_NAME)

    const shopYesterdaySales = Number(sumBetween(storePhysicalEntries, yesterdayStart, todayStart).toFixed(2))
    const platformYesterdayTotalSales = Number(sumBetween(allPlatformPhysicalEntries, yesterdayStart, todayStart).toFixed(2))
    const last7DaysOrderCount = countSince(storePhysicalEntries, last7DaysStart)
    const last30DaysOrderCount = countSince(storePhysicalEntries, last30DaysStart)
    const nonPhysicalEntries = isCourseBrand
      ? [
          ...brandScopedPartnerSubOrders
            .filter((subOrder) => subOrder.productType !== 'physical')
            .map((subOrder) => ({
              key: `partner_non_physical_${subOrder.id}`,
              amount: Number(subOrder.payableAmount || 0),
              date: new Date(subOrder.createdAt || subOrder.updatedAt || 0)
            })),
          ...brandScopedShopOrders.flatMap((order) => {
            const orderItems = liveShopOrderItems.filter((item) => item.orderId === order.id)
            return orderItems
              .map((item) => {
                const product = liveShopProducts.find((candidate) => candidate.id === item.productId)
                return product && product.productType !== 'physical'
                  ? {
                      key: `shop_non_physical_${order.id}_${item.productId}`,
                      amount: Number(item.subtotalCash || 0) + (Number(item.subtotalPoints || 0) / 100),
                      date: new Date(order.createdAt || 0)
                    }
                  : null
              })
              .filter(Boolean)
          })
        ]
      : []
    const nonPhysicalYesterdaySales = isCourseBrand
      ? Number(sumBetween(nonPhysicalEntries, yesterdayStart, todayStart).toFixed(2))
      : 0
    const dailyBeansConsumption = resolveDailyBeansConsumption({
      roleType: isCourseBrand ? 'brand_course' : 'brand_standard',
      shopYesterdaySales,
      platformYesterdayTotalSales,
      last7DaysOrderCount,
      last30DaysOrderCount,
      nonPhysicalYesterdaySales,
      platformYesterdayNonPhysicalTotalSales: nonPhysicalYesterdaySales
    })
    const currentBeansBalance = Math.max(0, Number(activeBrand?.communityBeansBalance ?? 0))
    const remainingDays = dailyBeansConsumption > 0 ? Number((currentBeansBalance / dailyBeansConsumption).toFixed(1)) : 0
    const remainingHours = dailyBeansConsumption > 0 ? Math.max(0, Math.round((currentBeansBalance / dailyBeansConsumption) * 24)) : 0
    const status = resolveHeartLampStatus(currentBeansBalance, dailyBeansConsumption)
    const estimatedExhaustedAt = dailyBeansConsumption > 0
      ? new Date(Date.now() + (currentBeansBalance / dailyBeansConsumption) * 24 * 60 * 60 * 1000)
      : null
    const extinguishedSince = status === 'extinguished' && activeBrand?.heartLampLastExtinguishedAt
      ? Math.max(0, Date.now() - new Date(activeBrand.heartLampLastExtinguishedAt).getTime())
      : 0
    const extinguishedDays = Math.floor(extinguishedSince / (24 * 60 * 60 * 1000))
    const extinguishedHours = Math.floor((extinguishedSince % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))

    const statusMeta = status === 'extinguished'
      ? {
          label: '已熄灭',
          accent: '#b42318',
          background: '#fff3f2',
          message: '店铺因灯油耗尽已自动关闭曝光。请重新注入福豆点燃心灯，唤醒店铺。'
        }
      : status === 'warning'
        ? {
            label: '预警中',
            accent: '#b54708',
            background: '#fff7ed',
            message: '灯油即将耗尽。若不及时添油，店铺将陷入沉睡并停止对外曝光。'
          }
        : {
            label: '长明中',
            accent: '#087443',
            background: '#effaf4',
            message: '灯油充足，光芒稳定。请继续保持店铺的活跃与温暖。'
          }

    return {
      shopYesterdaySales,
      platformYesterdayTotalSales,
      dailyBeansConsumption,
      burnRateType: isCourseBrand ? 'brand_course' : 'brand_standard',
      currentBeansBalance,
      remainingDays,
      remainingHours,
      estimatedExhaustedAt,
      status,
      statusMeta,
      last7DaysOrderCount,
      last30DaysOrderCount,
      nonPhysicalYesterdaySales,
      extinguishedDays,
      extinguishedHours
    }
  }, [
    activeBrand?.communityBeansBalance,
    activeBrand?.heartLampLastExtinguishedAt,
    brandScopedPartnerSubOrders,
    brandScopedShopOrders,
    liveShopCategories,
    livePartnerSubOrders,
    liveShopOrderItems,
    liveShopOrders,
    liveShopProducts
  ])
  const agentBeanMetrics = useMemo(() => {
    const todayStart = startOfTodayInShanghai()
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
    const last30DaysStart = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000)
    const last7DaysStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)

    const confirmedPartnerOrders = livePartnerOrders.filter((order) => {
      const subOrders = livePartnerSubOrders.filter((subOrder) => subOrder.partnerOrderId === order.id)
      return subOrders.length > 0 && subOrders.every((subOrder) => PARTNER_CONFIRMED_STATUSES.includes(subOrder.status || ''))
    })

    const platformYesterdayTotalSales = Number(livePartnerOrders
      .filter((order) => {
        const submittedAt = new Date(order.submittedAt || 0)
        return !Number.isNaN(submittedAt.getTime()) && submittedAt >= yesterdayStart && submittedAt < todayStart
      })
      .reduce((sum, order) => sum + Number(order.listAmount || 0), 0)
      .toFixed(2))

    const shopYesterdaySales = Number(confirmedPartnerOrders
      .filter((order) => {
        const submittedAt = new Date(order.submittedAt || 0)
        return !Number.isNaN(submittedAt.getTime()) && submittedAt >= yesterdayStart && submittedAt < todayStart
      })
      .reduce((sum, order) => sum + Number(order.listAmount || 0), 0)
      .toFixed(2))

    const last7DaysOrderCount = confirmedPartnerOrders.filter((order) => {
      const submittedAt = new Date(order.submittedAt || 0)
      return !Number.isNaN(submittedAt.getTime()) && submittedAt >= last7DaysStart
    }).length

    const last30DaysOrderCount = confirmedPartnerOrders.filter((order) => {
      const submittedAt = new Date(order.submittedAt || 0)
      return !Number.isNaN(submittedAt.getTime()) && submittedAt >= last30DaysStart
    }).length

    const dailyBeansConsumption = resolveDailyBeansConsumption({
      roleType: 'agent',
      shopYesterdaySales,
      platformYesterdayTotalSales,
      last7DaysOrderCount,
      last30DaysOrderCount
    })
    const currentBeansBalance = Math.max(0, Number(resolvedPartnerUser?.balance || 0))
    const remainingDays = dailyBeansConsumption > 0 ? Number((currentBeansBalance / dailyBeansConsumption).toFixed(1)) : 0
    const remainingHours = dailyBeansConsumption > 0 ? Math.max(0, Math.round((currentBeansBalance / dailyBeansConsumption) * 24)) : 0
    const status = resolveHeartLampStatus(currentBeansBalance, dailyBeansConsumption)
    const estimatedExhaustedAt = dailyBeansConsumption > 0
      ? new Date(Date.now() + (currentBeansBalance / dailyBeansConsumption) * 24 * 60 * 60 * 1000)
      : null
    const extinguishedSince = status === 'extinguished' && resolvedPartnerUser?.beansLastExtinguishedAt
      ? Math.max(0, Date.now() - new Date(resolvedPartnerUser.beansLastExtinguishedAt).getTime())
      : 0

    return {
      shopYesterdaySales,
      platformYesterdayTotalSales,
      dailyBeansConsumption,
      burnRateType: 'agent',
      currentBeansBalance,
      remainingDays,
      remainingHours,
      estimatedExhaustedAt,
      status,
      last7DaysOrderCount,
      last30DaysOrderCount,
      extinguishedDays: Math.floor(extinguishedSince / (24 * 60 * 60 * 1000)),
      extinguishedHours: Math.floor((extinguishedSince % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
    }
  }, [livePartnerOrders, livePartnerSubOrders, resolvedPartnerUser?.balance, resolvedPartnerUser?.beansLastExtinguishedAt])

  useEffect(() => {
    if (!activeBrand?.id) {
      return undefined
    }

    void DatabaseService.applyBrandDailyBeanBurn(activeBrand.id, {
      dailyBeansConsumption: heartLampMetrics.dailyBeansConsumption
    }).then((nextBrand) => {
      if (!nextBrand?.id) {
        return
      }
      setLivePartnerBrands((currentBrands) => currentBrands.map((brand) => (
        brand.id === nextBrand.id ? nextBrand : brand
      )))
    }).catch((error) => {
      console.error('Failed to settle brand daily bean burn:', error)
    })

    return undefined
  }, [activeBrand?.id, heartLampMetrics.dailyBeansConsumption])

  useEffect(() => {
    if (!isAgentUser || !resolvedPartnerUser?.id) {
      return undefined
    }

    void DatabaseService.applyUserDailyBeanBurn(resolvedPartnerUser.id, {
      dailyBeansConsumption: agentBeanMetrics.dailyBeansConsumption
    }).then((nextUser) => {
      if (!nextUser?.id) {
        return
      }
      setLivePartnerUsers((currentUsers) => currentUsers.map((user) => (
        user.id === nextUser.id ? { ...user, ...nextUser } : user
      )))
    }).catch((error) => {
      console.error('Failed to settle agent daily bean burn:', error)
    })

    return undefined
  }, [agentBeanMetrics.dailyBeansConsumption, isAgentUser, resolvedPartnerUser?.id])
  const activeSubview = useMemo(
    () => activeSubViews.find((item) => item.key === activeSubviewKey) || activeSubViews[0] || null,
    [activeSubViews, activeSubviewKey]
  )
  const roleCards = useMemo(
    () => ROLE_CARDS.filter((card) => {
      if (card.title === '管理员') {
        return adminAuthorized;
      }

      if (card.title === '代理商') {
        return isAgentUser;
      }

      if (card.title === '品牌方') {
        return isBrandLead || isBrandMember;
      }

      return false;
    }),
    [adminAuthorized, isAgentUser, isBrandLead, isBrandMember]
  )
  const sidebarItems = useMemo(() => {
    if (activeRole === '管理员' && adminAuthorized) {
      return ADMIN_TABS
    }

    if (activeRole === '品牌方' && !isBrandLead) {
      return activePortal.modules
        .filter((moduleName) => ['商品管理', '接单发货', '发货合并提示'].includes(moduleName))
        .map((moduleName) => ({
          key: moduleName,
          label: moduleName
        }))
    }

    return activePortal.modules.map((moduleName) => ({
      key: moduleName,
      label: moduleName
    }))
  }, [activePortal.modules, activeRole, adminAuthorized, isBrandLead])
  const activeRoleTitle = useMemo(() => {
    if (activeRole === '管理员' && adminAuthorized) {
      return '管理员后台'
    }

    if (activeRole === '品牌方') {
      return '品牌方后台'
    }

    return '代理商后台'
  }, [activeRole, adminAuthorized])
  const isBrandProductManagementView = activeRole === '品牌方' && activeModule === '商品管理'

  useEffect(() => {
    const nextSidebarItems = activeRole === '管理员' && adminAuthorized
      ? ADMIN_TABS
      : activeRole === '品牌方' && !isBrandLead
        ? activePortal.modules
          .filter((moduleName) => ['商品管理', '接单发货', '发货合并提示'].includes(moduleName))
          .map((moduleName) => ({ key: moduleName, label: moduleName }))
        : activePortal.modules.map((moduleName) => ({ key: moduleName, label: moduleName }))

    setActiveModule(nextSidebarItems[0]?.key || '')
  }, [activePortal, activeRole, adminAuthorized, isBrandLead])

  useEffect(() => {
    setActiveSubviewKey(activeSubViews[0]?.key || '')
  }, [activeSubViews])

  useEffect(() => {
    const nextAllowedRoleTitles = roleCards.map((card) => card.title);
    if (!nextAllowedRoleTitles.includes(activeRole)) {
      setActiveRole(nextAllowedRoleTitles[0] || '代理商')
    }
  }, [activeRole, roleCards])

  useEffect(() => {
    if (activeRole !== '代理商') {
      return
    }

    if (isAgentUser) {
      return
    }

    if (isBrandLead || isBrandMember) {
      setActiveRole('品牌方')
    }
  }, [activeRole, isAgentUser, isBrandLead, isBrandMember])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(PARTNER_ROLE_SWITCH_COLLAPSED_KEY, roleSwitchCollapsed ? '1' : '0')
  }, [roleSwitchCollapsed])

  useEffect(() => {
    setShowWelcomeBanner(true)
    const timerId = window.setTimeout(() => {
      setShowWelcomeBanner(false)
    }, 5000)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [activeRole, effectiveCurrentUser?.uid, effectiveCurrentUser?.id])

  useEffect(() => {
    setStoreDraft({
      storeName: activeBrand?.name || resolvedPartnerUser?.storeName || '',
      storeDescription: activeBrand?.description || resolvedPartnerUser?.storeDescription || '',
      storeContact: activeBrand?.contactPhone || resolvedPartnerUser?.storeContact || '',
      storeContactName: activeBrand?.contactName || resolvedPartnerUser?.name || '',
      storeWechat: activeBrand?.contactWechat || '',
      communityBeansBalance: Math.max(0, Number(activeBrand?.communityBeansBalance ?? 0)),
      shippingReceiver: activeBrand?.shippingAddress?.receiver || '',
      shippingPhone: activeBrand?.shippingAddress?.phone || '',
      shippingDetail: activeBrand?.shippingAddress?.detail || '',
      returnReceiver: activeBrand?.returnAddress?.receiver || '',
      returnPhone: activeBrand?.returnAddress?.phone || '',
      returnDetail: activeBrand?.returnAddress?.detail || '',
      returnSameAsShipping: Boolean(activeBrand?.returnAddress?.same_as_shipping ?? activeBrand?.returnAddress?.sameAsShipping ?? true)
    })
  }, [
    activeBrand?.name,
    activeBrand?.description,
    activeBrand?.contactName,
    activeBrand?.contactPhone,
    activeBrand?.contactWechat,
    activeBrand?.communityBeansBalance,
    activeBrand?.shippingAddress,
    activeBrand?.returnAddress,
    resolvedPartnerUser?.storeName,
    resolvedPartnerUser?.storeDescription,
    resolvedPartnerUser?.storeContact,
    resolvedPartnerUser?.name
  ])

  const handleAddAgentItem = (card) => {
    setAgentCart((prev) => {
      if (prev.some((item) => item.name === card.name)) {
        return prev
      }
      return [
        ...prev,
        {
          name: card.name,
          supplier: card.supplier || card.meta.split('·').pop()?.trim() || 'S1',
          category: card.category || card.meta.split('·')[0]?.trim() || '日常仪式',
          unitPrice: Number(card.unitPrice || String(card.price).replace(/[^\d.]/g, '').split('/')[0] || 0),
          brandId: card.brandId || '',
          storeId: card.storeId || ''
        }
      ]
    })
  }

  const handleRemoveAgentItem = (itemName) => {
    setAgentCart((currentItems) => currentItems.filter((item) => item.name !== itemName))
  }

  const handleAdvanceBrandOrderStatus = async (orderId) => {
    const submittedSubOrder = submittedAgentOrder?.subOrders?.find((subOrder) => subOrder.subOrderNo === orderId)
    const livePartnerSubOrder = livePartnerSubOrders.find((subOrder) => subOrder.id === orderId || subOrder.subOrderNo === orderId)
    const currentStatus = brandOrderStatuses[orderId] || submittedSubOrder?.status || livePartnerSubOrder?.status || liveShopOrders.find((order) => order.id === orderId)?.status || 'pending_payment'
    const nextStatus = (
      currentStatus === 'pending_payment' || currentStatus === '待付款' ? 'accepted' :
      currentStatus === 'accepted' ? 'packing' :
      currentStatus === 'packing' ? 'shipped' :
      'shipped'
    )

    try {
      if (livePartnerSubOrder) {
        await DatabaseService.updatePartnerSubOrderStatus(livePartnerSubOrder.id, nextStatus)
      }

      setBrandOrderStatuses((current) => ({
        ...current,
        [orderId]: nextStatus,
        ...(livePartnerSubOrder?.subOrderNo ? { [livePartnerSubOrder.subOrderNo]: nextStatus } : {})
      }))
      setLivePartnerSubOrders((currentSubOrders) => currentSubOrders.map((subOrder) => (
        subOrder.id === orderId || subOrder.subOrderNo === orderId
          ? { ...subOrder, status: nextStatus }
          : subOrder
      )))
    } catch (error) {
      setPartnerDataErrors((currentErrors) => ({
        ...currentErrors,
        partnerOrders: error?.message || '更新合作方子订单状态失败'
      }))
    }
  }

  const handleSaveStoreProfile = async () => {
    if (!resolvedPartnerUser?.id) {
      return
    }

    setSavingStoreProfile(true)
    try {
      const nextBrandScopeTags = currentBrandScopeTagNames
      const nextAllowedCategoryNames = BRAND_SCOPE_DEFINITIONS
        .filter((definition) => nextBrandScopeTags.includes(definition.tagName))
        .map((definition) => definition.categoryName)

      const savedBrand = await DatabaseService.savePartnerBrand({
        id: activeBrand?.id,
        name: storeDraft.storeName || currentStoreName || '品牌方店铺',
        slug: currentStoreId || `store_${resolvedPartnerUser.uid || resolvedPartnerUser.id}`,
        ownerUserId: resolvedPartnerUser.id,
        description: storeDraft.storeDescription,
        contactName: storeDraft.storeContactName || resolvedPartnerUser.name || '',
        contactPhone: storeDraft.storeContact,
        contactWechat: storeDraft.storeWechat,
        communityBeansBalance: Math.max(0, Number(storeDraft.communityBeansBalance || 0)),
        shippingAddress: {
          receiver: storeDraft.shippingReceiver,
          phone: storeDraft.shippingPhone,
          detail: storeDraft.shippingDetail
        },
        returnAddress: storeDraft.returnSameAsShipping
          ? {
              same_as_shipping: true,
              receiver: storeDraft.shippingReceiver,
              phone: storeDraft.shippingPhone,
              detail: storeDraft.shippingDetail
            }
          : {
              same_as_shipping: false,
              receiver: storeDraft.returnReceiver,
              phone: storeDraft.returnPhone,
              detail: storeDraft.returnDetail
            },
        brandScopeTags: nextBrandScopeTags,
        allowedCategoryNames: nextAllowedCategoryNames
      })

      await DatabaseService.updateUser(resolvedPartnerUser.id, {
        ...resolvedPartnerUser,
        storeName: savedBrand.name,
        storeDescription: storeDraft.storeDescription,
        storeContact: storeDraft.storeContact,
        storeRole: 'lead',
        storeId: savedBrand.slug,
        storeOwnerUserId: resolvedPartnerUser.id
      })
      const [refreshedUsers, refreshedBrandWorkspace] = await Promise.all([
        DatabaseService.getPartnerUsers(),
        DatabaseService.getPartnerBrandWorkspaceData()
      ])
      setLivePartnerUsers(refreshedUsers)
      setLivePartnerBrands(refreshedBrandWorkspace.brands || [])
      setLivePartnerBrandMembers(refreshedBrandWorkspace.members || [])
      setLivePartnerBrandInvites(refreshedBrandWorkspace.invites || [])
    } catch (error) {
      setPartnerDataErrors((currentErrors) => ({
        ...currentErrors,
        users: error?.message || '保存店铺资料失败'
      }))
    } finally {
      setSavingStoreProfile(false)
    }
  }

  const handleInviteStoreMember = async (userId) => {
    if (!userId || !currentStoreId || !resolvedPartnerUser?.id) {
      return
    }

    setInvitingStoreMemberId(userId)
    try {
      const targetBrandId = activeBrand?.id
      if (!targetBrandId) {
        throw new Error('当前主理人还没有店铺，请先保存店铺信息')
      }

      await DatabaseService.invitePartnerBrandMember({
        brandId: targetBrandId,
        inviteeUserId: userId,
        role: 'member',
        invitedByUserId: resolvedPartnerUser.id
      })

      await DatabaseService.assignUserToStore(userId, {
        storeId: currentStoreId,
        storeName: storeDraft.storeName || currentStoreName,
        storeOwnerUserId: resolvedPartnerUser.id
      })
      const [refreshedUsers, refreshedBrandWorkspace] = await Promise.all([
        DatabaseService.getPartnerUsers(),
        DatabaseService.getPartnerBrandWorkspaceData()
      ])
      setLivePartnerUsers(refreshedUsers)
      setLivePartnerBrands(refreshedBrandWorkspace.brands || [])
      setLivePartnerBrandMembers(refreshedBrandWorkspace.members || [])
      setLivePartnerBrandInvites(refreshedBrandWorkspace.invites || [])
    } catch (error) {
      setPartnerDataErrors((currentErrors) => ({
        ...currentErrors,
        users: error?.message || '邀请店铺成员失败'
      }))
    } finally {
      setInvitingStoreMemberId('')
    }
  }

  const handleSubmitAgentOrder = async () => {
    if (!agentCart.length) {
      return
    }

    const submittedAt = new Date()
    const orderNo = `PO-TEMP-${submittedAt.getFullYear()}${String(submittedAt.getMonth() + 1).padStart(2, '0')}${String(submittedAt.getDate()).padStart(2, '0')}-${String(submittedAt.getHours()).padStart(2, '0')}${String(submittedAt.getMinutes()).padStart(2, '0')}`

    const nextSubmittedOrder = {
      orderNo,
      submittedAt: submittedAt.toISOString(),
      listAmount: agentCartSummary.listAmount,
      payableAmount: agentCartSummary.discountedTotal,
      platformServiceFeeRate: agentCartSummary.platformServiceFeeRate,
      platformServiceFeeAmount: agentCartSummary.platformServiceFeeAmount,
      merchantSettleAmount: agentCartSummary.merchantSettleAmount,
      discountRate: agentCartSummary.discountRate,
      subOrders: agentCartSubOrders.map((subOrder) => ({
        ...subOrder,
        status: '待付款'
      }))
    }

    try {
      const createdOrder = await DatabaseService.createPartnerOrder({
        orderNo: nextSubmittedOrder.orderNo,
        userId: resolvedPartnerUser?.id || '',
        roleType: 'agent',
        status: 'pending_payment',
        listAmount: nextSubmittedOrder.listAmount,
        payableAmount: nextSubmittedOrder.payableAmount,
        platformServiceFeeRate: nextSubmittedOrder.platformServiceFeeRate,
        platformServiceFeeAmount: nextSubmittedOrder.platformServiceFeeAmount,
        merchantSettleAmount: nextSubmittedOrder.merchantSettleAmount,
        discountRate: nextSubmittedOrder.discountRate,
        submittedAt: nextSubmittedOrder.submittedAt,
        subOrders: nextSubmittedOrder.subOrders.map((subOrder) => ({
          subOrderNo: subOrder.subOrderNo,
          brandId: subOrder.brandId || '',
          storeId: subOrder.storeId || '',
          supplier: subOrder.supplier,
          category: subOrder.category,
          status: 'pending_payment',
          itemCount: subOrder.itemCount,
          payableAmount: subOrder.payableAmount,
          platformServiceFeeRate: subOrder.platformServiceFeeRate,
          platformServiceFeeAmount: subOrder.platformServiceFeeAmount,
          merchantSettleAmount: subOrder.merchantSettleAmount,
          discountRate: subOrder.discountRate
        }))
      })

      setSubmittedAgentOrder(nextSubmittedOrder)
      setLivePartnerOrders((currentOrders) => [
        {
          ...createdOrder,
          orderNo: nextSubmittedOrder.orderNo,
          status: 'pending_payment',
          listAmount: nextSubmittedOrder.listAmount,
          payableAmount: nextSubmittedOrder.payableAmount,
          platformServiceFeeRate: nextSubmittedOrder.platformServiceFeeRate,
          platformServiceFeeAmount: nextSubmittedOrder.platformServiceFeeAmount,
          merchantSettleAmount: nextSubmittedOrder.merchantSettleAmount,
          discountRate: nextSubmittedOrder.discountRate,
          submittedAt: nextSubmittedOrder.submittedAt
        },
        ...currentOrders
      ])
      setLivePartnerSubOrders((currentSubOrders) => [
        ...nextSubmittedOrder.subOrders.map((subOrder) => ({
          id: `${createdOrder.id}_${subOrder.subOrderNo}`,
          partnerOrderId: createdOrder.id,
          subOrderNo: subOrder.subOrderNo,
          brandId: subOrder.brandId || '',
          storeId: subOrder.storeId || '',
          supplier: subOrder.supplier,
          category: subOrder.category,
          status: 'pending_payment',
          itemCount: subOrder.itemCount,
          payableAmount: subOrder.payableAmount,
          platformServiceFeeRate: subOrder.platformServiceFeeRate,
          platformServiceFeeAmount: subOrder.platformServiceFeeAmount,
          merchantSettleAmount: subOrder.merchantSettleAmount,
          discountRate: subOrder.discountRate
        })),
        ...currentSubOrders
      ])
      setAgentCart([])
      setActiveModule('购物车与订单')
    } catch (error) {
      setPartnerDataErrors((currentErrors) => ({
        ...currentErrors,
        partnerOrders: error?.message || '提交主订单失败'
      }))
    }
  }

  if (loading && !hasEffectiveSession) {
    return (
      <div style={{ minHeight: '100vh', padding: '32px 24px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: '15px', color: '#64748b' }}>正在验证合作方身份...</div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--theme-body-bg)',
        display: 'flex',
        width: '100%'
      }}
    >
      <div
        style={{
          width: '240px',
          minWidth: '240px',
          backgroundColor: 'rgba(255,255,255,0.86)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
          backdropFilter: 'blur(18px)'
        }}
      >
        <div style={{ padding: '20px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <h1 style={{ fontSize: '20px', margin: 0, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
              {activeRoleTitle}
            </h1>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setRoleSwitchCollapsed((current) => !current)}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  width: '36px',
                  height: '36px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
                aria-label="切换身份"
              >
                ↕
              </button>
              {!roleSwitchCollapsed && (
                <div
                  style={{
                    position: 'absolute',
                    top: '46px',
                    right: 0,
                    zIndex: 40,
                    width: '188px',
                    borderRadius: '16px',
                    backgroundColor: 'rgba(255,255,255,0.98)',
                    boxShadow: 'var(--shadow-xl)',
                    border: '1px solid var(--color-border)',
                    padding: '12px',
                    display: 'grid',
                    gap: '8px',
                    backdropFilter: 'blur(12px)'
                  }}
                >
                  {roleCards.map((card) => (
                    <button
                      key={card.title}
                      type="button"
                      onClick={() => {
                        setActiveRole(card.title);
                        setRoleSwitchCollapsed(true);
                      }}
                      style={{
                        border: 'none',
                        borderRadius: '12px',
                        background: activeRole === card.title ? 'var(--theme-button-primary-bg)' : 'var(--color-bg-secondary)',
                        color: activeRole === card.title ? 'var(--theme-button-primary-text)' : 'var(--color-text-primary)',
                        padding: '10px 12px',
                        fontSize: '13px',
                        fontWeight: 700,
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                    >
                      {card.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '4px 0 0 0', whiteSpace: 'nowrap' }}>
            {activeRole === '管理员' && adminAuthorized ? '系统设置与运营管理' : `${activeRole}操作菜单`}
          </p>
        </div>

        <nav style={{ flex: 1, padding: '12px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {sidebarItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  if (activeRole === '管理员' && adminAuthorized) {
                    setAdminTab(item.key)
                    return
                  }
                  setActiveModule(item.key)
                }}
                style={{
                  padding: '12px 16px',
                  border: 'none',
                  borderRadius: '10px',
                  background: (
                    activeRole === '管理员' && adminAuthorized
                      ? adminTab === item.key
                      : activeModule === item.key
                  ) ? 'var(--theme-button-primary-bg)' : 'transparent',
                  color: (
                    activeRole === '管理员' && adminAuthorized
                      ? adminTab === item.key
                      : activeModule === item.key
                  ) ? 'var(--theme-button-primary-text)' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  textAlign: 'left',
                  width: '100%'
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {!adminAuthorized && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--color-border)', display: 'grid', gap: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              {hasEffectiveSession
                ? '当前账号已登录，但未识别为管理员。如需进入管理员后台，请联系现有管理员为你的账号分配【管理员】或【超级管理员】标签。'
                : '当前尚未登录。如需进入管理员后台，请先登录，再联系现有管理员为你的账号分配【管理员】或【超级管理员】标签。'}
            </div>
            <Link
              to="/profile"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '10px 14px',
                borderRadius: '12px',
                background: 'var(--theme-button-primary-bg)',
                color: 'var(--theme-button-primary-text)',
                fontWeight: 700,
                textDecoration: 'none',
                fontSize: '13px'
              }}
            >
              {hasEffectiveSession ? '前往我的页面' : '前往我的页面登录'}
            </Link>
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: activeRole === '管理员' ? '0' : '32px 28px',
          boxSizing: 'border-box'
        }}
      >
        {showWelcomeBanner && (
          <div
            style={{
              position: 'sticky',
              top: '16px',
              zIndex: 30,
              marginBottom: '16px',
              borderRadius: '16px',
              background: 'var(--theme-button-primary-bg)',
              color: 'var(--theme-button-primary-text)',
              padding: '14px 18px',
              boxShadow: 'var(--shadow-md)',
              fontSize: '14px',
              fontWeight: 700
            }}
          >
            欢迎uid={displayUid || '未识别'}用户，你的身份是{activeRoleTitle}
          </div>
        )}
        <div
          style={{
            marginBottom: '16px',
            borderRadius: '14px',
            backgroundColor: '#fff7ed',
            border: '1px solid #fdba74',
            padding: '12px 14px',
            display: 'grid',
            gap: '6px'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#9a3412', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            当前身份识别
          </div>
          <div style={{ fontSize: '13px', color: '#9a3412', lineHeight: 1.7 }}>
            uid={displayUid || '未识别'} · 角色标签：{currentRoleTagNames.length ? currentRoleTagNames.join(' / ') : '未读取到标签'}
            {resolvedPartnerUser?.storeRole ? ` · storeRole=${resolvedPartnerUser.storeRole}` : ''}
          </div>
        </div>
        {activeRole === '管理员' && adminAuthorized ? (
          <AdminDashboardPanel embedded activeTabOverride={adminTab} onActiveTabChange={setAdminTab} />
        ) : (
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'grid',
          gap: '24px'
        }}
      >
        {!isBrandProductManagementView ? (
        <section
          style={{
            display: 'grid'
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '20px',
              boxShadow: 'var(--shadow-sm)',
              padding: '24px',
              display: 'grid',
              gap: '18px'
            }}
          >
            {(partnerDataErrors.categories || partnerDataErrors.products || partnerDataErrors.orders || partnerDataErrors.pricing) && (
              <div
                style={{
                  borderRadius: '14px',
                  backgroundColor: '#fff7ed',
                  border: '1px solid #fdba74',
                  padding: '14px',
                  display: 'grid',
                  gap: '8px'
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#9a3412' }}>部分数据加载失败</div>
                {partnerDataErrors.categories && (
                  <div style={{ fontSize: '12px', color: '#9a3412' }}>分类：{partnerDataErrors.categories}</div>
                )}
                {partnerDataErrors.products && (
                  <div style={{ fontSize: '12px', color: '#9a3412' }}>商品：{partnerDataErrors.products}</div>
                )}
                {partnerDataErrors.orders && (
                  <div style={{ fontSize: '12px', color: '#9a3412' }}>订单：{partnerDataErrors.orders}</div>
                )}
                {partnerDataErrors.pricing && (
                  <div style={{ fontSize: '12px', color: '#9a3412' }}>折扣：{partnerDataErrors.pricing}</div>
                )}
              </div>
            )}

            {(activeAgentWorkspace || activeRole === '品牌方') && (
              <div
                style={{
                  display: 'grid',
                  gap: '14px'
                }}
              >
                {activeModule === '总览' && (
                  <div style={{ display: 'grid', gap: '16px' }}>
                    <div
                      style={{
                        borderRadius: '22px',
                        background: 'linear-gradient(135deg, #fff9f3 0%, #fff 48%, #f8f7f2 100%)',
                        border: '1px solid rgba(209, 209, 199, 0.8)',
                        boxShadow: 'var(--shadow-sm)',
                        padding: '22px',
                        display: 'grid',
                        gap: '18px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div style={{ display: 'grid', gap: '8px', maxWidth: '760px' }}>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              borderRadius: '999px',
                              padding: '8px 12px',
                              backgroundColor: 'rgba(214, 140, 101, 0.12)',
                              color: '#9a5a37',
                              fontSize: '12px',
                              fontWeight: 700,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              width: 'fit-content'
                            }}
                          >
                            品牌方总览
                          </div>
                          <div>
                            <h2 style={{ margin: 0, fontSize: '30px', lineHeight: 1.15, color: 'var(--color-accent-ink)' }}>
                              {isBrandLead ? '经营看板' : '协同看板'}
                            </h2>
                            <div style={{ marginTop: '10px', fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                              {isBrandLead
                                ? '把收款、上架商品和近期已确认子订单放在同一个首屏里，先看经营节奏，再进入商品与发货工作区。'
                                : '聚焦已确认订单、累计节省和成交折扣，方便成员快速判断最近的协同产出。'}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                          {OVERVIEW_RANGE_OPTIONS.map((option) => (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => setOverviewRange(option.key)}
                              style={{
                                border: '1px solid var(--color-border)',
                                borderRadius: '999px',
                                background: overviewRange === option.key ? 'var(--theme-button-primary-bg)' : '#fff',
                                color: overviewRange === option.key ? 'var(--theme-button-primary-text)' : '#334155',
                                padding: '9px 14px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: overviewRange === option.key ? 'var(--shadow-sm)' : 'none'
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {isBrandLead ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '14px' }}>
                          <div
                            style={{
                              borderRadius: '20px',
                              background: 'linear-gradient(135deg, #2c2c2c 0%, #414141 100%)',
                              color: '#fff',
                              padding: '22px',
                              display: 'grid',
                              gap: '14px',
                              minHeight: '220px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                              <div style={{ minWidth: '280px', flex: '1 1 420px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)' }}>
                                  经营看板
                                </div>
                                <div style={{ marginTop: '8px', fontSize: '42px', fontWeight: 700, lineHeight: 1 }}>
                                  {formatOverviewCurrency(brandOverviewMetrics.totalReceived)}
                                </div>
                                <div style={{ marginTop: '10px', fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.84)', maxWidth: '520px' }}>
                                  当前口径按已发货 / 已完成子订单统计。这个区间内共确认 {brandOverviewMetrics.confirmedSubOrderCount} 笔收款，建议结合周期走势与心灯状态一起判断今天的经营温度。
                                </div>
                              </div>
                              <div
                                style={{
                                  minWidth: '320px',
                                  maxWidth: '440px',
                                  flex: '1 1 360px',
                                  borderRadius: '18px',
                                  border: `1px solid ${heartLampMetrics.statusMeta.accent}33`,
                                  backgroundColor: 'rgba(255,255,255,0.08)',
                                  padding: '16px',
                                  display: 'grid',
                                  gap: '10px'
                                }}
                              >
                                <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f5e8dc' }}>
                                  心灯系统 · {heartLampMetrics.statusMeta.label}
                                </div>
                                <div style={{ fontSize: '13px', lineHeight: 1.8, color: 'rgba(255,255,255,0.86)' }}>
                                  {heartLampMetrics.statusMeta.message}
                                </div>
                                <div style={{ fontSize: '12px', lineHeight: 1.7, color: 'rgba(255,255,255,0.7)' }}>
                                  每日燃烧掉的福豆会等量回流系统福豆池，用于维持全平台账户总量闭环。
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                                  <div style={{ borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '12px' }}>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.68)' }}>当前油量</div>
                                    <div style={{ marginTop: '6px', fontSize: '22px', fontWeight: 700 }}>{Math.round(heartLampMetrics.currentBeansBalance)} 粒</div>
                                  </div>
                                  <div style={{ borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '12px' }}>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.68)' }}>燃烧速度</div>
                                    <div style={{ marginTop: '6px', fontSize: '22px', fontWeight: 700 }}>{heartLampMetrics.dailyBeansConsumption.toFixed(1)} / 天</div>
                                  </div>
                                </div>
                                <div style={{ fontSize: '12px', lineHeight: 1.8, color: 'rgba(255,255,255,0.78)' }}>
                                  {heartLampMetrics.status === 'extinguished'
                                    ? `熄灭时长 ${heartLampMetrics.extinguishedDays} 天 ${heartLampMetrics.extinguishedHours} 小时，建议补充至少 100 粒福豆重新引灯。`
                                    : heartLampMetrics.status === 'warning'
                                      ? `可燃烧约 ${heartLampMetrics.remainingHours} 小时，预计燃尽：${heartLampMetrics.estimatedExhaustedAt ? formatOverviewDateTime(heartLampMetrics.estimatedExhaustedAt) : '待更新'}`
                                      : `可燃烧约 ${heartLampMetrics.remainingDays} 天，预计燃尽：${heartLampMetrics.estimatedExhaustedAt ? formatOverviewDateTime(heartLampMetrics.estimatedExhaustedAt) : '待更新'}`}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${heartLampMetrics.burnRateType === 'brand_course' ? 6 : 5}, minmax(0, 1fr))`, gap: '12px', marginTop: 'auto' }}>
                              <div style={{ borderRadius: '16px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '14px' }}>
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.68)' }}>已确认子订单</div>
                                <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700 }}>{brandOverviewMetrics.confirmedSubOrderCount}</div>
                              </div>
                              <div style={{ borderRadius: '16px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '14px' }}>
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.68)' }}>当前上架商品</div>
                                <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700 }}>{brandOverviewMetrics.activeSkuCount}</div>
                              </div>
                              <div style={{ borderRadius: '16px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '14px' }}>
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.68)' }}>昨日店铺实物销售</div>
                                <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700 }}>{formatOverviewCurrency(heartLampMetrics.shopYesterdaySales)}</div>
                              </div>
                              <div style={{ borderRadius: '16px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '14px' }}>
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.68)' }}>昨日全平台实物销售</div>
                                <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700 }}>{formatOverviewCurrency(heartLampMetrics.platformYesterdayTotalSales)}</div>
                              </div>
                              <div style={{ borderRadius: '16px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '14px' }}>
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.68)' }}>近 7 / 30 天活跃</div>
                                <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700 }}>{heartLampMetrics.last7DaysOrderCount} / {heartLampMetrics.last30DaysOrderCount}</div>
                              </div>
                              {heartLampMetrics.burnRateType === 'brand_course' ? (
                                <div style={{ borderRadius: '16px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '14px' }}>
                                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.68)' }}>昨日非实物 GMV</div>
                                  <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700 }}>{formatOverviewCurrency(heartLampMetrics.nonPhysicalYesterdaySales)}</div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1.18fr 0.82fr', gap: '14px' }}>
                          <div
                            style={{
                              borderRadius: '20px',
                              background: 'linear-gradient(135deg, #2c2c2c 0%, #414141 100%)',
                              color: '#fff',
                              padding: '22px',
                              display: 'grid',
                              gap: '14px',
                              minHeight: '220px'
                            }}
                          >
                            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)' }}>
                              累计零售总价
                            </div>
                            <div style={{ fontSize: '42px', fontWeight: 700, lineHeight: 1 }}>
                              {formatOverviewCurrency(agentOverviewMetrics.confirmedRetailTotal)}
                            </div>
                            <div style={{ fontSize: '14px', lineHeight: 1.8, color: 'rgba(255,255,255,0.84)', maxWidth: '520px' }}>
                              已对账确认 {agentOverviewMetrics.confirmedOrderCount} 个主订单，按零售标价累计统计。这个数值更适合用于观察零售侧成交体量。
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginTop: 'auto' }}>
                              <div style={{ borderRadius: '16px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '14px' }}>
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.68)' }}>已确认订单</div>
                                <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700 }}>{agentOverviewMetrics.confirmedOrderCount}</div>
                              </div>
                              <div style={{ borderRadius: '16px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '14px' }}>
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.68)' }}>累计节省</div>
                                <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700 }}>{formatOverviewCurrency(agentOverviewMetrics.confirmedSavedTotal)}</div>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gap: '12px' }}>
                            <div
                              style={{
                                borderRadius: '18px',
                                border: '1px solid rgba(209, 213, 219, 0.8)',
                                backgroundColor: '#fff',
                                padding: '16px',
                                display: 'grid',
                                gap: '10px'
                              }}
                            >
                              <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#475569' }}>
                                账户心灯 · {agentBeanMetrics.status === 'extinguished' ? '已熄灭' : agentBeanMetrics.status === 'warning' ? '预警中' : '长明中'}
                              </div>
                              <div style={{ fontSize: '13px', lineHeight: 1.8, color: '#64748b' }}>
                                代理商账户福豆会在每次对账完成后按零售总价补充，并按与品牌方一致的速率每日燃烧。
                              </div>
                              <div style={{ fontSize: '12px', lineHeight: 1.7, color: '#94a3b8' }}>
                                每日燃烧掉的福豆会等量回流系统福豆池，形成统一的系统账户闭环。
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                                <div style={{ borderRadius: '14px', backgroundColor: '#f8fafc', padding: '12px' }}>
                                  <div style={{ fontSize: '12px', color: '#64748b' }}>当前油量</div>
                                  <div style={{ marginTop: '6px', fontSize: '22px', fontWeight: 700, color: '#111827' }}>{Math.round(agentBeanMetrics.currentBeansBalance)} 粒</div>
                                </div>
                                <div style={{ borderRadius: '14px', backgroundColor: '#f8fafc', padding: '12px' }}>
                                  <div style={{ fontSize: '12px', color: '#64748b' }}>燃烧速度</div>
                                  <div style={{ marginTop: '6px', fontSize: '22px', fontWeight: 700, color: '#111827' }}>{agentBeanMetrics.dailyBeansConsumption.toFixed(1)} / 天</div>
                                </div>
                              </div>
                              <div style={{ fontSize: '12px', lineHeight: 1.8, color: '#64748b' }}>
                                {agentBeanMetrics.status === 'extinguished'
                                  ? `熄灭时长 ${agentBeanMetrics.extinguishedDays} 天 ${agentBeanMetrics.extinguishedHours} 小时。建议尽快完成新一轮对账或补充福豆。`
                                  : agentBeanMetrics.status === 'warning'
                                    ? `可燃烧约 ${agentBeanMetrics.remainingHours} 小时，预计燃尽：${agentBeanMetrics.estimatedExhaustedAt ? formatOverviewDateTime(agentBeanMetrics.estimatedExhaustedAt) : '待更新'}`
                                    : `可燃烧约 ${agentBeanMetrics.remainingDays} 天，预计燃尽：${agentBeanMetrics.estimatedExhaustedAt ? formatOverviewDateTime(agentBeanMetrics.estimatedExhaustedAt) : '待更新'}`}
                              </div>
                            </div>
                            <OverviewMetricCard
                              label="累计实付"
                              value={formatOverviewCurrency(agentOverviewMetrics.confirmedPayableTotal)}
                              description="按已确认完成的主订单折后实付金额累计。"
                              tone="clay"
                            />
                            <OverviewMetricCard
                              label="累计折扣率"
                              value={agentOverviewMetrics.confirmedRetailTotal > 0
                                ? `${Math.round((agentOverviewMetrics.confirmedPayableTotal / agentOverviewMetrics.confirmedRetailTotal) * 100)} 折`
                                : '0 折'}
                              description="基于累计零售总价与累计实付金额折算得到。"
                              tone="olive"
                            />
                            <OverviewMetricCard
                              label="周期范围"
                              value={OVERVIEW_RANGE_OPTIONS.find((item) => item.key === overviewRange)?.label || '全部'}
                              description="适合和最近已确认订单一起观察短期协同结果。"
                              tone="ink"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {isBrandLead ? (
                      <>
                        <OverviewSectionCard
                          title="各时间周期统计"
                          description="用统一口径比较近 7 天、近 30 天、近 90 天与全部周期的确认收款金额。"
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px', alignItems: 'end', minHeight: '240px' }}>
                            {brandOverviewMetrics.byCycle.map((item) => {
                              const maxValue = Math.max(...brandOverviewMetrics.byCycle.map((entry) => entry.value || 0), 1);
                              const heightPercent = Math.max(14, Math.round((item.value / maxValue) * 100));
                              return (
                                <div key={item.label} style={{ display: 'grid', gap: '12px', justifyItems: 'center' }}>
                                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{formatOverviewCurrency(item.value)}</div>
                                  <div
                                    style={{
                                      width: '100%',
                                      maxWidth: '84px',
                                      height: `${heightPercent * 1.5}px`,
                                      minHeight: '26px',
                                      borderRadius: '16px 16px 8px 8px',
                                      background: 'linear-gradient(180deg, #d68c65 0%, #b96d46 100%)',
                                      boxShadow: '0 8px 20px rgba(214, 140, 101, 0.24)'
                                    }}
                                  />
                                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{item.label}</div>
                                </div>
                              );
                            })}
                          </div>
                        </OverviewSectionCard>

                        <OverviewSectionCard
                          title="最近已确认子订单"
                          description="只展示当前周期内已发货 / 已完成的合作伙伴子订单，便于快速回看最近的回款来源。"
                        >
                          {brandOverviewMetrics.recentSubOrders.length === 0 ? (
                            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>当前还没有已确认收款的合作伙伴子订单。</div>
                          ) : (
                            <div style={{ display: 'grid', gap: '10px' }}>
                              {brandOverviewMetrics.recentSubOrders.map((subOrder) => (
                                <OverviewListRow
                                  key={subOrder.id}
                                  title={subOrder.subOrderNo}
                                  meta={`${subOrder.supplier || '未分配供应方'} · ${formatOverviewShortDate(subOrder.updated_at || subOrder.updatedAt || subOrder.created_at || subOrder.createdAt)} · 净结算 ${formatOverviewCurrency(subOrder.merchantSettleAmount || Number(subOrder.payableAmount || 0) - Number(subOrder.platformServiceFeeAmount || 0))}`}
                                  value={formatOverviewCurrency(subOrder.payableAmount || 0)}
                                  badge="已确认"
                                  badgeTone="olive"
                                />
                              ))}
                            </div>
                          )}
                        </OverviewSectionCard>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px' }}>
                          <OverviewMetricCard
                            label="累计实付"
                            value={formatOverviewCurrency(agentOverviewMetrics.confirmedPayableTotal)}
                            description="以合作伙伴订单里已确认完成的主订单折后实付金额累计。"
                            tone="clay"
                          />
                          <OverviewMetricCard
                            label="累计折扣率"
                            value={agentOverviewMetrics.confirmedRetailTotal > 0
                              ? `${Math.round((agentOverviewMetrics.confirmedPayableTotal / agentOverviewMetrics.confirmedRetailTotal) * 100)} 折`
                              : '0 折'}
                            description="方便快速判断这一阶段的整体成交折让水平。"
                            tone="olive"
                          />
                        </div>

                        <OverviewSectionCard
                          title="最近已确认订单"
                          description="按主订单回看最近完成对账的成交，帮助成员快速核对零售总价与实际支付。"
                        >
                          {agentOverviewMetrics.confirmedOrders.length === 0 ? (
                            <div style={{ fontSize: '13px', color: '#94a3b8' }}>当前还没有已对账确认的合作伙伴订单。</div>
                          ) : (
                            <div style={{ display: 'grid', gap: '10px' }}>
                              {agentOverviewMetrics.confirmedOrders.map((order) => (
                                <OverviewListRow
                                  key={order.id}
                                  title={order.orderNo}
                                  meta={`零售 ${formatOverviewCurrency(order.listAmount || 0)}`}
                                  value={formatOverviewCurrency(order.payableAmount || 0)}
                                  badge="已对账"
                                  badgeTone="clay"
                                />
                              ))}
                            </div>
                          )}
                        </OverviewSectionCard>
                      </>
                    )}
                  </div>
                )}

                {activeModule === '商品模块' && (
                  <>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {(liveCategoryFilters.length ? liveCategoryFilters : activeAgentWorkspace.layout.filters).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            if (item.startsWith('供应商')) {
                              return
                            }
                            setSelectedAgentCategory(item)
                          }}
                          style={{
                            borderRadius: '999px',
                            backgroundColor: selectedAgentCategory === item ? 'var(--theme-button-primary-bg)' : 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border)',
                            padding: '9px 14px',
                            fontSize: '12px',
                            color: selectedAgentCategory === item ? 'var(--theme-button-primary-text)' : 'var(--color-text-primary)',
                            cursor: item.startsWith('供应商') ? 'default' : 'pointer'
                          }}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {liveSupplierFilters.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setSelectedAgentSupplier(item)}
                          style={{
                            borderRadius: '999px',
                            backgroundColor: selectedAgentSupplier === item ? 'var(--theme-button-primary-bg)' : 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border)',
                            padding: '9px 14px',
                            fontSize: '12px',
                            color: selectedAgentSupplier === item ? 'var(--theme-button-primary-text)' : 'var(--color-text-primary)',
                            cursor: 'pointer'
                          }}
                        >
                          供货方：{item}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
                      {activeAgentWorkspace.layout.highlights.map((item) => (
                        <div
                          key={item}
                          style={{
                            borderRadius: '14px',
                            backgroundColor: '#fff',
                            border: '1px solid var(--color-border)',
                            padding: '14px',
                            fontSize: '13px',
                            color: 'var(--color-text-secondary)'
                          }}
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                    {agentCartSummary.count > 0 && (
                      <div
                        style={{
                          borderRadius: '14px',
                          backgroundColor: 'var(--color-accent-ink)',
                          color: '#fff',
                          padding: '14px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '16px',
                          flexWrap: 'wrap'
                        }}
                      >
                        <div style={{ fontSize: '13px', lineHeight: 1.7 }}>
                          当前采购单已加入 {agentCartSummary.count} 件商品，涉及 {agentCartSummary.suppliers} 个供货方，标价合计 ¥{agentCartSummary.listAmount.toFixed(0)}，当前折扣 {Math.round(agentCartSummary.discountRate * 100)} 折，折后实付 ¥{agentCartSummary.discountedTotal.toFixed(0)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveModule('购物车与订单')}
                          style={{
                            border: 'none',
                            borderRadius: '10px',
                            backgroundColor: 'var(--theme-button-secondary-bg)',
                            color: 'var(--theme-button-secondary-text)',
                            padding: '10px 12px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          去订单中心
                        </button>
                      </div>
                    )}
                    {agentCart.length > 0 && (
                      <div
                        style={{
                          borderRadius: '14px',
                          backgroundColor: '#fff',
                          border: '1px solid var(--color-border)',
                          padding: '14px',
                          display: 'grid',
                          gap: '10px'
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>采购单明细</div>
                        {agentCart.map((item) => (
                          <div
                            key={`${item.name}-${item.supplier}`}
                            style={{
                              borderRadius: '12px',
                              backgroundColor: 'var(--color-bg-secondary)',
                              padding: '12px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: '12px',
                              alignItems: 'center'
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{item.name}</div>
                              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                {item.category} · {item.supplier} · ¥{Number(item.unitPrice || 0).toFixed(2)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveAgentItem(item.name)}
                              style={{
                                border: '1px solid var(--color-border)',
                                borderRadius: '10px',
                                backgroundColor: '#fff',
                                color: 'var(--color-text-primary)',
                                padding: '8px 10px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                flexShrink: 0
                              }}
                            >
                              移除
                            </button>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                          <button
                            type="button"
                            onClick={handleSubmitAgentOrder}
                            style={{
                              border: 'none',
                              borderRadius: '10px',
                              backgroundColor: 'var(--theme-button-primary-bg)',
                              color: 'var(--theme-button-primary-text)',
                              padding: '10px 14px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            提交主订单
                          </button>
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px' }}>
                      {(liveAgentProductCards.length ? liveAgentProductCards : activeAgentWorkspace.layout.cards).map((card) => (
                        <div
                          key={card.name}
                          style={{
                            borderRadius: '16px',
                            backgroundColor: '#fff',
                            border: '1px solid var(--color-border)',
                            padding: '16px',
                            display: 'grid',
                            gap: '8px'
                          }}
                        >
                          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{card.name}</div>
                          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{card.meta}</div>
                          <div style={{ fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: 700 }}>{card.price}</div>
                          {Number(card.originalPrice || 0) > 0 && (
                            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textDecoration: 'line-through' }}>
                              折前 ¥{Number(card.originalPrice).toFixed(2)}
                            </div>
                          )}
                          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{card.stock}</div>
                          <button
                            type="button"
                            onClick={() => handleAddAgentItem(card)}
                            style={{
                              marginTop: '6px',
                              border: 'none',
                              borderRadius: '10px',
                              backgroundColor: 'var(--theme-button-primary-bg)',
                              color: 'var(--theme-button-primary-text)',
                              padding: '10px 12px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {card.action}
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {activeRole === '品牌方' && activeModule === '商品管理' && (
                  <ShopManagement
                    mode="brand"
                    showCreateButton={true}
                    categories={liveShopCategories}
                    products={brandScopedProducts}
                    skus={[]}
                    orders={[]}
                    orderItems={[]}
                    partnerOrders={livePartnerOrders}
                    partnerSubOrders={livePartnerSubOrders}
                    partnerUsers={livePartnerUsers}
                    partnerBrands={livePartnerBrands}
                    partnerBrandMembers={livePartnerBrandMembers}
                    partnerBrandInvites={livePartnerBrandInvites}
                    actorUser={resolvedPartnerUser}
                    actorUserTags={effectiveUserTags}
                    shopHomeLivingSettings={{ cards: [] }}
                    savingShopHomeLivingSettings={false}
                    onSaveProduct={async (productDraft) => {
                      await DatabaseService.saveShopProduct({
                        ...productDraft,
                        tags: currentBrandScopeTagNames,
                        brandId: activeBrand?.id || '',
                        storeId: activeBrand?.slug || currentStoreId,
                        storeName: activeBrand?.name || currentStoreName
                      }, { actorUser: resolvedPartnerUser });
                      const refreshedShopData = await DatabaseService.getShopManagementData();
                      setLiveShopProducts(refreshedShopData.products || []);
                      setLiveShopCategories(refreshedShopData.categories || []);
                    }}
                    onSaveShopHomeLivingSettings={async () => {}}
                    onUpdateOrderStatus={async () => {}}
                    onUpdatePartnerSubOrderStatus={async () => {}}
                    onUpdatePartnerBrandCommunityBeansBalance={async () => {}}
                  />
                )}

                {activeRole === '品牌方' && activeModule === '接单发货' && (
                  <div
                    style={{
                      borderRadius: '18px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: '#fff',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        padding: '14px 18px',
                        borderBottom: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: 'var(--color-text-primary)'
                      }}
                    >
                      品牌方接单发货台
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
                        <thead>
                          <tr>
                            {['订单', '商品件数', '状态', '订单金额', '平台技术服务费', '商家应结算', '操作'].map((column) => (
                              <th
                                key={column}
                                style={{
                                  textAlign: 'left',
                                  padding: '14px 16px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  color: 'var(--color-text-secondary)',
                                  borderBottom: '1px solid var(--color-border)',
                                  backgroundColor: '#fff'
                                }}
                              >
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(liveBrandFulfillmentRows.length ? liveBrandFulfillmentRows : MODULE_PREVIEW_MAP['接单发货'].rows).map((row, rowIndex, sourceRows) => (
                            <tr key={`brand-fulfillment-${rowIndex}`}>
                              {row.map((cell, cellIndex) => (
                                <td
                                  key={`brand-fulfillment-${rowIndex}-${cellIndex}`}
                                  style={{
                                    padding: '14px 16px',
                                    fontSize: '14px',
                                    color: 'var(--color-text-primary)',
                                    borderBottom: rowIndex === sourceRows.length - 1 ? 'none' : '1px solid #f1f5f9'
                                  }}
                                >
                                  {cell}
                                </td>
                              ))}
                              {liveBrandFulfillmentRefs[rowIndex] && (
                                <td
                                  style={{
                                    padding: '14px 16px',
                                    fontSize: '14px',
                                    color: '#334155',
                                    borderBottom: rowIndex === sourceRows.length - 1 ? 'none' : '1px solid #f1f5f9'
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleAdvanceBrandOrderStatus(liveBrandFulfillmentRefs[rowIndex])}
                                    style={{
                                      border: 'none',
                                      borderRadius: '10px',
                                      backgroundColor: 'var(--theme-button-primary-bg)',
                                      color: 'var(--theme-button-primary-text)',
                                      padding: '8px 12px',
                                      fontSize: '12px',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    推进状态
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeRole === '品牌方' && activeModule === '发货合并提示' && (
                  <div style={{ display: 'grid', gap: '16px' }}>
                    <div
                      style={{
                        borderRadius: '18px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: '#fff',
                        padding: '18px',
                        display: 'grid',
                        gap: '12px'
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>发货合并提示</div>
                      <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                        系统会按同一店铺、相近创建时间、相同收件路径的订单进行分组，给出可合并包裹的提示。这一页先作为运营辅助视图，不会自动替你改写订单或运单数据。
                      </div>
                    </div>

                    {liveBrandFulfillmentRows.length === 0 ? (
                      <div
                        style={{
                          borderRadius: '18px',
                          border: '1px solid var(--color-border)',
                          backgroundColor: '#fff',
                          padding: '18px',
                          fontSize: '14px',
                          color: 'var(--color-text-secondary)'
                        }}
                      >
                        当前没有可用于判断合并发货的品牌方订单。
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: '12px' }}>
                        {liveBrandFulfillmentRows.slice(0, 8).map((row, index) => {
                          const orderRef = liveBrandFulfillmentRefs[index] || `brand-merge-${index}`
                          const orderLabel = row[0] || '未命名订单'
                          const itemCountLabel = row[1] || '0 件'
                          const statusLabel = row[2] || '待处理'
                          const amountLabel = row[3] || '¥0.00'
                          const isMergeCandidate = ['待支付', 'pending_payment', '处理中', 'processing', 'accepted', 'packing'].includes(statusLabel)

                          return (
                            <div
                              key={orderRef}
                              style={{
                                borderRadius: '16px',
                                border: '1px solid var(--color-border)',
                                backgroundColor: '#fff',
                                padding: '16px',
                                display: 'grid',
                                gap: '10px'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <div>
                                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{orderLabel}</div>
                                  <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                    {itemCountLabel} · {statusLabel} · {amountLabel}
                                  </div>
                                </div>
                                <span
                                  style={{
                                    borderRadius: '999px',
                                    padding: '8px 12px',
                                    backgroundColor: isMergeCandidate ? 'rgba(214, 140, 101, 0.14)' : 'var(--color-bg-secondary)',
                                    color: isMergeCandidate ? '#9a5a37' : 'var(--color-text-secondary)',
                                    fontSize: '12px',
                                    fontWeight: 700
                                  }}
                                >
                                  {isMergeCandidate ? '建议检查是否可合并包裹' : '当前无需合并提示'}
                                </span>
                              </div>
                              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                                {isMergeCandidate
                                  ? '如果同一批发客户在相近时间内下了多笔同店铺订单，建议人工核对收件地址与商品体积，再决定是否合并出一个包裹。'
                                  : '当前订单已经处于后续状态，系统不再把它列为优先合并候选。'}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {activeRole === '品牌方' && isBrandLead && activeModule === '资金与账单' && (
                  <div
                    style={{
                      borderRadius: '18px',
                      border: '1px solid var(--color-border)',
                      backgroundColor: '#fff',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        padding: '14px 18px',
                        borderBottom: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: 'var(--color-text-primary)'
                      }}
                    >
                      品牌方资金与账单
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
                        <thead>
                          <tr>
                            {['订单', '收款金额', '平台技术服务费', '商家应结算', '支付状态', '账单记录'].map((column) => (
                              <th
                                key={column}
                                style={{
                                  textAlign: 'left',
                                  padding: '14px 16px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  color: 'var(--color-text-secondary)',
                                  borderBottom: '1px solid var(--color-border)',
                                  backgroundColor: '#fff'
                                }}
                              >
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(liveBrandFinanceRows.length ? liveBrandFinanceRows : MODULE_PREVIEW_MAP['资金与账单'].rows).map((row, rowIndex, sourceRows) => (
                            <tr key={`brand-finance-${rowIndex}`}>
                              {row.map((cell, cellIndex) => (
                                <td
                                  key={`brand-finance-${rowIndex}-${cellIndex}`}
                                  style={{
                                    padding: '14px 16px',
                                    fontSize: '14px',
                                    color: 'var(--color-text-primary)',
                                    borderBottom: rowIndex === sourceRows.length - 1 ? 'none' : '1px solid #f1f5f9'
                                  }}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeRole === '品牌方' && isBrandLead && activeModule === '店铺设置' && (
                  <div style={{ display: 'grid', gap: '16px' }}>
                    <div
                      style={{
                        borderRadius: '18px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: '#fff',
                        padding: '18px',
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 0.8fr 0.8fr',
                        gap: '14px'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>当前店铺</div>
                        <div style={{ marginTop: '10px', fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{activeBrand?.name || storeDraft.storeName || '未命名店铺'}</div>
                        <div style={{ marginTop: '6px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                          店铺标识：{activeBrand?.slug || currentStoreId || '未设置'}
                        </div>
                      </div>
                      <div style={{ borderRadius: '14px', backgroundColor: 'var(--color-bg-secondary)', padding: '16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>成员数量</div>
                        <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{visibleStoreMembers.length}</div>
                      </div>
                      <div style={{ borderRadius: '14px', backgroundColor: 'var(--color-bg-secondary)', padding: '16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>邀请记录</div>
                        <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{activeBrandInvites.length}</div>
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: '18px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: '#fff',
                        padding: '18px',
                        display: 'grid',
                        gap: '14px'
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>店铺信息</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px' }}>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>店铺名称</label>
                          <input
                            value={storeDraft.storeName}
                            onChange={(event) => setStoreDraft((current) => ({ ...current, storeName: event.target.value }))}
                            style={{ borderRadius: '10px', border: '1px solid var(--color-border)', padding: '10px 12px', fontSize: '13px' }}
                          />
                        </div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>联系人</label>
                          <input
                            value={storeDraft.storeContactName}
                            onChange={(event) => setStoreDraft((current) => ({ ...current, storeContactName: event.target.value }))}
                            style={{ borderRadius: '10px', border: '1px solid var(--color-border)', padding: '10px 12px', fontSize: '13px' }}
                          />
                        </div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>联系电话</label>
                          <input
                            value={storeDraft.storeContact}
                            onChange={(event) => setStoreDraft((current) => ({ ...current, storeContact: event.target.value }))}
                            style={{ borderRadius: '10px', border: '1px solid var(--color-border)', padding: '10px 12px', fontSize: '13px' }}
                          />
                        </div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>客服微信</label>
                          <input
                            value={storeDraft.storeWechat}
                            onChange={(event) => setStoreDraft((current) => ({ ...current, storeWechat: event.target.value }))}
                            style={{ borderRadius: '10px', border: '1px solid var(--color-border)', padding: '10px 12px', fontSize: '13px' }}
                          />
                        </div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>社区福豆余额</label>
                          <input
                            type="number"
                            min="0"
                            value={storeDraft.communityBeansBalance}
                            onChange={(event) => setStoreDraft((current) => ({ ...current, communityBeansBalance: Math.max(0, Number(event.target.value) || 0) }))}
                            style={{ borderRadius: '10px', border: '1px solid var(--color-border)', padding: '10px 12px', fontSize: '13px' }}
                          />
                        </div>
                        <div style={{ display: 'grid', alignItems: 'end' }}>
                          <button
                            type="button"
                            onClick={() => { void handleSaveStoreProfile() }}
                            disabled={savingStoreProfile}
                            style={{
                              border: 'none',
                              borderRadius: '10px',
                              background: 'var(--theme-button-primary-bg)',
                              color: 'var(--theme-button-primary-text)',
                              padding: '10px 14px',
                              fontSize: '13px',
                              fontWeight: 700,
                              cursor: savingStoreProfile ? 'default' : 'pointer'
                            }}
                          >
                            {savingStoreProfile ? '保存中...' : '保存店铺信息'}
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>店铺简介</label>
                        <textarea
                          value={storeDraft.storeDescription}
                          onChange={(event) => setStoreDraft((current) => ({ ...current, storeDescription: event.target.value }))}
                          rows={4}
                          style={{ borderRadius: '12px', border: '1px solid var(--color-border)', padding: '12px 14px', fontSize: '13px', resize: 'vertical' }}
                        />
                      </div>

                      <div style={{ borderRadius: '14px', backgroundColor: '#fbfbf8', border: '1px solid var(--color-border)', padding: '14px', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                        心灯说明：这里维护的是店铺级社区福豆余额。普通品牌方燃烧速度基于昨日店铺实物 GMV、昨日全平台实物 GMV 和近 7 / 30 天活跃度计算；带有“理悟课程”标签的品牌方会在此基础上，再按昨日非实物 GMV与全平台非实物 GMV 计算一套同构速率并求和。
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div style={{ display: 'grid', gap: '12px', borderRadius: '14px', backgroundColor: 'var(--color-bg-secondary)', padding: '14px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>发货地址</div>
                          <input
                            value={storeDraft.shippingReceiver}
                            onChange={(event) => setStoreDraft((current) => ({ ...current, shippingReceiver: event.target.value }))}
                            placeholder="收件人"
                            style={{ borderRadius: '10px', border: '1px solid var(--color-border)', padding: '10px 12px', fontSize: '13px' }}
                          />
                          <input
                            value={storeDraft.shippingPhone}
                            onChange={(event) => setStoreDraft((current) => ({ ...current, shippingPhone: event.target.value }))}
                            placeholder="联系电话"
                            style={{ borderRadius: '10px', border: '1px solid var(--color-border)', padding: '10px 12px', fontSize: '13px' }}
                          />
                          <textarea
                            value={storeDraft.shippingDetail}
                            onChange={(event) => setStoreDraft((current) => ({ ...current, shippingDetail: event.target.value }))}
                            rows={3}
                            placeholder="详细地址"
                            style={{ borderRadius: '12px', border: '1px solid var(--color-border)', padding: '12px 14px', fontSize: '13px', resize: 'vertical' }}
                          />
                        </div>

                        <div style={{ display: 'grid', gap: '12px', borderRadius: '14px', backgroundColor: 'var(--color-bg-secondary)', padding: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>退货地址</div>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                              <input
                                type="checkbox"
                                checked={storeDraft.returnSameAsShipping}
                                onChange={(event) => setStoreDraft((current) => ({ ...current, returnSameAsShipping: event.target.checked }))}
                              />
                              同发货地址
                            </label>
                          </div>
                          <input
                            value={storeDraft.returnSameAsShipping ? storeDraft.shippingReceiver : storeDraft.returnReceiver}
                            onChange={(event) => setStoreDraft((current) => ({ ...current, returnReceiver: event.target.value }))}
                            placeholder="收件人"
                            disabled={storeDraft.returnSameAsShipping}
                            style={{ borderRadius: '10px', border: '1px solid var(--color-border)', padding: '10px 12px', fontSize: '13px', opacity: storeDraft.returnSameAsShipping ? 0.7 : 1 }}
                          />
                          <input
                            value={storeDraft.returnSameAsShipping ? storeDraft.shippingPhone : storeDraft.returnPhone}
                            onChange={(event) => setStoreDraft((current) => ({ ...current, returnPhone: event.target.value }))}
                            placeholder="联系电话"
                            disabled={storeDraft.returnSameAsShipping}
                            style={{ borderRadius: '10px', border: '1px solid var(--color-border)', padding: '10px 12px', fontSize: '13px', opacity: storeDraft.returnSameAsShipping ? 0.7 : 1 }}
                          />
                          <textarea
                            value={storeDraft.returnSameAsShipping ? storeDraft.shippingDetail : storeDraft.returnDetail}
                            onChange={(event) => setStoreDraft((current) => ({ ...current, returnDetail: event.target.value }))}
                            rows={3}
                            placeholder="详细地址"
                            disabled={storeDraft.returnSameAsShipping}
                            style={{ borderRadius: '12px', border: '1px solid var(--color-border)', padding: '12px 14px', fontSize: '13px', resize: 'vertical', opacity: storeDraft.returnSameAsShipping ? 0.7 : 1 }}
                          />
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: '18px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: '#fff',
                        padding: '18px',
                        display: 'grid',
                        gap: '14px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>成员邀请</div>
                        <input
                          value={storeMemberQuery}
                          onChange={(event) => setStoreMemberQuery(event.target.value)}
                          placeholder="输入 uid / 手机号 / 用户名"
                          style={{ width: '280px', borderRadius: '10px', border: '1px solid var(--color-border)', padding: '10px 12px', fontSize: '13px' }}
                        />
                      </div>

                      <div style={{ display: 'grid', gap: '10px' }}>
                        {storeInviteCandidates.length === 0 ? (
                          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>当前没有可邀请的用户。</div>
                        ) : (
                          storeInviteCandidates.map((user) => (
                            <div
                              key={user.id}
                              style={{
                                borderRadius: '12px',
                                backgroundColor: 'var(--color-bg-secondary)',
                                padding: '12px 14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: '12px',
                                alignItems: 'center'
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                  {user.name || `uid=${user.uid || '未知'}`}
                                </div>
                                <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                  uid={user.uid || '未知'} · {user.phone || '未绑定手机'}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => { void handleInviteStoreMember(user.id) }}
                                disabled={invitingStoreMemberId === user.id}
                                style={{
                                  border: 'none',
                                  borderRadius: '10px',
                                  background: 'var(--theme-button-primary-bg)',
                                  color: 'var(--theme-button-primary-text)',
                                  padding: '10px 14px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: invitingStoreMemberId === user.id ? 'default' : 'pointer',
                                  flexShrink: 0
                                }}
                              >
                                {invitingStoreMemberId === user.id ? '邀请中...' : '邀请为品牌方成员'}
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      <div style={{ display: 'grid', gap: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>当前店铺成员</div>
                        {visibleStoreMembers.length === 0 ? (
                          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>当前店铺还没有成员。</div>
                        ) : (
                          visibleStoreMembers.map((user) => (
                            <div
                              key={`member_${user.id}`}
                              style={{
                                borderRadius: '12px',
                                backgroundColor: 'var(--color-bg-secondary)',
                                padding: '12px 14px',
                                display: 'grid',
                                gridTemplateColumns: '1fr auto',
                                gap: '12px',
                                alignItems: 'center'
                              }}
                            >
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                  {user.name || `uid=${user.uid || '未知'}`}
                                </div>
                                <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                  {user.brandMemberRole === 'owner' ? '主理人' : '普通成员'} · uid={user.uid || '未知'}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: '18px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: '#fff',
                        padding: '18px',
                        display: 'grid',
                        gap: '12px'
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>邀请记录</div>
                      {activeBrandInvites.length === 0 ? (
                        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>当前还没有邀请记录。</div>
                      ) : (
                        activeBrandInvites.map((invite) => (
                          <div
                            key={invite.id}
                            style={{
                              borderRadius: '12px',
                              backgroundColor: 'var(--color-bg-secondary)',
                              padding: '12px 14px',
                              display: 'grid',
                              gridTemplateColumns: '1fr auto auto',
                              gap: '12px',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                {invite.inviteePhone || invite.inviteeUserId || '未识别用户'}
                              </div>
                              <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                {invite.role === 'owner' ? '主理人' : '普通成员'} · 创建于 {invite.createdAt || '未知时间'}
                              </div>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{invite.status}</div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{invite.acceptedAt || '待接受'}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {activeModule === '购物车与订单' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
                      {[
                        `主订单 ${Math.max(12, agentCartSummary.count ? 13 : 12)}`,
                        `子订单 ${Math.max(28, 28 + agentCartSummary.suppliers)}`,
                        `待付款 ${Math.max(4, agentCartSummary.count ? 5 : 4)}`,
                        `待确认对账 ${Math.max(3, agentCartSummary.suppliers || 3)}`
                      ].map((item) => (
                        <div
                          key={item}
                          style={{
                            borderRadius: '14px',
                            backgroundColor: '#fff',
                            border: '1px solid var(--color-border)',
                            padding: '14px',
                            fontSize: '13px',
                            color: 'var(--color-text-secondary)'
                          }}
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '14px' }}>
                      <div style={{ borderRadius: '16px', backgroundColor: '#fff', border: '1px solid var(--color-border)', padding: '14px', display: 'grid', gap: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>主订单</div>
                        {submittedAgentOrder && (
                          <div style={{ borderRadius: '12px', backgroundColor: 'rgba(143, 165, 138, 0.16)', padding: '12px', display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr 0.8fr', gap: '8px', fontSize: '13px', color: 'var(--color-text-primary)' }}>
                            <div>{submittedAgentOrder.orderNo}</div>
                            <div>{submittedAgentOrder.subOrders.length} 个子订单</div>
                            <div>¥{submittedAgentOrder.payableAmount.toFixed(2)}</div>
                            <div>待付款</div>
                          </div>
                        )}
                        {agentCart.length > 0 && (
                          <div style={{ borderRadius: '12px', backgroundColor: 'rgba(214, 140, 101, 0.12)', padding: '12px', display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr 0.8fr', gap: '8px', fontSize: '13px', color: 'var(--color-text-primary)' }}>
                            <div>PO-TEMP-001</div>
                            <div>{agentCartSubOrders.length} 个子订单</div>
                            <div>¥{agentCartSummary.discountedTotal.toFixed(2)}</div>
                            <div>待付款</div>
                          </div>
                        )}
                        {activeAgentWorkspace.layout.primaryRows.map((row) => (
                          <div key={row.join('-')} style={{ borderRadius: '12px', backgroundColor: 'var(--color-bg-secondary)', padding: '12px', display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr 0.8fr', gap: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                            {row.map((cell) => <div key={cell}>{cell}</div>)}
                          </div>
                        ))}
                      </div>
                      <div style={{ borderRadius: '16px', backgroundColor: '#fff', border: '1px solid var(--color-border)', padding: '14px', display: 'grid', gap: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>子订单</div>
                        {agentCart.length > 0 && (
                          <div style={{ borderRadius: '12px', backgroundColor: 'rgba(214, 140, 101, 0.12)', padding: '12px', fontSize: '13px', color: 'var(--color-text-primary)' }}>
                            当前采购单已暂存 {agentCartSummary.count} 件商品，预计生成 {Math.max(1, agentCartSummary.suppliers)} 个新子订单。
                          </div>
                        )}
                        {submittedAgentOrder?.subOrders?.map((subOrder) => (
                          <div key={`${subOrder.key}-submitted`} style={{ borderRadius: '12px', backgroundColor: 'rgba(143, 165, 138, 0.16)', padding: '12px', display: 'grid', gridTemplateColumns: '0.9fr 0.6fr 0.8fr 0.7fr', gap: '8px', fontSize: '13px', color: 'var(--color-text-primary)' }}>
                            <div>{subOrder.subOrderNo}</div>
                            <div>{subOrder.supplier}</div>
                            <div>{subOrder.category}</div>
                            <div>{brandOrderStatuses[subOrder.subOrderNo] || subOrder.status}</div>
                          </div>
                        ))}
                        {agentCartSubOrders.map((subOrder) => (
                          <div key={subOrder.key} style={{ borderRadius: '12px', backgroundColor: 'rgba(214, 140, 101, 0.12)', padding: '12px', display: 'grid', gridTemplateColumns: '0.9fr 0.6fr 0.8fr 0.7fr', gap: '8px', fontSize: '13px', color: 'var(--color-text-primary)' }}>
                            <div>{subOrder.subOrderNo}</div>
                            <div>{subOrder.supplier}</div>
                            <div>{subOrder.category}</div>
                            <div>¥{subOrder.payableAmount.toFixed(2)}</div>
                          </div>
                        ))}
                        {activeAgentWorkspace.layout.secondaryRows.map((row) => (
                          <div key={row.join('-')} style={{ borderRadius: '12px', backgroundColor: 'var(--color-bg-secondary)', padding: '12px', display: 'grid', gridTemplateColumns: '0.9fr 0.6fr 0.8fr 0.7fr', gap: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                            {row.map((cell) => <div key={cell}>{cell}</div>)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {activeModule === '物流跟踪' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '14px' }}>
                    <div style={{ borderRadius: '16px', backgroundColor: '#fff', border: '1px solid var(--color-border)', padding: '14px', display: 'grid', gap: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>包裹列表</div>
                      {submittedAgentOrder?.subOrders?.map((subOrder) => (
                        <div key={`${subOrder.key}-logistics`} style={{ borderRadius: '12px', backgroundColor: 'rgba(143, 165, 138, 0.16)', padding: '12px', display: 'grid', gap: '6px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{subOrder.subOrderNo}</div>
                          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{subOrder.supplier} · {brandOrderStatuses[subOrder.subOrderNo] || subOrder.status}</div>
                          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                            {['shipped', '已发货'].includes(brandOrderStatuses[subOrder.subOrderNo]) ? '运单已生成，等待签收' : '支付完成后生成运单号'}
                          </div>
                        </div>
                      ))}
                      {activeAgentWorkspace.layout.packages.map((pkg) => (
                        <div key={pkg.no} style={{ borderRadius: '12px', backgroundColor: 'var(--color-bg-secondary)', padding: '12px', display: 'grid', gap: '6px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{pkg.no}</div>
                          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{pkg.supplier} · {pkg.state}</div>
                          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{pkg.trace}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderRadius: '16px', backgroundColor: '#fff', border: '1px solid var(--color-border)', padding: '14px', display: 'grid', gap: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>辅助入口</div>
                      {activeAgentWorkspace.layout.side.map((item) => (
                        <div key={item} style={{ borderRadius: '12px', backgroundColor: 'var(--color-bg-secondary)', padding: '12px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeModule === '消息与通讯' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: '14px' }}>
                    <div style={{ borderRadius: '16px', backgroundColor: '#fff', border: '1px solid var(--color-border)', padding: '14px', display: 'grid', gap: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>会话列表</div>
                      {activeAgentWorkspace.layout.conversations.map((item) => (
                        <div key={item.name + item.topic} style={{ borderRadius: '12px', backgroundColor: 'var(--color-bg-secondary)', padding: '12px', display: 'grid', gap: '4px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{item.name}</div>
                          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{item.topic}</div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item.state}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderRadius: '16px', backgroundColor: '#fff', border: '1px solid var(--color-border)', padding: '14px', display: 'grid', gap: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>会话详情</div>
                      {activeAgentWorkspace.layout.detail.map((item) => (
                        <div key={item} style={{ borderRadius: '12px', backgroundColor: 'var(--color-bg-secondary)', padding: '12px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeModule === '对账展示' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
                      {[
                        `应付总额 ¥${(8420 + agentCartSummary.discountedTotal).toFixed(0)}`,
                        `待确认 ¥${(1860 + agentCartSummary.discountedTotal).toFixed(0)}`,
                        `本周已确认 ${Math.max(9, 9 + agentCartSummary.suppliers)} 笔`
                      ].map((item) => (
                        <div
                          key={item}
                          style={{
                            borderRadius: '14px',
                            backgroundColor: '#fff',
                            border: '1px solid var(--color-border)',
                            padding: '14px',
                            fontSize: '13px',
                            color: 'var(--color-text-secondary)'
                          }}
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                    <div style={{ borderRadius: '16px', backgroundColor: '#fff', border: '1px solid var(--color-border)', padding: '14px', display: 'grid', gap: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>对子订单</div>
                      {submittedAgentOrder?.subOrders?.map((subOrder) => (
                        <div key={`${subOrder.subOrderNo}-finance`} style={{ borderRadius: '12px', backgroundColor: 'rgba(143, 165, 138, 0.16)', padding: '12px', display: 'grid', gridTemplateColumns: '0.8fr 0.6fr 0.8fr 0.7fr', gap: '8px', fontSize: '13px', color: 'var(--color-text-primary)' }}>
                          <div>{subOrder.subOrderNo}</div>
                          <div>{subOrder.supplier}</div>
                          <div>¥{subOrder.payableAmount.toFixed(2)}</div>
                          <div>{brandOrderStatuses[subOrder.subOrderNo] || subOrder.status}</div>
                        </div>
                      ))}
                      {agentCartSubOrders.map((subOrder) => (
                        <div key={subOrder.subOrderNo} style={{ borderRadius: '12px', backgroundColor: 'rgba(214, 140, 101, 0.12)', padding: '12px', display: 'grid', gridTemplateColumns: '0.8fr 0.6fr 0.8fr 0.7fr', gap: '8px', fontSize: '13px', color: 'var(--color-text-primary)' }}>
                          <div>{subOrder.subOrderNo}</div>
                          <div>{subOrder.supplier}</div>
                          <div>¥{subOrder.payableAmount.toFixed(2)}</div>
                          <div>{Math.round(subOrder.discountRate * 100)} 折</div>
                        </div>
                      ))}
                      {activeAgentWorkspace.layout.rows.map((row) => (
                        <div key={row.join('-')} style={{ borderRadius: '12px', backgroundColor: 'var(--color-bg-secondary)', padding: '12px', display: 'grid', gridTemplateColumns: '0.8fr 0.6fr 0.8fr 0.7fr', gap: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                          {row.map((cell) => <div key={cell}>{cell}</div>)}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {activeAgentWorkspace.layout.tools.map((tool) => (
                        <button
                          key={tool}
                          type="button"
                          style={{
                            border: '1px solid var(--color-border)',
                            borderRadius: '12px',
                            backgroundColor: '#fff',
                            color: 'var(--color-text-primary)',
                            padding: '10px 14px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {tool}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

          </div>
        </section>
        ) : (
          <section
            style={{
              display: 'grid'
            }}
          >
            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: '20px',
                boxShadow: 'var(--shadow-sm)',
                padding: '24px',
                display: 'grid',
                gap: '18px'
              }}
            >
              {(partnerDataErrors.categories || partnerDataErrors.products) && (
                <div
                  style={{
                    borderRadius: '14px',
                    backgroundColor: '#fff7ed',
                    border: '1px solid #fdba74',
                    padding: '14px',
                    display: 'grid',
                    gap: '8px'
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#9a3412' }}>部分数据加载失败</div>
                  {partnerDataErrors.categories && (
                    <div style={{ fontSize: '12px', color: '#9a3412' }}>分类：{partnerDataErrors.categories}</div>
                  )}
                  {partnerDataErrors.products && (
                    <div style={{ fontSize: '12px', color: '#9a3412' }}>商品：{partnerDataErrors.products}</div>
                  )}
                </div>
              )}

              <div
                style={{
                  borderRadius: '16px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: '#fff',
                  padding: '16px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '14px'
                }}
              >
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    当前所属店铺
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {activeBrand?.name || currentStoreName || '未绑定店铺'}
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    {activeBrand?.slug || currentStoreId || '未设置店铺标识'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    当前可发布分类范围
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {brandAllowedCategoryNames.length === 0 ? (
                      <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>未分配可发布分类</span>
                    ) : (
                      brandAllowedCategoryNames.map((name) => (
                        <span
                          key={name}
                          style={{
                            borderRadius: '999px',
                            padding: '8px 12px',
                            backgroundColor: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border)',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: 'var(--color-text-primary)'
                          }}
                        >
                          {name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <ShopManagement
                mode="brand"
                showCreateButton={true}
                categories={liveShopCategories}
                products={brandScopedProducts}
                skus={[]}
                orders={[]}
                orderItems={[]}
                partnerOrders={livePartnerOrders}
                partnerSubOrders={livePartnerSubOrders}
                partnerUsers={livePartnerUsers}
                partnerBrands={livePartnerBrands}
                partnerBrandMembers={livePartnerBrandMembers}
                partnerBrandInvites={livePartnerBrandInvites}
                actorUser={resolvedPartnerUser}
                actorUserTags={effectiveUserTags}
                shopHomeLivingSettings={{ cards: [] }}
                savingShopHomeLivingSettings={false}
                onSaveProduct={async (productDraft) => {
                  await DatabaseService.saveShopProduct({
                    ...productDraft,
                    tags: currentBrandScopeTagNames,
                    brandId: activeBrand?.id || '',
                    storeId: activeBrand?.slug || currentStoreId,
                    storeName: activeBrand?.name || currentStoreName
                  }, { actorUser: resolvedPartnerUser });
                  const refreshedShopData = await DatabaseService.getShopManagementData();
                  setLiveShopProducts(refreshedShopData.products || []);
                  setLiveShopCategories(refreshedShopData.categories || []);
                }}
                onSaveShopHomeLivingSettings={async () => {}}
                onUpdateOrderStatus={async () => {}}
                onUpdatePartnerSubOrderStatus={async () => {}}
                onUpdatePartnerBrandCommunityBeansBalance={async () => {}}
              />
            </div>
          </section>
        )}
      </div>
        )}
      </div>
    </div>
  )
}

export default Partner

// Add CSS reset to remove default margins
const addCSSReset = () => {
  const style = document.createElement('style');
  style.textContent = `
    body, html {
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
    }
    * {
      box-sizing: border-box !important;
    }
  `;
  document.head.appendChild(style);
};

// Apply CSS reset when component mounts
if (typeof window !== 'undefined') {
  addCSSReset();
}

const AdminDashboardPanel = ({
  embedded = false,
  activeTabOverride = null,
  onActiveTabChange = null
}) => {
  const readInitialSidebarState = () => {
    if (typeof window === 'undefined') {
      return true;
    }

    const storedValue = window.localStorage.getItem('liwu_admin_sidebar_open');
    return storedValue === null ? true : storedValue === '1';
  };

  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [internalActiveTab, setInternalActiveTab] = useState('overview');
  const [activeUserSection, setActiveUserSection] = useState('users');
  const [activeUserRoleView, setActiveUserRoleView] = useState('all');
  const [activeFortuneSection, setActiveFortuneSection] = useState('users');
  const [fortuneAdjustTarget, setFortuneAdjustTarget] = useState(null);
  const [fortuneAdjustType, setFortuneAdjustType] = useState('user');
  const [fortuneAdjustDelta, setFortuneAdjustDelta] = useState(100);
  const [fortuneAdjustNote, setFortuneAdjustNote] = useState('');
  const [fortuneRecordTargetFilter, setFortuneRecordTargetFilter] = useState('all');
  const [fortuneRecordActionFilter, setFortuneRecordActionFilter] = useState('all');
  const [fortuneRecordKeyword, setFortuneRecordKeyword] = useState('');
  const [fortuneUserKeyword, setFortuneUserKeyword] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(readInitialSidebarState);
  const lastLoadedAdminTabRef = useRef('');
  const activeTab = activeTabOverride ?? internalActiveTab;
  const setActiveTab = onActiveTabChange ?? setInternalActiveTab;
  
  const {
    users,
    tags,
    categories,
    overviewStats,
    pointLedgerEntries,
    meditationSettings,
    awarenessTagSettings,
    awarenessDisplaySettings,
    badgeSettings,
    themeSettings,
    brandCarouselSettings,
    userAvatarOptionsSettings,
    clientDistributionSettings,
    pageMastheadSettings,
    shopHomeLivingSettings,
    platformServiceFeeSettings,
    shopRewardSettings,
    systemFortuneSettings,
    shopPartnerPricingSettings,
    studentMembershipSettings,
    awarenessTagOverview,
    shopCategories,
    shopProducts,
    shopSkus,
    shopOrders,
    shopOrderItems,
    partnerOrders,
    partnerSubOrders,
    partnerUsers,
    partnerBrands,
    partnerBrandMembers,
    partnerBrandInvites,
    fortuneDebugState,
    settingsError,
    savingMeditationSettings,
    savingAwarenessTagSettings,
    savingAwarenessDisplaySettings,
    savingBadgeSettings,
    savingThemeSettings,
    savingBrandCarouselSettings,
    savingUserAvatarOptionsSettings,
    savingClientDistributionSettings,
    savingPageMastheadSettings,
    savingShopHomeLivingSettings,
    savingPlatformServiceFeeSettings,
    savingShopRewardSettings,
    savingSystemFortuneSettings,
    savingShopPartnerPricingSettings,
    savingStudentMembershipSettings,
    loading,
    error,
    updateUser,
    updateCategory,
    createCategory,
    updateTag,
    createTag,
    updateUserTags,
    updateMeditationSettings,
    updateAwarenessTagSettings,
    updateAwarenessDisplaySettings,
    updateBadgeSettings,
    updateThemeSettings,
    updateBrandCarouselSettings,
    updateUserAvatarOptionsSettings,
    updateClientDistributionSettings,
    updatePageMastheadSettings,
    updateShopHomeLivingSettings,
    updatePlatformServiceFeeSettings,
    updateShopRewardSettings,
    updateSystemFortuneSettings,
    updateShopPartnerPricingSettings,
    updatePartnerBrandCommunityBeansBalance,
    adjustUserBalanceWithSystemPool,
    adjustPartnerBrandCommunityBeansBalance,
    adjustSystemFortuneBalance,
    updateStudentMembershipSettings,
    updatePartnerSubOrderStatus,
    saveShopProduct,
    updateShopOrderStatus,
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
    loadAdminSection,
    refresh
  } = useDatabase();

  useEffect(() => {
    if (activeTab === 'overview') {
      lastLoadedAdminTabRef.current = activeTab;
      return;
    }

    if (lastLoadedAdminTabRef.current === activeTab) {
      return;
    }

    lastLoadedAdminTabRef.current = activeTab;
    void loadAdminSection(activeTab, { force: true }).catch((sectionError) => {
      console.error(`Failed to load admin section: ${activeTab}`, sectionError);
    });
  }, [activeTab, loadAdminSection]);

  const handleRefreshCloudbase = () => {
    window.location.reload();
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('liwu_admin_sidebar_open', sidebarOpen ? '1' : '0');
  }, [sidebarOpen]);

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setIsEditModalOpen(true);
  };

  const handleManageTags = (user) => {
    setSelectedUser(user);
    setIsTagManagerOpen(true);
  };

  const handleSaveUser = async (userId, userData) => {
    try {
      await updateUser(userId, userData);
    } catch (err) {
      console.error('Failed to save user:', err);
    }
  };

  const handleUpdateUserTags = async (userId, newTags) => {
    try {
      await updateUserTags(userId, newTags);
    } catch (err) {
      console.error('Failed to update user tags:', err);
    }
  };

  const handleUpdateCategories = async (categoryUpdate) => {
    try {
      if (categoryUpdate.id) {
        await updateCategory(categoryUpdate);
      } else {
        await createCategory(categoryUpdate);
      }
    } catch (err) {
      console.error('Failed to update category:', err);
    }
  };

  const handleUpdateTags = async (tagUpdate) => {
    try {
      if (tagUpdate.id) {
        await updateTag(tagUpdate);
      } else {
        await createTag(tagUpdate);
      }
    } catch (err) {
      console.error('Failed to update tag:', err);
    }
  };

  const handleSaveMeditationSettings = async (nextSettings) => {
    try {
      await updateMeditationSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update meditation settings:', err);
    }
  };

  const handleSaveAwarenessTagSettings = async (nextSettings) => {
    try {
      await updateAwarenessTagSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update awareness tag settings:', err);
    }
  };

  const handleSaveAwarenessDisplaySettings = async (nextSettings) => {
    try {
      await updateAwarenessDisplaySettings(nextSettings);
    } catch (err) {
      console.error('Failed to update awareness display settings:', err);
    }
  };

  const handleSaveBadgeSettings = async (nextSettings) => {
    try {
      await updateBadgeSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update badge settings:', err);
    }
  };

  const handleSaveThemeSettings = async (nextSettings) => {
    try {
      await updateThemeSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update theme settings:', err);
    }
  };

  const handleSaveBrandCarouselSettings = async (nextSettings) => {
    try {
      await updateBrandCarouselSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update brand carousel settings:', err);
    }
  };

  const handleSaveClientDistributionSettings = async (nextSettings) => {
    try {
      await updateClientDistributionSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update client distribution settings:', err);
    }
  };

  const handleSaveUserAvatarOptionsSettings = async (nextSettings) => {
    try {
      await updateUserAvatarOptionsSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update user avatar options settings:', err);
    }
  };

  const handleSaveStudentMembershipSettings = async (nextSettings) => {
    try {
      await updateStudentMembershipSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update student membership settings:', err);
    }
  };

  const handleSavePageMastheadSettings = async (nextSettings) => {
    try {
      await updatePageMastheadSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update page masthead settings:', err);
    }
  };

  const handleSaveShopProduct = async (productDraft) => {
    try {
      await saveShopProduct(productDraft);
    } catch (err) {
      console.error('Failed to save shop product:', err);
    }
  };

  const handleSaveShopHomeLivingSettings = async (settingsDraft) => {
    try {
      await updateShopHomeLivingSettings(settingsDraft);
    } catch (err) {
      console.error('Failed to save shop home living settings:', err);
    }
  };

  const handleSaveShopPartnerPricingSettings = async (settingsDraft) => {
    try {
      await updateShopPartnerPricingSettings(settingsDraft);
    } catch (err) {
      console.error('Failed to save shop partner pricing settings:', err);
    }
  };

  const handleSavePlatformServiceFeeSettings = async (settingsDraft) => {
    try {
      await updatePlatformServiceFeeSettings(settingsDraft);
    } catch (err) {
      console.error('Failed to save platform service fee settings:', err);
    }
  };

  const handleUpdateShopOrderStatus = async (orderId, nextStatus) => {
    try {
      await updateShopOrderStatus(orderId, nextStatus);
    } catch (err) {
      console.error('Failed to update shop order status:', err);
    }
  };

  const handleUpdatePartnerSubOrderStatus = async (subOrderId, nextStatus) => {
    try {
      await updatePartnerSubOrderStatus(subOrderId, nextStatus);
    } catch (err) {
      console.error('Failed to update partner sub order status:', err);
    }
  };

  const handleAdjustUserBeans = async (userId, delta) => {
    try {
      await adjustUserBalanceWithSystemPool(userId, delta, {
        description: delta > 0 ? '管理员发放用户福豆' : '管理员回收用户福豆'
      });
    } catch (err) {
      console.error('Failed to adjust user beans:', err);
    }
  };

  const handleAdjustBrandBeans = async (brandId, delta) => {
    try {
      await adjustPartnerBrandCommunityBeansBalance(brandId, delta, {
        description: delta > 0 ? '管理员发放品牌方福豆' : '管理员回收品牌方福豆'
      });
    } catch (err) {
      console.error('Failed to adjust brand beans:', err);
    }
  };

  const openFortuneAdjustModal = (type, target) => {
    setFortuneAdjustType(type);
    setFortuneAdjustTarget(target);
    setFortuneAdjustDelta(100);
    setFortuneAdjustNote('');
  };

  const handleSubmitFortuneAdjust = async () => {
    if (!fortuneAdjustTarget?.id || !fortuneAdjustDelta) {
      return;
    }

    try {
      if (fortuneAdjustType === 'user') {
        await adjustUserBalanceWithSystemPool(fortuneAdjustTarget.id, fortuneAdjustDelta, {
          description: fortuneAdjustNote || (fortuneAdjustDelta > 0 ? '管理员发放用户福豆' : '管理员回收用户福豆')
        });
      } else {
        await adjustPartnerBrandCommunityBeansBalance(fortuneAdjustTarget.id, fortuneAdjustDelta, {
          description: fortuneAdjustNote || (fortuneAdjustDelta > 0 ? '管理员发放品牌方福豆' : '管理员回收品牌方福豆')
        });
      }
      setFortuneAdjustTarget(null);
    } catch (err) {
      console.error('Failed to submit fortune adjustment:', err);
    }
  };

  const handleSaveSystemBeansBalance = async (nextBalance) => {
    try {
      const normalizedNextBalance = Math.max(0, Number(nextBalance) || 0);
      const totalSystemBeans = Math.max(0, Number(systemFortuneSettings.systemBeansBalance || 0));
      const delta = normalizedNextBalance - totalSystemBeans;
      if (!delta) {
        return;
      }

      await adjustSystemFortuneBalance(delta, {
        description: delta > 0 ? '管理员增加系统福豆池' : '管理员减少系统福豆池'
      });
    } catch (err) {
      console.error('Failed to save system beans balance:', err);
    }
  };

  const totalUsers = users.length;
  const totalAwarenessTags = awarenessTagOverview.length;
  const totalShopProducts = shopProducts.length;
  const totalShopOrders = shopOrders.length;
  const listedShopProducts = shopProducts.filter((product) => product.status === 'active').length;
  const totalBrandBeans = useMemo(
    () => partnerBrands.reduce((total, brand) => total + Math.max(0, Number(brand.communityBeansBalance || 0)), 0),
    [partnerBrands]
  );
  const agentUsers = useMemo(
    () => users.filter((user) => (user.tags || []).some((tag) => {
      const tagName = String(tag?.name || tag?.label || tag || '').trim();
      return tagName === '代理商';
    })),
    [users]
  );
  const otherFortuneUsers = useMemo(
    () => users.filter((user) => !agentUsers.some((agentUser) => agentUser.id === user.id)),
    [agentUsers, users]
  );
  const totalUserBeans = useMemo(
    () => users.reduce((total, user) => total + Math.max(0, Number(user.balance || 0)), 0),
    [users]
  );
  const totalAgentBeans = useMemo(
    () => agentUsers.reduce((total, user) => total + Math.max(0, Number(user.balance || 0)), 0),
    [agentUsers]
  );
  const totalSystemBeans = Math.max(0, Number(systemFortuneSettings.systemBeansBalance || 0));
  const totalPlatformBeans = totalSystemBeans + totalUserBeans + totalBrandBeans;
  const fortuneUsers = useMemo(
    () => [...otherFortuneUsers].sort((left, right) => Number(right.balance || 0) - Number(left.balance || 0)),
    [otherFortuneUsers]
  );
  const searchableFortuneUsers = useMemo(
    () => [...users].sort((left, right) => Number(right.balance || 0) - Number(left.balance || 0)),
    [users]
  );
  const filteredFortuneUsers = useMemo(() => {
    const normalizedKeyword = String(fortuneUserKeyword || '').trim().toLowerCase();
    const baseUsers = normalizedKeyword ? searchableFortuneUsers : fortuneUsers;
    if (!normalizedKeyword) {
      return fortuneUsers;
    }

    return baseUsers.filter((user) => (
      String(user.uid || '').includes(normalizedKeyword)
      || String(user.phone || '').toLowerCase().includes(normalizedKeyword)
      || String(user.name || '').toLowerCase().includes(normalizedKeyword)
    ));
  }, [fortuneUserKeyword, fortuneUsers, searchableFortuneUsers]);
  const fortuneAgents = useMemo(
    () => [...agentUsers].sort((left, right) => Number(right.balance || 0) - Number(left.balance || 0)),
    [agentUsers]
  );
  const fortuneBrands = useMemo(
    () => [...partnerBrands].sort((left, right) => Number(right.communityBeansBalance || 0) - Number(left.communityBeansBalance || 0)),
    [partnerBrands]
  );
  const totalRetailUserBeans = useMemo(
    () => otherFortuneUsers.reduce((total, user) => total + Math.max(0, Number(user.balance || 0)), 0),
    [otherFortuneUsers]
  );
  const averageUserBeans = fortuneUsers.length > 0 ? Math.round(totalRetailUserBeans / fortuneUsers.length) : 0;
  const averageAgentBeans = fortuneAgents.length > 0 ? Math.round(totalAgentBeans / fortuneAgents.length) : 0;
  const averageBrandBeans = fortuneBrands.length > 0 ? Math.round(totalBrandBeans / fortuneBrands.length) : 0;
  const recentFortuneAdjustments = useMemo(() => (
    [...pointLedgerEntries]
      .filter((entry) => ['admin_grant', 'admin_reclaim', 'admin_system_adjust', 'brand_daily_burn', 'agent_daily_burn'].includes(entry.biz_type || entry.bizType || ''))
      .sort((left, right) => new Date(right.created_at || right.createdAt || 0).getTime() - new Date(left.created_at || left.createdAt || 0).getTime())
      .slice(0, 20)
      .map((entry) => {
        const bizType = entry.biz_type || entry.bizType || '';
        const user = users.find((item) => item.id === (entry.user_id || entry.userId || '')) || null;
        const relatedBrand = partnerBrands.find((brand) => brand.id === (entry.biz_id || entry.bizId || '')) || null;
        const actionType = ['brand_daily_burn', 'agent_daily_burn'].includes(bizType)
          ? 'burn'
          : (Number(entry.delta || 0) >= 0 ? 'grant' : 'reclaim');
        const targetType = bizType === 'admin_system_adjust'
          ? '系统'
          : bizType === 'agent_daily_burn'
            ? '代理商'
          : user
            ? ((user.tags || []).some((tag) => String(tag?.name || tag?.label || tag || '').trim() === '代理商') ? '代理商' : '用户')
            : relatedBrand
              ? '品牌方'
              : '未知';
        return {
          id: entry._id || entry.id || `${entry.user_id || entry.userId || 'entry'}_${entry.created_at || entry.createdAt || ''}`,
          targetType,
          targetName: targetType === '系统' ? '系统福豆池' : user?.name || relatedBrand?.name || entry.description || '未识别对象',
          actionType,
          delta: Number(entry.delta || 0),
          description: entry.description || '管理员调账',
          createdAt: entry.created_at || entry.createdAt || ''
        };
      })
  ), [partnerBrands, pointLedgerEntries, users]);
  const filteredFortuneAdjustments = useMemo(() => (
    recentFortuneAdjustments.filter((entry) => {
      const matchesTarget = fortuneRecordTargetFilter === 'all' || entry.targetType === fortuneRecordTargetFilter;
      const matchesAction = fortuneRecordActionFilter === 'all'
        || (fortuneRecordActionFilter === 'grant' && entry.actionType === 'grant')
        || (fortuneRecordActionFilter === 'reclaim' && entry.actionType === 'reclaim')
        || (fortuneRecordActionFilter === 'burn' && entry.actionType === 'burn');
      const normalizedKeyword = String(fortuneRecordKeyword || '').trim().toLowerCase();
      const matchesKeyword = !normalizedKeyword
        || String(entry.targetName || '').toLowerCase().includes(normalizedKeyword)
        || String(entry.description || '').toLowerCase().includes(normalizedKeyword);
      return matchesTarget && matchesAction && matchesKeyword;
    })
  ), [fortuneRecordActionFilter, fortuneRecordKeyword, fortuneRecordTargetFilter, recentFortuneAdjustments]);
  const todayBurnReturnedToSystem = useMemo(() => {
    const todayDateKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    return [...pointLedgerEntries]
      .filter((entry) => ['brand_daily_burn', 'agent_daily_burn'].includes(entry.biz_type || entry.bizType || ''))
      .filter((entry) => {
        const createdAt = new Date(entry.created_at || entry.createdAt || 0);
        if (Number.isNaN(createdAt.getTime())) {
          return false;
        }

        const entryDateKey = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(createdAt);

        return entryDateKey === todayDateKey;
      })
      .reduce((total, entry) => total + Math.abs(Number(entry.delta || 0)), 0);
  }, [pointLedgerEntries]);
  const todayBrandBurnReturnedToSystem = useMemo(() => {
    const todayDateKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    return [...pointLedgerEntries]
      .filter((entry) => (entry.biz_type || entry.bizType || '') === 'brand_daily_burn')
      .filter((entry) => {
        const createdAt = new Date(entry.created_at || entry.createdAt || 0);
        if (Number.isNaN(createdAt.getTime())) {
          return false;
        }

        const entryDateKey = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(createdAt);

        return entryDateKey === todayDateKey;
      })
      .reduce((total, entry) => total + Math.abs(Number(entry.delta || 0)), 0);
  }, [pointLedgerEntries]);
  const todayAgentBurnReturnedToSystem = useMemo(() => {
    const todayDateKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    return [...pointLedgerEntries]
      .filter((entry) => (entry.biz_type || entry.bizType || '') === 'agent_daily_burn')
      .filter((entry) => {
        const createdAt = new Date(entry.created_at || entry.createdAt || 0);
        if (Number.isNaN(createdAt.getTime())) {
          return false;
        }

        const entryDateKey = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(createdAt);

        return entryDateKey === todayDateKey;
      })
      .reduce((total, entry) => total + Math.abs(Number(entry.delta || 0)), 0);
  }, [pointLedgerEntries]);

  const recentDateKeys = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const today = new Date();

    return Array.from({ length: 7 }, (_, index) => {
      const nextDate = new Date(today);
      nextDate.setDate(today.getDate() - (6 - index));
      return formatter.format(nextDate);
    });
  }, []);

  const userLoginSeries = useMemo(() => {
    const counterMap = new Map(recentDateKeys.map((dateKey) => [dateKey, 0]));
    users.forEach((user) => {
      const timestamp = new Date(user.lastActive || 0).getTime();
      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return;
      }

      const dateKey = recentDateKeys.find((key) => key === new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date(timestamp)));
      if (!dateKey) {
        return;
      }

      counterMap.set(dateKey, Number(counterMap.get(dateKey) || 0) + 1);
    });

    return recentDateKeys.map((dateKey) => ({
      label: dateKey.slice(5).replace('-', '/'),
      value: Number(counterMap.get(dateKey) || 0)
    }));
  }, [recentDateKeys, users]);

  const sevenDayLoggedInUsers = useMemo(
    () => userLoginSeries.reduce((total, item) => total + item.value, 0),
    [userLoginSeries]
  );

  const awarenessSeries = useMemo(
    () => (overviewStats.awarenessDailyCounts || []).map((item) => ({
      label: String(item.dateKey || '').slice(5).replace('-', '/'),
      value: Number(item.value || 0)
    })),
    [overviewStats.awarenessDailyCounts]
  );

  const meditationCountSeries = useMemo(
    () => (overviewStats.meditationDailyCounts || []).map((item) => ({
      label: String(item.dateKey || '').slice(5).replace('-', '/'),
      value: Number(item.value || 0)
    })),
    [overviewStats.meditationDailyCounts]
  );

  const meditationDurationSeries = useMemo(
    () => (overviewStats.meditationDailyDurationMinutes || []).map((item) => ({
      label: String(item.dateKey || '').slice(5).replace('-', '/'),
      value: Number(item.value || 0)
    })),
    [overviewStats.meditationDailyDurationMinutes]
  );

  const shopOrderSeries = useMemo(() => {
    const counterMap = new Map(recentDateKeys.map((dateKey) => [dateKey, 0]));
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    shopOrders.forEach((order) => {
      const timestamp = new Date(order.createdAt || 0).getTime();
      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return;
      }

      const dateKey = formatter.format(new Date(timestamp));
      if (!counterMap.has(dateKey)) {
        return;
      }

      counterMap.set(dateKey, Number(counterMap.get(dateKey) || 0) + 1);
    });

    return recentDateKeys.map((dateKey) => ({
      label: dateKey.slice(5).replace('-', '/'),
      value: Number(counterMap.get(dateKey) || 0)
    }));
  }, [recentDateKeys, shopOrders]);

  const NAV_ITEMS = [
    { key: 'overview', label: '总览' },
    { key: 'users',    label: '用户' },
    { key: 'shop',     label: '工坊' },
    { key: 'fortune',  label: '福豆' },
    { key: 'meditation', label: '冥想' },
    { key: 'awareness', label: '觉察' },
    { key: 'settings', label: '设置' },
  ];

  const handleNavClick = (key) => {
    setActiveTab(key);
  };

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      width: '100%',
      margin: 0,
      padding: 0,
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>
      {/* Sidebar */}
      {!embedded && (
      <div style={{
        width: sidebarOpen ? '240px' : '0px',
        minWidth: sidebarOpen ? '240px' : '0px',
        height: '100vh',
        position: 'sticky',
        top: 0,
        backgroundColor: '#fff',
        borderRight: sidebarOpen ? '1px solid #eee' : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.25s ease, min-width 0.25s ease',
        flexShrink: 0,
      }}>
        {/* Sidebar Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
          <h1 style={{ fontSize: '20px', margin: 0, color: '#333', whiteSpace: 'nowrap' }}>管理后台</h1>
          <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 8px 0', whiteSpace: 'nowrap' }}>
            社区运营与内容管理面板
          </p>
          <DatabaseStatus />
        </div>

        {/* Navigation Menu */}
        <nav style={{ flex: 1, padding: '12px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {NAV_ITEMS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleNavClick(key)}
                style={{
                  padding: '11px 16px',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: activeTab === key ? '#2196F3' : 'transparent',
                  color: activeTab === key ? '#fff' : '#555',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  textAlign: 'left',
                  transition: 'background-color 0.15s',
                  width: '100%',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div style={{ padding: '16px', borderTop: '1px solid #eee' }}>
          <button
            onClick={handleRefreshCloudbase}
            style={{
              width: '100%',
              padding: '8px 16px',
              border: '1px solid #2196F3',
              borderRadius: '8px',
              backgroundColor: '#fff',
              color: '#2196F3',
              cursor: 'pointer',
              fontSize: '12px',
              transition: 'all 0.2s ease',
            }}
          >
            刷新云端状态
          </button>
        </div>
      </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
        {/* Top bar */}
        {!embedded && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 30,
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '12px 20px',
          backgroundColor: '#fff',
          borderBottom: '1px solid #eee',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '6px 8px', borderRadius: '6px',
              display: 'flex', flexDirection: 'column', gap: '4px',
            }}
          >
            <span style={{ display: 'block', width: '18px', height: '2px', backgroundColor: '#555', borderRadius: '2px' }} />
            <span style={{ display: 'block', width: '18px', height: '2px', backgroundColor: '#555', borderRadius: '2px' }} />
            <span style={{ display: 'block', width: '18px', height: '2px', backgroundColor: '#555', borderRadius: '2px' }} />
          </button>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#333' }}>
            {NAV_ITEMS.find(n => n.key === activeTab)?.label ?? '管理后台'}
          </span>
        </div>
        )}

        <div style={{ flex: 1, padding: embedded ? '0' : '28px 24px', overflowY: embedded ? 'visible' : 'auto' }}>
        {/* Loading State */}
        {loading && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '200px',
            fontSize: '16px',
            color: '#666'
          }}>
            正在从 CloudBase 加载数据...
          </div>
        )}

        {/* Error State */}
        {error && (
          <div style={{ 
            backgroundColor: '#ffebee',
            color: '#c62828',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <strong>错误：</strong> {error}
            <button
              onClick={() => window.location.reload()}
              style={{
                marginLeft: '16px',
                padding: '4px 12px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: '#c62828',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              重试
            </button>
          </div>
        )}

        {/* Overview Tab */}
        {!loading && !error && activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '24px', marginBottom: '32px' }}>
            <OverviewCard title="用户">
              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px', alignItems: 'center' }}>
                <DonutMetric
                  primaryValue={sevenDayLoggedInUsers}
                  secondaryValue={Math.max(0, totalUsers - sevenDayLoggedInUsers)}
                  primaryLabel="七日内登录用户"
                  secondaryLabel="总用户数"
                  primaryColor="#2563eb"
                  secondaryColor="#dbeafe"
                  centerLabel={`${sevenDayLoggedInUsers}/${totalUsers}`}
                />
                <LineMetric
                  title="每日登录用户数"
                  series={userLoginSeries}
                  color="#2563eb"
                />
              </div>
            </OverviewCard>

            <OverviewCard title="觉察">
              <div style={{ display: 'grid', gap: '20px' }}>
                <div>
                  <div style={metricKickerStyle}>觉察标签总数</div>
                  <div style={metricBigValueStyle}>{totalAwarenessTags}</div>
                </div>
                <LineMetric
                  title="每日标记觉察数"
                  series={awarenessSeries}
                  color="#0f766e"
                />
              </div>
            </OverviewCard>

            <OverviewCard title="工坊">
              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px', alignItems: 'center' }}>
                <DonutMetric
                  primaryValue={listedShopProducts}
                  secondaryValue={Math.max(0, totalShopProducts - listedShopProducts)}
                  primaryLabel="商品上架数"
                  secondaryLabel="商品总数"
                  primaryColor="#b45309"
                  secondaryColor="#fde7d2"
                  centerLabel={`${listedShopProducts}/${totalShopProducts}`}
                />
                <LineMetric
                  title="每日订单数量"
                  series={shopOrderSeries}
                  color="#b45309"
                />
              </div>
            </OverviewCard>

            <OverviewCard title="冥想">
              <div style={{ display: 'grid', gap: '20px' }}>
                <MultiLineMetric
                  title="每日冥想播放次数 / 每日冥想播放时长"
                  seriesList={[
                    {
                      key: 'count',
                      label: '播放次数',
                      color: '#6b8e23',
                      series: meditationCountSeries
                    },
                    {
                      key: 'duration',
                      label: '播放时长',
                      color: '#8f5fd7',
                      series: meditationDurationSeries
                    }
                  ]}
                />
              </div>
            </OverviewCard>
          </div>
        )}

        {/* Users Tab */}
        {!loading && !error && activeTab === 'users' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { key: 'users', label: '用户列表' },
                { key: 'studentUsers', label: '学员用户' },
                { key: 'tagManagement', label: '标签管理' },
                { key: 'tagStatistics', label: '标签统计' }
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveUserSection(item.key)}
                  style={{
                    border: 'none',
                    borderRadius: '999px',
                    backgroundColor: activeUserSection === item.key ? '#111827' : '#fff',
                    color: activeUserSection === item.key ? '#fff' : '#334155',
                    boxShadow: 'var(--shadow-sm)',
                    padding: '10px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {item.label}
                </button>
                ))}
            </div>

            {activeUserSection === 'users' && (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {[
                  { key: 'all', label: '全部' },
                  { key: 'agent', label: '代理商' },
                  { key: 'brand', label: '品牌方' },
                  { key: 'admin', label: '管理员' }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveUserRoleView(item.key)}
                    style={{
                      border: 'none',
                      borderRadius: '999px',
                      backgroundColor: activeUserRoleView === item.key ? '#111827' : '#fff',
                      color: activeUserRoleView === item.key ? '#fff' : '#334155',
                      boxShadow: 'var(--shadow-sm)',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}

            {activeUserSection === 'users' && (
              <UserList 
                users={users}
                roleView={activeUserRoleView}
                onEditUser={handleEditUser}
                onManageTags={handleManageTags}
              />
            )}

            {activeUserSection === 'studentUsers' && (
              <StudentMembershipSettings
                settings={studentMembershipSettings}
                users={users}
                saving={savingStudentMembershipSettings}
                error={settingsError}
                onSave={handleSaveStudentMembershipSettings}
              />
            )}

            {activeUserSection === 'tagManagement' && (
              <TagManagement
                users={users}
                tagCategories={categories}
                tags={tags}
                onUpdateCategories={handleUpdateCategories}
                onUpdateTags={handleUpdateTags}
              />
            )}

            {activeUserSection === 'tagStatistics' && (
              <TagStatistics 
                users={users} 
                tagCategories={categories}
              />
            )}
          </div>
        )}

        {!loading && !error && activeTab === 'shop' && (
          <ShopManagement
            categories={shopCategories}
            products={shopProducts}
            skus={shopSkus}
            orders={shopOrders}
            orderItems={shopOrderItems}
            partnerOrders={partnerOrders}
            partnerSubOrders={partnerSubOrders}
            partnerUsers={partnerUsers}
            partnerBrands={partnerBrands}
            partnerBrandMembers={partnerBrandMembers}
            partnerBrandInvites={partnerBrandInvites}
            shopHomeLivingSettings={shopHomeLivingSettings}
            savingShopHomeLivingSettings={savingShopHomeLivingSettings}
            onSaveProduct={handleSaveShopProduct}
            onSaveShopHomeLivingSettings={handleSaveShopHomeLivingSettings}
            onUpdateOrderStatus={handleUpdateShopOrderStatus}
            onUpdatePartnerSubOrderStatus={handleUpdatePartnerSubOrderStatus}
            onUpdatePartnerBrandCommunityBeansBalance={updatePartnerBrandCommunityBeansBalance}
          />
        )}

        {!loading && !error && activeTab === 'fortune' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div
              style={{
                borderRadius: '14px',
                backgroundColor: '#fff7ed',
                border: '1px solid #fdba74',
                padding: '14px 16px',
                display: 'grid',
                gap: '6px'
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#9a3412', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                福豆页调试
              </div>
              <div style={{ fontSize: '13px', color: '#9a3412', lineHeight: 1.7 }}>
                users={users.length} · agents={agentUsers.length} · brands={partnerBrands.length} · pointLedger={pointLedgerEntries.length}
              </div>
              <div style={{ fontSize: '13px', color: '#9a3412', lineHeight: 1.7 }}>
                totalSystemBeans={totalSystemBeans} · totalUserBeans={totalUserBeans} · totalAgentBeans={totalAgentBeans} · totalBrandBeans={totalBrandBeans}
              </div>
              <div style={{ fontSize: '13px', color: '#9a3412', lineHeight: 1.7 }}>
                systemFortune={fortuneDebugState.systemFortune} · rawUsers={fortuneDebugState.rawUsers} · partnerUsers={fortuneDebugState.partnerUsers} · pointLedgerQuery={fortuneDebugState.pointLedger} · partnerBrandsQuery={fortuneDebugState.partnerBrands}
              </div>
              <div style={{ fontSize: '13px', color: '#9a3412', lineHeight: 1.7 }}>
                rawUsersQueryCount={fortuneDebugState.rawUsersCount} · partnerUsersQueryCount={fortuneDebugState.partnerUsersCount} · pointLedgerQueryCount={fortuneDebugState.pointLedgerCount} · partnerBrandsQueryCount={fortuneDebugState.partnerBrandsCount}
              </div>
              {(fortuneDebugState.systemFortuneError || fortuneDebugState.rawUsersError || fortuneDebugState.partnerUsersError || fortuneDebugState.pointLedgerError || fortuneDebugState.partnerBrandsError) && (
                <div style={{ fontSize: '12px', color: '#9a3412', lineHeight: 1.7 }}>
                  {[
                    fortuneDebugState.systemFortuneError ? `systemFortuneError=${fortuneDebugState.systemFortuneError}` : '',
                    fortuneDebugState.rawUsersError ? `rawUsersError=${fortuneDebugState.rawUsersError}` : '',
                    fortuneDebugState.partnerUsersError ? `partnerUsersError=${fortuneDebugState.partnerUsersError}` : '',
                    fortuneDebugState.pointLedgerError ? `pointLedgerError=${fortuneDebugState.pointLedgerError}` : '',
                    fortuneDebugState.partnerBrandsError ? `partnerBrandsError=${fortuneDebugState.partnerBrandsError}` : ''
                  ].filter(Boolean).join(' ｜ ')}
                </div>
              )}
              <div style={{ fontSize: '13px', color: '#9a3412', lineHeight: 1.7 }}>
                activeTab={activeTab}
              </div>
            </div>
            <OverviewCard title="福豆">
              <div style={{ display: 'grid', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'center' }}>
                  <div>
                    <div style={metricKickerStyle}>全平台福豆总数</div>
                    <div style={metricBigValueStyle}>{totalPlatformBeans}</div>
                    <div style={{ marginTop: '10px', fontSize: '14px', color: '#64748b', lineHeight: 1.7 }}>
                      由系统福豆数量、用户福豆总量、品牌方福豆总量三部分组成；其中用户侧额外拆出代理商账户视图，便于观察对账发豆与每日燃烧是否平衡。管理员向用户或品牌方分配福豆时，系统福豆池会同步减少；回收时同步增加。品牌方与代理商每日燃烧掉的福豆，也会按同量自动回流到系统福豆池。
                    </div>
                  </div>
                  <TernaryMetric
                    systemValue={totalSystemBeans}
                    userValue={totalUserBeans}
                    brandValue={totalBrandBeans}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
                  <div style={{ borderRadius: '16px', backgroundColor: '#f8fafc', padding: '18px' }}>
                    <div style={metricKickerStyle}>系统福豆数量</div>
                    <div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 700, color: '#111827' }}>{totalSystemBeans}</div>
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                      用户/品牌方燃烧消耗的福豆会自动回流到这里。
                    </div>
                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="number"
                        min="0"
                        defaultValue={totalSystemBeans}
                        onBlur={(event) => { void handleSaveSystemBeansBalance(event.target.value); }}
                        style={{ width: '140px', padding: '8px 10px', borderRadius: '10px', border: '1px solid #dbe4ee', fontSize: '13px' }}
                      />
                      <span style={{ fontSize: '12px', color: '#64748b' }}>失焦后保存</span>
                    </div>
                  </div>
                  <div style={{ borderRadius: '16px', backgroundColor: '#f8fafc', padding: '18px' }}>
                    <div style={metricKickerStyle}>用户福豆总量</div>
                    <div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 700, color: '#111827' }}>{totalUserBeans}</div>
                  </div>
                  <div style={{ borderRadius: '16px', backgroundColor: '#f8fafc', padding: '18px' }}>
                    <div style={metricKickerStyle}>品牌方福豆总量</div>
                    <div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 700, color: '#111827' }}>{totalBrandBeans}</div>
                  </div>
                  <div style={{ borderRadius: '16px', backgroundColor: '#f8fafc', padding: '18px' }}>
                    <div style={metricKickerStyle}>今日燃烧回流</div>
                    <div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 700, color: '#111827' }}>{todayBurnReturnedToSystem}</div>
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                      品牌方回流 {todayBrandBurnReturnedToSystem}，代理商回流 {todayAgentBurnReturnedToSystem}。
                    </div>
                  </div>
                </div>
              </div>
            </OverviewCard>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { key: 'users', label: '用户' },
                { key: 'agents', label: '代理商' },
                { key: 'brands', label: '品牌方' }
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveFortuneSection(item.key)}
                  style={{
                    border: 'none',
                    borderRadius: '999px',
                    backgroundColor: activeFortuneSection === item.key ? '#111827' : '#fff',
                    color: activeFortuneSection === item.key ? '#fff' : '#334155',
                    boxShadow: 'var(--shadow-sm)',
                    padding: '10px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {activeFortuneSection === 'users' && (
              <OverviewCard title="用户福豆持有情况">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.7 }}>
                    可按 uid、手机号或用户名搜索，并直接对命中的用户做福豆增减。
                  </div>
                  <input
                    type="text"
                    value={fortuneUserKeyword}
                    onChange={(event) => setFortuneUserKeyword(event.target.value)}
                    placeholder="搜索 uid / 手机号 / 用户名"
                    style={{
                      minWidth: '260px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #dbe4ee',
                      fontSize: '13px'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
                  <div style={{ borderRadius: '16px', backgroundColor: '#f8fafc', padding: '18px' }}>
                    <div style={metricKickerStyle}>用户总数</div>
                    <div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 700, color: '#111827' }}>{filteredFortuneUsers.length}</div>
                  </div>
                  <div style={{ borderRadius: '16px', backgroundColor: '#f8fafc', padding: '18px' }}>
                    <div style={metricKickerStyle}>平均持有量</div>
                    <div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 700, color: '#111827' }}>
                      {filteredFortuneUsers.length > 0
                        ? Math.round(filteredFortuneUsers.reduce((total, user) => total + Math.max(0, Number(user.balance || 0)), 0) / filteredFortuneUsers.length)
                        : 0}
                    </div>
                  </div>
                  <div style={{ borderRadius: '16px', backgroundColor: '#f8fafc', padding: '18px' }}>
                    <div style={metricKickerStyle}>前十合计</div>
                    <div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 700, color: '#111827' }}>
                      {filteredFortuneUsers.slice(0, 10).reduce((total, user) => total + Number(user.balance || 0), 0)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '12px' }}>
                  {filteredFortuneUsers.slice(0, 20).map((user, index) => (
                    <div
                      key={user.id}
                      style={{
                        borderRadius: '14px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e5e7eb',
                        padding: '14px 16px',
                        display: 'grid',
                        gridTemplateColumns: '80px 1.2fr 0.8fr auto',
                        gap: '12px',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>TOP {index + 1}</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>{user.name || `uid=${user.uid || '未知'}`}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>{user.phone || '未绑定手机'}</div>
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>{Number(user.balance || 0)}</div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[100, -100].map((delta) => (
                          <button
                            key={`${user.id}_${delta}`}
                            type="button"
                            onClick={() => { void handleAdjustUserBeans(user.id, delta); }}
                            style={{
                              border: '1px solid #dbe4ee',
                              borderRadius: '10px',
                              backgroundColor: delta > 0 ? '#ecfdf3' : '#fff7ed',
                              color: delta > 0 ? '#166534' : '#9a3412',
                              padding: '8px 10px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {delta > 0 ? `+${delta}` : `${delta}`}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => openFortuneAdjustModal('user', user)}
                          style={{
                            border: '1px solid #dbe4ee',
                            borderRadius: '10px',
                            backgroundColor: '#fff',
                            color: '#334155',
                            padding: '8px 10px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          自定义
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </OverviewCard>
            )}

            {activeFortuneSection === 'agents' && (
              <OverviewCard title="代理商福豆持有情况">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
                  <div style={{ borderRadius: '16px', backgroundColor: '#f8fafc', padding: '18px' }}>
                    <div style={metricKickerStyle}>代理商数量</div>
                    <div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 700, color: '#111827' }}>{fortuneAgents.length}</div>
                  </div>
                  <div style={{ borderRadius: '16px', backgroundColor: '#f8fafc', padding: '18px' }}>
                    <div style={metricKickerStyle}>平均持有量</div>
                    <div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 700, color: '#111827' }}>{averageAgentBeans}</div>
                  </div>
                  <div style={{ borderRadius: '16px', backgroundColor: '#f8fafc', padding: '18px' }}>
                    <div style={metricKickerStyle}>前十合计</div>
                    <div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 700, color: '#111827' }}>
                      {fortuneAgents.slice(0, 10).reduce((total, user) => total + Number(user.balance || 0), 0)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '12px' }}>
                  {fortuneAgents.slice(0, 10).map((user, index) => (
                    <div
                      key={user.id}
                      style={{
                        borderRadius: '14px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e5e7eb',
                        padding: '14px 16px',
                        display: 'grid',
                        gridTemplateColumns: '80px 1.2fr 0.8fr auto',
                        gap: '12px',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>TOP {index + 1}</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>{user.name || `uid=${user.uid || '未知'}`}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>{user.phone || '未绑定手机'}</div>
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>{Number(user.balance || 0)}</div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[100, -100].map((delta) => (
                          <button
                            key={`${user.id}_${delta}`}
                            type="button"
                            onClick={() => { void handleAdjustUserBeans(user.id, delta); }}
                            style={{
                              border: '1px solid #dbe4ee',
                              borderRadius: '10px',
                              backgroundColor: delta > 0 ? '#ecfdf3' : '#fff7ed',
                              color: delta > 0 ? '#166534' : '#9a3412',
                              padding: '8px 10px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {delta > 0 ? `+${delta}` : `${delta}`}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => openFortuneAdjustModal('user', user)}
                          style={{
                            border: '1px solid #dbe4ee',
                            borderRadius: '10px',
                            backgroundColor: '#fff',
                            color: '#334155',
                            padding: '8px 10px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          自定义
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </OverviewCard>
            )}

            {activeFortuneSection === 'brands' && (
              <OverviewCard title="品牌方福豆持有情况">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
                  <div style={{ borderRadius: '16px', backgroundColor: '#f8fafc', padding: '18px' }}>
                    <div style={metricKickerStyle}>品牌方数量</div>
                    <div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 700, color: '#111827' }}>{fortuneBrands.length}</div>
                  </div>
                  <div style={{ borderRadius: '16px', backgroundColor: '#f8fafc', padding: '18px' }}>
                    <div style={metricKickerStyle}>平均持有量</div>
                    <div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 700, color: '#111827' }}>{averageBrandBeans}</div>
                  </div>
                  <div style={{ borderRadius: '16px', backgroundColor: '#f8fafc', padding: '18px' }}>
                    <div style={metricKickerStyle}>前十合计</div>
                    <div style={{ marginTop: '8px', fontSize: '30px', fontWeight: 700, color: '#111827' }}>
                      {fortuneBrands.slice(0, 10).reduce((total, brand) => total + Number(brand.communityBeansBalance || 0), 0)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '12px' }}>
                  {fortuneBrands.slice(0, 10).map((brand, index) => (
                    <div
                      key={brand.id}
                      style={{
                        borderRadius: '14px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e5e7eb',
                        padding: '14px 16px',
                        display: 'grid',
                        gridTemplateColumns: '80px 1.2fr 0.8fr auto',
                        gap: '12px',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>TOP {index + 1}</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>{brand.name || '未命名店铺'}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>{brand.slug || '未设置标识'}</div>
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>{Number(brand.communityBeansBalance || 0)}</div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[100, -100].map((delta) => (
                          <button
                            key={`${brand.id}_${delta}`}
                            type="button"
                            onClick={() => { void handleAdjustBrandBeans(brand.id, delta); }}
                            style={{
                              border: '1px solid #dbe4ee',
                              borderRadius: '10px',
                              backgroundColor: delta > 0 ? '#ecfdf3' : '#fff7ed',
                              color: delta > 0 ? '#166534' : '#9a3412',
                              padding: '8px 10px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {delta > 0 ? `+${delta}` : `${delta}`}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => openFortuneAdjustModal('brand', brand)}
                          style={{
                            border: '1px solid #dbe4ee',
                            borderRadius: '10px',
                            backgroundColor: '#fff',
                            color: '#334155',
                            padding: '8px 10px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          自定义
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </OverviewCard>
            )}

            <OverviewCard title="最近调账记录">
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                {[
                  { key: 'all', label: '全部对象' },
                  { key: '用户', label: '用户' },
                  { key: '代理商', label: '代理商' },
                  { key: '品牌方', label: '品牌方' },
                  { key: '系统', label: '系统' }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFortuneRecordTargetFilter(item.key)}
                    style={{
                      border: 'none',
                      borderRadius: '999px',
                      backgroundColor: fortuneRecordTargetFilter === item.key ? '#111827' : '#fff',
                      color: fortuneRecordTargetFilter === item.key ? '#fff' : '#334155',
                      boxShadow: 'var(--shadow-sm)',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {item.label}
                  </button>
                ))}
                {[
                  { key: 'all', label: '全部动作' },
                  { key: 'grant', label: '发放' },
                  { key: 'reclaim', label: '回收' },
                  { key: 'burn', label: '燃烧' }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFortuneRecordActionFilter(item.key)}
                    style={{
                      border: 'none',
                      borderRadius: '999px',
                      backgroundColor: fortuneRecordActionFilter === item.key ? '#111827' : '#fff',
                      color: fortuneRecordActionFilter === item.key ? '#fff' : '#334155',
                      boxShadow: 'var(--shadow-sm)',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {item.label}
                  </button>
                ))}
                <input
                  type="text"
                  value={fortuneRecordKeyword}
                  onChange={(event) => setFortuneRecordKeyword(event.target.value)}
                  placeholder="搜索对象或备注"
                  style={{
                    marginLeft: 'auto',
                    minWidth: '220px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #dbe4ee',
                    fontSize: '13px'
                  }}
                />
              </div>

              {filteredFortuneAdjustments.length === 0 ? (
                <div style={{ fontSize: '14px', color: '#94a3b8' }}>当前筛选条件下还没有调账记录。</div>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {filteredFortuneAdjustments.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        borderRadius: '14px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e5e7eb',
                        padding: '14px 16px',
                        display: 'grid',
                        gridTemplateColumns: '120px 1fr auto auto',
                        gap: '12px',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>{entry.targetType}</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>{entry.targetName}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>{entry.description}</div>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: entry.delta >= 0 ? '#166534' : '#9a3412' }}>
                        {entry.delta >= 0 ? `+${entry.delta}` : `${entry.delta}`}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {new Date(entry.createdAt || 0).toLocaleString('zh-CN', { hour12: false })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </OverviewCard>
          </div>
        )}

        {!loading && !error && activeTab === 'meditation' && (
          <MeditationPage
            meditationAudioLibrary={meditationAudioLibrary}
            meditationCompositionSettings={meditationCompositionSettings}
            meditationCalendar={meditationCalendar}
            meditationLibrary={meditationLibrary}
            savingMeditationAudioLibrary={savingMeditationAudioLibrary}
            savingMeditationCompositionSettings={savingMeditationCompositionSettings}
            savingMeditationCalendar={savingMeditationCalendar}
            savingMeditationLibrary={savingMeditationLibrary}
            updateMeditationAudioLibrary={updateMeditationAudioLibrary}
            updateMeditationCompositionSettings={updateMeditationCompositionSettings}
            updateMeditationCalendar={updateMeditationCalendar}
            updateMeditationLibrary={updateMeditationLibrary}
            settingsError={settingsError}
          />
        )}

        {!loading && !error && activeTab === 'settings' && (
          <ThemeSettings
            key={`${themeSettings.documentId || 'default'}-${themeSettings.theme}`}
            settings={themeSettings}
            awarenessDisplaySettings={awarenessDisplaySettings}
            brandCarouselSettings={brandCarouselSettings}
            userAvatarOptionsSettings={userAvatarOptionsSettings}
            clientDistributionSettings={clientDistributionSettings}
            pageMastheadSettings={pageMastheadSettings}
            meditationSettings={meditationSettings}
            badgeSettings={badgeSettings}
            platformServiceFeeSettings={platformServiceFeeSettings}
            shopRewardSettings={shopRewardSettings}
            shopPartnerPricingSettings={shopPartnerPricingSettings}
            error={settingsError}
            saving={savingThemeSettings}
            savingAwarenessDisplay={savingAwarenessDisplaySettings}
            savingCarousel={savingBrandCarouselSettings}
            savingAvatarOptions={savingUserAvatarOptionsSettings}
            savingClientDistribution={savingClientDistributionSettings}
            savingPageMasthead={savingPageMastheadSettings}
            savingMeditationSettings={savingMeditationSettings}
            savingBadgeSettings={savingBadgeSettings}
            savingPlatformServiceFee={savingPlatformServiceFeeSettings}
            savingShopRewardSettings={savingShopRewardSettings}
            savingShopPartnerPricing={savingShopPartnerPricingSettings}
            onSave={handleSaveThemeSettings}
            onSaveAwarenessDisplay={handleSaveAwarenessDisplaySettings}
            onSaveBrandCarousel={handleSaveBrandCarouselSettings}
            onSaveUserAvatarOptions={handleSaveUserAvatarOptionsSettings}
            onSaveClientDistribution={handleSaveClientDistributionSettings}
            onSavePageMasthead={handleSavePageMastheadSettings}
            onSaveMeditationSettings={handleSaveMeditationSettings}
            onSaveBadgeSettings={handleSaveBadgeSettings}
            onSavePlatformServiceFee={handleSavePlatformServiceFeeSettings}
            onSaveShopRewardSettings={updateShopRewardSettings}
            onSaveShopPartnerPricing={handleSaveShopPartnerPricingSettings}
          />
        )}

        {!loading && !error && activeTab === 'awareness' && (
          <AwarenessTagSettings
            key={awarenessTagSettings.documentId || 'default'}
            tags={awarenessTagOverview}
            settings={awarenessTagSettings}
            products={shopProducts}
            error={settingsError}
            saving={savingAwarenessTagSettings}
            onSave={handleSaveAwarenessTagSettings}
            onRefresh={refresh}
          />
        )}

        </div>
      </div>

      {/* Modals */}
      {isEditModalOpen && selectedUser && (
        <UserEditModal
          key={selectedUser.id}
          user={selectedUser}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleSaveUser}
        />
      )}

      {isTagManagerOpen && selectedUser && (
        <TagManager
          key={selectedUser.id}
          user={selectedUser}
          isOpen={isTagManagerOpen}
          onClose={() => setIsTagManagerOpen(false)}
          allTags={tags}
          tagCategories={categories}
          onUpdateUserTags={handleUpdateUserTags}
        />
      )}

      {fortuneAdjustTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 1200
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              backgroundColor: '#fff',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: '0 24px 80px rgba(15, 23, 42, 0.22)',
              display: 'grid',
              gap: '16px'
            }}
          >
            <div>
              <div style={metricKickerStyle}>{fortuneAdjustType === 'user' ? '用户调账' : '品牌方调账'}</div>
              <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700, color: '#111827' }}>
                {fortuneAdjustType === 'user'
                  ? (fortuneAdjustTarget.name || `uid=${fortuneAdjustTarget.uid || '未知'}`)
                  : (fortuneAdjustTarget.name || '未命名店铺')}
              </div>
            </div>

            <label style={{ display: 'grid', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>调整数量</span>
              <input
                type="number"
                value={fortuneAdjustDelta}
                onChange={(event) => setFortuneAdjustDelta(Number(event.target.value) || 0)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #dbe4ee', fontSize: '14px' }}
              />
            </label>

            <label style={{ display: 'grid', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>备注</span>
              <textarea
                value={fortuneAdjustNote}
                onChange={(event) => setFortuneAdjustNote(event.target.value)}
                rows={3}
                style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #dbe4ee', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setFortuneAdjustTarget(null)}
                style={{
                  border: '1px solid #dbe4ee',
                  borderRadius: '10px',
                  backgroundColor: '#fff',
                  color: '#334155',
                  padding: '10px 14px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => { void handleSubmitFortuneAdjust(); }}
                style={{
                  border: 'none',
                  borderRadius: '10px',
                  backgroundColor: '#111827',
                  color: '#fff',
                  padding: '10px 14px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                确认调账
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const OverviewCard = ({ title, children }) => (
  <section
    style={{
      backgroundColor: '#fff',
      padding: '28px',
      borderRadius: '20px',
      boxShadow: 'var(--shadow-sm)',
      display: 'grid',
      gap: '20px'
    }}
  >
    <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>{title}</div>
    {children}
  </section>
);

const DonutMetric = ({
  primaryValue,
  secondaryValue,
  primaryLabel,
  secondaryLabel,
  primaryColor,
  secondaryColor,
  centerLabel
}) => {
  const totalValue = Math.max(1, Number(primaryValue || 0) + Number(secondaryValue || 0));
  const ratio = Math.max(0, Math.min(1, Number(primaryValue || 0) / totalValue));
  const angle = Math.round(ratio * 360);

  return (
    <div style={{ display: 'grid', gap: '16px', justifyItems: 'center' }}>
      <div
        style={{
          width: '164px',
          height: '164px',
          borderRadius: '50%',
          background: `conic-gradient(${primaryColor} 0deg ${angle}deg, ${secondaryColor} ${angle}deg 360deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}
      >
        <div
          style={{
            width: '106px',
            height: '106px',
            borderRadius: '50%',
            backgroundColor: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '8px',
            boxSizing: 'border-box',
            fontSize: '18px',
            fontWeight: 700,
            color: '#111827',
            lineHeight: 1.3
          }}
        >
          {centerLabel}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '8px', width: '100%' }}>
        <LegendItem color={primaryColor} label={primaryLabel} value={primaryValue} />
        <LegendItem color={secondaryColor} label={secondaryLabel} value={secondaryValue} />
      </div>
    </div>
  );
};

const TernaryMetric = ({ systemValue = 0, userValue = 0, brandValue = 0 }) => {
  const totalValue = Math.max(1, Number(systemValue || 0) + Number(userValue || 0) + Number(brandValue || 0));
  const systemRatio = Number(systemValue || 0) / totalValue;
  const userRatio = Number(userValue || 0) / totalValue;
  const brandRatio = Number(brandValue || 0) / totalValue;

  const vertexSystem = { x: 50, y: 8 };
  const vertexUser = { x: 10, y: 92 };
  const vertexBrand = { x: 90, y: 92 };

  const pointX = (systemRatio * vertexSystem.x) + (userRatio * vertexUser.x) + (brandRatio * vertexBrand.x);
  const pointY = (systemRatio * vertexSystem.y) + (userRatio * vertexUser.y) + (brandRatio * vertexBrand.y);

  return (
    <div style={{ display: 'grid', gap: '16px', justifyItems: 'center' }}>
      <div style={{ width: '220px', height: '190px', position: 'relative' }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
          <polygon points="50,8 10,92 90,92" fill="#f8fafc" stroke="#dbe4ee" strokeWidth="1.5" />
          <line x1="50" y1="8" x2="50" y2="92" stroke="#e2e8f0" strokeDasharray="2 2" />
          <line x1="10" y1="92" x2="70" y2="50" stroke="#e2e8f0" strokeDasharray="2 2" />
          <line x1="90" y1="92" x2="30" y2="50" stroke="#e2e8f0" strokeDasharray="2 2" />
          <circle cx={pointX} cy={pointY} r="4.5" fill="#111827" />
          <text x="50" y="5" textAnchor="middle" fontSize="6" fill="#7c3aed" fontWeight="700">系统</text>
          <text x="8" y="98" textAnchor="start" fontSize="6" fill="#2563eb" fontWeight="700">用户</text>
          <text x="92" y="98" textAnchor="end" fontSize="6" fill="#b45309" fontWeight="700">品牌方</text>
        </svg>
      </div>

      <div style={{ display: 'grid', gap: '8px', width: '100%' }}>
        <LegendItem color="#7c3aed" label={`系统 ${Math.round(systemRatio * 100)}%`} value={systemValue} />
        <LegendItem color="#2563eb" label={`用户 ${Math.round(userRatio * 100)}%`} value={userValue} />
        <LegendItem color="#b45309" label={`品牌方 ${Math.round(brandRatio * 100)}%`} value={brandValue} />
      </div>
    </div>
  );
};

const LegendItem = ({ color, label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', fontSize: '13px', color: '#475569' }}>
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <span style={{ width: '10px', height: '10px', borderRadius: '999px', backgroundColor: color, flexShrink: 0 }} />
      <span>{label}</span>
    </div>
    <strong style={{ fontSize: '14px', color: '#111827' }}>{value}</strong>
  </div>
);

const LineMetric = ({ title, series, color, suffix = '' }) => {
  const safeSeries = Array.isArray(series) && series.length > 0
    ? series
    : Array.from({ length: 7 }, (_, index) => ({ label: `${index + 1}`, value: 0 }));
  const maxValue = Math.max(...safeSeries.map((item) => Number(item.value || 0)), 1);
  const points = safeSeries.map((item, index) => {
    const x = safeSeries.length === 1 ? 0 : (index / (safeSeries.length - 1)) * 100;
    const y = 100 - ((Number(item.value || 0) / maxValue) * 100);
    return `${x},${y}`;
  }).join(' ');
  const latestValue = Number(safeSeries[safeSeries.length - 1]?.value || 0);

  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{title}</div>
        <div style={{ fontSize: '13px', color: '#64748b' }}>
          最新 {latestValue}{suffix}
        </div>
      </div>

      <div style={{ position: 'relative', height: '144px', borderRadius: '16px', backgroundColor: '#f8fafc', padding: '14px 14px 28px', boxSizing: 'border-box' }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          {[25, 50, 75].map((line) => (
            <line key={line} x1="0" y1={line} x2="100" y2={line} stroke="#e2e8f0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div style={{ position: 'absolute', left: '14px', right: '14px', bottom: '10px', display: 'grid', gridTemplateColumns: `repeat(${safeSeries.length}, minmax(0, 1fr))`, gap: '8px' }}>
          {safeSeries.map((item) => (
            <div key={item.label} style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const MultiLineMetric = ({ title, seriesList = [] }) => {
  const normalizedSeriesList = seriesList.filter((item) => Array.isArray(item.series) && item.series.length > 0);
  const fallbackSeries = Array.from({ length: 7 }, (_, index) => ({ label: `${index + 1}`, value: 0 }));
  const baseSeries = normalizedSeriesList[0]?.series || fallbackSeries;
  const maxValue = Math.max(
    1,
    ...normalizedSeriesList.flatMap((item) => item.series.map((point) => Number(point.value || 0)))
  );

  const buildPoints = (series) => series.map((item, index) => {
    const x = series.length === 1 ? 0 : (index / (series.length - 1)) * 100;
    const y = 100 - ((Number(item.value || 0) / maxValue) * 100);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{title}</div>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          {normalizedSeriesList.map((item) => (
            <div key={item.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '999px', backgroundColor: item.color }} />
              <span>{item.label}</span>
              <strong style={{ color: '#111827' }}>{Number(item.series[item.series.length - 1]?.value || 0)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', height: '160px', borderRadius: '16px', backgroundColor: '#f8fafc', padding: '14px 14px 28px', boxSizing: 'border-box' }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          {[25, 50, 75].map((line) => (
            <line key={line} x1="0" y1={line} x2="100" y2={line} stroke="#e2e8f0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {normalizedSeriesList.map((item) => (
            <polyline
              key={item.key}
              fill="none"
              stroke={item.color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={buildPoints(item.series)}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div style={{ position: 'absolute', left: '14px', right: '14px', bottom: '10px', display: 'grid', gridTemplateColumns: `repeat(${baseSeries.length}, minmax(0, 1fr))`, gap: '8px' }}>
          {baseSeries.map((item) => (
            <div key={item.label} style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const metricKickerStyle = {
  fontSize: '12px',
  fontWeight: 700,
  color: '#94a3b8',
  letterSpacing: '0.08em',
  textTransform: 'uppercase'
};

const metricBigValueStyle = {
  marginTop: '8px',
  fontSize: '42px',
  fontWeight: 700,
  color: '#111827',
  lineHeight: 1
};
