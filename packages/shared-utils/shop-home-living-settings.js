export const SHOP_HOME_LIVING_SETTINGS_KEY = 'shop_home_living_settings'

export const SHOP_HOME_LIVING_CARD_COUNT = 6

export const createDefaultShopHomeLivingCard = (index, resolveIllustrationPath = () => '') => ({
  id: `shop_living_${index + 1}`,
  fileId: '',
  imageUrl: resolveIllustrationPath(index + 1),
  productId: '',
  width: 700,
  height: 700
})

export const createDefaultShopHomeLivingCards = (resolveIllustrationPath = () => '') => (
  Array.from({ length: SHOP_HOME_LIVING_CARD_COUNT }, (_, index) => (
    createDefaultShopHomeLivingCard(index, resolveIllustrationPath)
  ))
)

export const DEFAULT_SHOP_HOME_LIVING_SETTINGS = {
  documentId: null,
  imageWidth: 700,
  imageHeight: 700,
  cards: Array.from({ length: SHOP_HOME_LIVING_CARD_COUNT }, (_, index) => ({
    id: `shop_living_${index + 1}`,
    fileId: '',
    imageUrl: '',
    productId: ''
  })),
  missingCollection: false
}

export const normalizeShopHomeLivingSettings = (document = {}, resolveIllustrationPath = () => '') => {
  const rawCards = Array.isArray(document.cards) ? document.cards : []
  const fallbackCards = createDefaultShopHomeLivingCards(resolveIllustrationPath)

  return {
    documentId: document._id || document.id || document.documentId || null,
    imageWidth: Number(document.image_width ?? document.imageWidth ?? 700),
    imageHeight: Number(document.image_height ?? document.imageHeight ?? 700),
    cards: fallbackCards.map((fallbackCard, index) => {
      const currentCard = rawCards[index] || {}
      return {
        id: currentCard.id || fallbackCard.id,
        fileId: currentCard.file_id || currentCard.fileId || '',
        imageUrl: currentCard.image_url || currentCard.imageUrl || fallbackCard.imageUrl || '',
        productId: currentCard.product_id || currentCard.productId || '',
        width: Number(currentCard.width ?? fallbackCard.width ?? 700),
        height: Number(currentCard.height ?? fallbackCard.height ?? 700)
      }
    }),
    missingCollection: false
  }
}

export const toShopHomeLivingSettingsPayload = (settingsData = {}) => ({
  key: SHOP_HOME_LIVING_SETTINGS_KEY,
  image_width: Number(settingsData.imageWidth || 700),
  image_height: Number(settingsData.imageHeight || 700),
  cards: (settingsData.cards || []).map((card, index) => ({
    id: card.id || `shop_living_${index + 1}`,
    file_id: card.fileId || '',
    image_url: card.imageUrl || '',
    product_id: card.productId || ''
  }))
})