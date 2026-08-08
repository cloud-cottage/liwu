/** 原生产域名，预计停服约 3 个月（2026 年起） */
export const LEGACY_PRODUCTION_HOST = 'liwu.yunduojihua.com';

/** 停服期间的替代域名 */
export const TEMPORARY_PRODUCTION_HOSTS = [
  'liwu.nvshen.love',
  'liwu2026.vercel.app'
];

/** CloudBase 代理与本地 dev 转发的首选生产源站 */
export const PRIMARY_PRODUCTION_ORIGIN = 'https://liwu.nvshen.love';

const PRODUCTION_HOSTNAME_SET = new Set([
  ...TEMPORARY_PRODUCTION_HOSTS,
  LEGACY_PRODUCTION_HOST
]);

export const isProductionHostname = (hostname = '') => (
  PRODUCTION_HOSTNAME_SET.has(String(hostname || '').trim())
);