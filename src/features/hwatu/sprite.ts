import type { CardId } from './types'

export const SHEET_URL = '/cards/hwatu-sheet.webp'
export const SHEET_W = 1326
export const SHEET_H = 732
export const CELL_W = 103.2
export const CELL_H = 168.2

const COL_X = [
  0, 108.5, 217.8, 326.3, 447.2, 555.7, 664.9, 773.5, 895.7, 1004.2, 1113.4, 1222,
] as const
const ROW_Y = [0, 186.3, 373.8, 563.5] as const

const BLOCK_CARDS: readonly (readonly [CardId, CardId, CardId, CardId])[] = [
  ['01-gwang', '01-pi-1', '01-tti', '01-pi-2'],
  ['02-yeol', '02-pi-1', '02-tti', '02-pi-2'],
  ['03-gwang', '03-pi-1', '03-tti', '03-pi-2'],
  ['04-yeol', '04-pi-1', '04-tti', '04-pi-2'],
  ['05-yeol', '05-pi-1', '05-tti', '05-pi-2'],
  ['06-yeol', '06-pi-1', '06-tti', '06-pi-2'],
  ['07-yeol', '07-pi-1', '07-tti', '07-pi-2'],
  ['08-gwang', '08-pi-1', '08-yeol', '08-pi-2'],
  ['09-yeol', '09-pi-1', '09-tti', '09-pi-2'],
  ['10-yeol', '10-pi-1', '10-tti', '10-pi-2'],
  ['12-gwang', '12-yeol', '12-tti', '12-pi'],
  ['11-gwang', '11-pi-2', '11-pi-1', '11-pi-3'],
]

function buildSpriteMap(): ReadonlyMap<CardId, { x: number; y: number }> {
  const map = new Map<CardId, { x: number; y: number }>()
  BLOCK_CARDS.forEach((cards, sb) => {
    const row = Math.floor(sb / 3)
    const group = sb % 3
    cards.forEach((cardId, pos) => {
      map.set(cardId, { x: COL_X[group * 4 + pos]!, y: ROW_Y[row]! })
    })
  })
  return map
}

const SPRITE_MAP = buildSpriteMap()

export function spriteOf(cardId: CardId): { x: number; y: number } | null {
  return SPRITE_MAP.get(cardId) ?? null
}