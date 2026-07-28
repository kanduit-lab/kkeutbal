export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export type CardKind = 'gwang' | 'yeol' | 'tti' | 'pi'

export type TtiKind = 'hong' | 'cheong' | 'cho' | null

export interface HwatuCard {
  readonly id: string
  readonly month: Month
  readonly kind: CardKind
  readonly tti: TtiKind

  readonly piValue: 0 | 1 | 2

  readonly isGodori: boolean

  readonly seotda: boolean

  readonly label: string
}

export type CardId = HwatuCard['id']

export type GameType = 'seotda' | 'gostop'