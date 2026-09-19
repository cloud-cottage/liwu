// temp test for vite env/define
export const devFlag = import.meta.env.DEV;
export const devProxyFlag = typeof __DEV_PROXY__ !== 'undefined';
export const devProxyRaw = __DEV_PROXY__;
