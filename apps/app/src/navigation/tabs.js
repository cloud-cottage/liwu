import { Home, Sparkles, User, Wind } from 'lucide-react'
import { appRoutes } from './routes.js'

export const appPrimaryTabs = [
  {
    key: 'home',
    label: '首页',
    to: appRoutes.home,
    icon: Home
  },
  {
    key: 'meditate',
    label: '冥想',
    to: appRoutes.meditate,
    icon: Wind
  },
  {
    key: 'aware',
    label: '觉察',
    to: appRoutes.aware,
    icon: Sparkles
  },
  {
    key: 'profile',
    label: '我的',
    to: appRoutes.profile,
    icon: User
  }
]
