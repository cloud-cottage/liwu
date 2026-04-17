export interface AwarenessTag {
  key: string
  content: string
  accessType: 'public' | 'student'
}

export interface UserProfileSummary {
  id: string
  name: string
}

export interface ShopCategory {
  id: string
  name: string
  slug: string
  status: 'active' | 'hidden'
}

export interface ShopProduct {
  id: string
  name: string
  categoryId: string
  productType: 'physical' | 'digital' | 'service'
  pricePointsFrom: number
  priceCashFrom: number
  stockTotal: number
  status: 'draft' | 'active' | 'archived' | 'sold_out'
}

export interface ShopSku {
  id: string
  productId: string
  skuName: string
  pricePoints: number
  priceCash: number
  stock: number
}

export interface ShopOrder {
  id: string
  userId: string
  orderNo: string
  status: 'pending_payment' | 'paid' | 'processing' | 'shipped' | 'completed' | 'cancelled' | 'refunded'
  totalPoints: number
  totalCash: number
}

export interface PointLedgerEntry {
  id: string
  userId: string
  delta: number
  bizType: string
  description: string
}
