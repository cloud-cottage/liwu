import { appRoutes } from './routes.js'

export const appPrimaryTabs = [
  {
    key: 'home',
    label: '首页',
    to: appRoutes.home,
    icon: 'home'
  },
  {
    key: 'meditate',
    label: '冥想',
    to: appRoutes.meditate,
    icon: 'meditate'
  },
  {
    key: 'aware',
    label: '觉察',
    to: appRoutes.aware,
    icon: 'aware'
  },
  {
    key: 'profile',
    label: '我的',
    to: appRoutes.profile,
    icon: 'profile'
  }
]
