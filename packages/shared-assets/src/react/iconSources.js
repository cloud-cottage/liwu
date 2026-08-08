import { normalizeTintableSvg } from './normalizeTintableSvg.js'
import homeSvg from '../../icons/tabbar/home.svg?raw'
import homeActiveSvg from '../../icons/tabbar/home_b.svg?raw'
import meditateSvg from '../../icons/tabbar/meditate.svg?raw'
import meditateActiveSvg from '../../icons/tabbar/meditate_b.svg?raw'
import shopSvg from '../../icons/tabbar/shop.svg?raw'
import shopActiveSvg from '../../icons/tabbar/shop_b.svg?raw'
import awareSvg from '../../icons/tabbar/aware.svg?raw'
import awareActiveSvg from '../../icons/tabbar/aware_b.svg?raw'
import profileSvg from '../../icons/tabbar/profile.svg?raw'
import profileActiveSvg from '../../icons/tabbar/profile_b.svg?raw'
import cartSvg from '../../icons/commerce/cart.svg?raw'
import fortuneBeanSvg from '../../icons/commerce/fortune-bean.svg?raw'
import addressSvg from '../../icons/profile/address.svg?raw'

export const sharedIconSources = {
  home: normalizeTintableSvg(homeSvg),
  homeActive: normalizeTintableSvg(homeActiveSvg),
  meditate: normalizeTintableSvg(meditateSvg),
  meditateActive: normalizeTintableSvg(meditateActiveSvg),
  shop: normalizeTintableSvg(shopSvg),
  shopActive: normalizeTintableSvg(shopActiveSvg),
  aware: normalizeTintableSvg(awareSvg),
  awareActive: normalizeTintableSvg(awareActiveSvg),
  profile: normalizeTintableSvg(profileSvg),
  profileActive: normalizeTintableSvg(profileActiveSvg),
  cart: cartSvg,
  fortuneBean: fortuneBeanSvg,
  address: addressSvg
}