'use server'

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { serverEnv } from '@/lib/env'
import { cardsOfMonth } from '@/features/hwatu/cards'
import type { CardId, GameType, Month } from '@/features/hwatu/types'
import { currentUserId } from '@/features/auth/session'

/**
 * 족보 vision 인식 — 사진 한 장에서 화투 카드를 식별해 CardId 목록으로 정규화한다.
 *
 * 인식은 보조다: 결과는 항상 피커에 프리필될 뿐, 최종 확정은 사람이 한다.
 * 모델 출력은 신뢰 경계 밖이므로 zod 로 전부 검증하고,
 * 스키마를 벗어나면 부분 반영 없이 실패를 돌려준다.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** 모델이 채우는 구조. 같은 피 2장은 사진으로 구분 불가하므로 (월, 종류)까지만 요구한다. */
const visionSchema = z.object({
  cards: z
    .array(
      z.object({
        month: z.number().int().min(1).max(12),
        kind: z.enum(['gwang', 'yeol', 'tti', 'pi']),
        /** 피일 때 쌍피 여부. 다른 종류면 무시. */
        ssangpi: z.boolean().optional(),
      }),
    )
    .max(12),
  confidence: z.number().min(0).max(1),
  note: z.string().max(200).optional(),
})

export interface VisionRecognition {
  readonly cardIds: readonly CardId[]
  readonly confidence: number
  readonly note: string | null
}

const inputSchema = z.object({
  /** data URL (data:image/jpeg;base64,...) — 클라이언트에서 1568px 이하로 리사이즈해 보낸다. */
  imageDataUrl: z.string().min(1),
  gameType: z.enum(['seotda', 'gostop']),
})

export async function recognizeHand(
  input: z.infer<typeof inputSchema>,
): Promise<ActionResult<VisionRecognition>> {
  const userId = await currentUserId()
  if (!userId) return fail('로그인이 필요합니다')

  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return fail('입력값이 올바르지 않습니다')

  const env = serverEnv()
  if (!env.JOKBO_VISION_ENABLED || !env.ANTHROPIC_API_KEY) {
    return fail('사진 인식이 비활성화되어 있습니다. 수동 선택을 사용하세요')
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(parsed.data.imageDataUrl)
  if (!match || !match[1] || !match[2]) return fail('지원하지 않는 이미지 형식입니다 (jpeg/png/webp)')
  const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/webp'
  const base64Data = match[2]
  if (base64Data.length * 0.75 > MAX_IMAGE_BYTES) return fail('이미지가 너무 큽니다 (5MB 이하)')

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const gameHint =
    parsed.data.gameType === 'seotda'
      ? '섯다 손패 사진이므로 카드는 보통 2장이고, 1~10월의 광/열끗/띠만 나온다 (피 없음).'
      : '고스톱 획득 패 사진이므로 카드가 여러 장일 수 있다.'

  try {
    const response = await client.messages.create({
      model: env.JOKBO_VISION_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            {
              type: 'text',
              text: `이 사진에 보이는 화투 카드를 식별해라. ${gameHint}
각 카드를 월(1~12)과 종류(gwang=광, yeol=열끗, tti=띠, pi=피)로 판정하고,
피가 쌍피(11월 오동 쌍피, 12월 비 쌍피)면 ssangpi=true 로 표시해라.
확신이 없는 카드는 포함하지 마라. 전체 확신도를 confidence(0~1)로 적어라.

다음 JSON 형식으로만 응답해라. 다른 텍스트 금지:
{"cards":[{"month":3,"kind":"gwang"}],"confidence":0.95,"note":"선택적 비고"}`,
            },
          ],
        },
      ],
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return fail('인식 결과를 받지 못했습니다')

    const jsonMatch = /\{[\s\S]*\}/.exec(textBlock.text)
    if (!jsonMatch) return fail('인식 결과 형식이 올바르지 않습니다')

    let raw: unknown
    try {
      raw = JSON.parse(jsonMatch[0])
    } catch {
      return fail('인식 결과 형식이 올바르지 않습니다')
    }

    const result = visionSchema.safeParse(raw)
    if (!result.success) return fail('인식 결과 형식이 올바르지 않습니다')

    const cardIds = toCardIds(result.data.cards, parsed.data.gameType)
    return ok({
      cardIds,
      confidence: result.data.confidence,
      note: result.data.note ?? null,
    })
  } catch (error) {
    console.error('vision recognition failed:', error)
    return fail('사진 인식에 실패했습니다. 수동 선택을 사용하세요')
  }
}

/** (월, 종류) 판정을 실제 카드 id 로 정규화한다. 같은 종류가 여럿이면 미사용 인스턴스를 배정한다. */
function toCardIds(
  detected: ReadonlyArray<{ month: number; kind: string; ssangpi?: boolean }>,
  gameType: GameType,
): CardId[] {
  const used = new Set<CardId>()
  const ids: CardId[] = []

  for (const item of detected) {
    const candidates = cardsOfMonth(item.month as Month).filter((card) => {
      if (card.kind !== item.kind) return false
      if (gameType === 'seotda' && !card.seotda) return false
      if (item.kind === 'pi' && item.ssangpi !== undefined) {
        return item.ssangpi ? card.piValue === 2 : card.piValue === 1
      }
      return true
    })
    const free = candidates.find((card) => !used.has(card.id))
    if (free) {
      used.add(free.id)
      ids.push(free.id)
    }
  }

  return ids
}
