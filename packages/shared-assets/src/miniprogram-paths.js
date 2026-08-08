export const miniProgramSharedAssetBase = '/assets/shared'

export const tabbarIconKeys = {
  home: 'tabbar/home.svg',
  meditate: 'tabbar/meditate.svg',
  shop: 'tabbar/shop.svg',
  aware: 'tabbar/aware.svg',
  profile: 'tabbar/profile.svg'
}

export const tabbarActiveIconKeys = {
  home: 'tabbar/home_b.svg',
  meditate: 'tabbar/meditate_b.svg',
  shop: 'tabbar/shop_b.svg',
  aware: 'tabbar/aware_b.svg',
  profile: 'tabbar/profile_b.svg'
}

export const commerceIconKeys = {
  cart: 'commerce/cart.svg',
  fortuneBean: 'commerce/fortune-bean.svg'
}

export const profileIconKeys = {
  address: 'profile/address.svg'
}

export const brandAssetKeys = {
  logoLiwu: 'logo-liwu.svg',
  logoLiwu1024: 'logo-liwu-1024.png'
}

export const illustrationAssetKeys = {
  carousel1: 'illustrations/carousel/carousel-1.svg',
  carousel2: 'illustrations/carousel/carousel-2.svg',
  carousel3: 'illustrations/carousel/carousel-3.svg',
  carousel4: 'illustrations/carousel/carousel-4.svg',
  badgeDawnGuardian: 'illustrations/badges/dawn-guardian.svg',
  badgeBuilderPlaceholder: 'illustrations/badges/builder-placeholder.svg',
  badgeGrowthPlaceholder: 'illustrations/badges/growth-placeholder.svg',
  shopLiving1: 'illustrations/shop-living/living-1.svg',
  shopLiving2: 'illustrations/shop-living/living-2.svg',
  shopLiving3: 'illustrations/shop-living/living-3.svg',
  shopLiving4: 'illustrations/shop-living/living-4.svg',
  shopLiving5: 'illustrations/shop-living/living-5.svg',
  shopLiving6: 'illustrations/shop-living/living-6.svg'
}

export const sharedIconKeys = {
  home: tabbarIconKeys.home,
  meditate: tabbarIconKeys.meditate,
  shop: tabbarIconKeys.shop,
  aware: tabbarIconKeys.aware,
  profile: tabbarIconKeys.profile,
  homeActive: tabbarActiveIconKeys.home,
  meditateActive: tabbarActiveIconKeys.meditate,
  shopActive: tabbarActiveIconKeys.shop,
  awareActive: tabbarActiveIconKeys.aware,
  profileActive: tabbarActiveIconKeys.profile,
  cart: commerceIconKeys.cart,
  fortuneBean: commerceIconKeys.fortuneBean,
  address: profileIconKeys.address
}

export const resolveMiniProgramIllustrationPath = (relativePath) => (
  `${miniProgramSharedAssetBase}/${relativePath}`
)

export const resolveMiniProgramTabbarIconPath = (tabKey, active = false) => {
  const relativePath = active
    ? tabbarActiveIconKeys[tabKey]
    : tabbarIconKeys[tabKey]

  if (!relativePath) {
    throw new Error(`Unknown tabbar icon key: ${tabKey}`)
  }

  return `${miniProgramSharedAssetBase}/icons/${relativePath}`
}

export const resolveMiniProgramBrandPath = (assetKey) => {
  const relativePath = brandAssetKeys[assetKey]
  if (!relativePath) {
    throw new Error(`Unknown shared brand asset key: ${assetKey}`)
  }

  return `${miniProgramSharedAssetBase}/brand/${relativePath}`
}

export const resolveMiniProgramIconPath = (iconKey) => {
  const relativePath = sharedIconKeys[iconKey]
  if (!relativePath) {
    throw new Error(`Unknown shared icon key: ${iconKey}`)
  }

  return `${miniProgramSharedAssetBase}/icons/${relativePath}`
}

export const resolveShopLivingIllustrationPath = (index) => {
  const assetKey = `shopLiving${index}`
  const relativePath = illustrationAssetKeys[assetKey]
  if (!relativePath) {
    throw new Error(`Unknown shop living illustration index: ${index}`)
  }

  return resolveMiniProgramIllustrationPath(relativePath)
}