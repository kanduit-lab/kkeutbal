export type PromotionKind = 'banner' | 'popup'

export interface PromotionView {
  readonly id: string
  readonly kind: PromotionKind
  readonly title: string
  readonly body: string | null
  readonly linkUrl: string | null
  readonly linkLabel: string | null

  readonly dismissHours: number
}

export interface AdminPromotionView extends PromotionView {
  readonly isActive: boolean
  readonly startsAt: string | null
  readonly endsAt: string | null
  readonly priority: number
  readonly createdByName: string
  readonly createdAt: string

  readonly isLive: boolean
}