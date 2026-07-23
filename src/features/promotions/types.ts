export type PromotionKind = 'banner' | 'popup'

/** 방문자에게 실제로 렌더되는 최소 필드. 운영 메타데이터는 담지 않는다. */
export interface PromotionView {
  readonly id: string
  readonly kind: PromotionKind
  readonly title: string
  readonly body: string | null
  readonly linkUrl: string | null
  readonly linkLabel: string | null
  /** "N시간 동안 보지 않기" 의 N. */
  readonly dismissHours: number
}

/** 관리자 목록용 — 노출 창·우선순위 등 운영 정보를 포함한다. */
export interface AdminPromotionView extends PromotionView {
  readonly isActive: boolean
  readonly startsAt: string | null
  readonly endsAt: string | null
  readonly priority: number
  readonly createdByName: string
  readonly createdAt: string
  /** 지금 이 순간 노출 조건을 모두 만족하는지. */
  readonly isLive: boolean
}
