export {
  tabbarIconKeys,
  tabbarActiveIconKeys,
  commerceIconKeys,
  profileIconKeys,
  brandAssetKeys,
  illustrationAssetKeys,
  miniProgramSharedAssetBase,
  sharedIconKeys,
  resolveMiniProgramIllustrationPath,
  resolveMiniProgramTabbarIconPath,
  resolveMiniProgramBrandPath,
  resolveMiniProgramIconPath,
  resolveShopLivingIllustrationPath
} from './miniprogram-paths.js'

export const resolveTabbarIconKey = (tabKey, active = false) => (
  active ? `${tabKey}Active` : tabKey
)