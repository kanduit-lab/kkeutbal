'use server'

import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { consumeRateLimits } from '@/lib/rate-limit'
import { cardsOfMonth } from '@/features/hwatu/cards'
import type { CardId, GameType, Month } from '@/features/hwatu/types'
import { currentUserId } from '@/features/auth/session'
import { getActiveVisionSettings } from './settings'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const boxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
})

const visionSchema = z.object({
  cards: z
    .array(
      z.object({
        month: z.number().int().min(1).max(12),
        kind: z.enum(['gwang', 'yeol', 'tti', 'pi']),
        ssangpi: z.boolean().optional(),
        box: boxSchema.optional(),
      }),
    )
    .max(12),
  confidence: z.number().min(0).max(1),
  note: z.string().max(200).optional(),
})

const geminiVisionJsonSchema = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        properties: {
          month: { type: 'integer', minimum: 1, maximum: 12 },
          kind: { type: 'string', enum: ['gwang', 'yeol', 'tti', 'pi'] },
          ssangpi: { type: 'boolean' },
          box: {
            type: 'object',
            properties: {
              x: { type: 'number', minimum: 0, maximum: 1 },
              y: { type: 'number', minimum: 0, maximum: 1 },
              w: { type: 'number', minimum: 0, maximum: 1 },
              h: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
        },
        required: ['month', 'kind'],
      },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    note: { type: 'string', maxLength: 200 },
  },
  required: ['cards', 'confidence'],
} as const

export interface RecognizedCardBox {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface RecognizedCard {
  readonly cardId: CardId
  readonly box?: RecognizedCardBox
}

export interface VisionRecognition {
  readonly cardIds: readonly CardId[]
  readonly cards: readonly RecognizedCard[]
  readonly confidence: number
  readonly note: string | null
}

const inputSchema = z.object({
  imageDataUrl: z.string().min(1),
  gameType: z.enum(['seotda', 'gostop']),
})

export async function recognizeHand(
  input: z.infer<typeof inputSchema>,
): Promise<ActionResult<VisionRecognition>> {
  const userId = await currentUserId()
  if (!userId) return fail('errors.loginRequired')

  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return fail('errors.invalidInput')

  const vision = await getActiveVisionSettings()
  if (!vision) {
    return fail('errors.visionDisabled')
  }

  const rate = await consumeRateLimits([
    {
      scope: 'vision.user.minute',
      identifier: userId,
      limit: 6,
      windowMs: 60 * 1000,
    },
    {
      scope: 'vision.user.hour',
      identifier: userId,
      limit: 30,
      windowMs: 60 * 60 * 1000,
    },
  ])
  if (!rate.allowed) return fail('errors.visionRateLimited')

  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(parsed.data.imageDataUrl)
  if (!match || !match[1] || !match[2]) return fail('errors.visionUnsupportedImage')
  const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/webp'
  const base64Data = match[2]
  if (base64Data.length * 0.75 > MAX_IMAGE_BYTES) return fail('errors.visionImageTooLarge')

  const gameHint =
    parsed.data.gameType === 'seotda'
      ? '섯다 손패 사진이므로 카드는 보통 2장이고, 1~10월의 광/열끗/띠만 나온다 (피 없음).'
      : '고스톱 획득 패 사진이므로 카드가 여러 장일 수 있다.'

  const prompt = `이 사진에 보이는 화투 카드를 식별해라. ${gameHint}
각 카드를 월(1~12)과 종류(gwang=광, yeol=열끗, tti=띠, pi=피)로 판정하고,
피가 쌍피(11월 오동 쌍피, 12월 비 쌍피)면 ssangpi=true 로 표시해라.
가능하면 각 카드의 위치를 사진 기준 정규화 좌표(box: {x,y,w,h}, 좌상단이 0,0이고 우하단이 1,1)로 함께 달아라.
위치를 확신할 수 없으면 box 필드를 아예 생략해라. 좌표를 추측해서 만들어내지 마라.
확신이 없는 카드는 포함하지 마라. 전체 확신도를 confidence(0~1)로 적어라.

다음 JSON 형식으로만 응답해라. 다른 텍스트 금지:
{"cards":[{"month":3,"kind":"gwang","box":{"x":0.12,"y":0.2,"w":0.3,"h":0.5}}],"confidence":0.95,"note":"선택적 비고"}`

  try {
    const text =
      vision.provider === 'anthropic'
        ? await recognizeWithAnthropic(vision.apiKey, vision.model, mediaType, base64Data, prompt)
        : await recognizeWithGemini(vision.apiKey, vision.model, mediaType, base64Data, prompt)
    if (!text) return fail('errors.visionNoResult')

    const jsonMatch = /\{[\s\S]*\}/.exec(text)
    if (!jsonMatch) return fail('errors.visionInvalidResult')

    let raw: unknown
    try {
      raw = JSON.parse(jsonMatch[0])
    } catch {
      return fail('errors.visionInvalidResult')
    }

    const result = visionSchema.safeParse(raw)
    if (!result.success) return fail('errors.visionInvalidResult')

    const matched = matchCards(result.data.cards, parsed.data.gameType)
    return ok({
      cardIds: matched.map((card) => card.cardId),
      cards: matched,
      confidence: result.data.confidence,
      note: result.data.note ?? null,
    })
  } catch {
    console.error('vision recognition failed')
    return fail('errors.visionRecognitionFailed')
  }
}

async function recognizeWithAnthropic(
  apiKey: string,
  model: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  base64Data: string,
  prompt: string,
): Promise<string | null> {
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  })
  const textBlock = response.content.find((block) => block.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : null
}

async function recognizeWithGemini(
  apiKey: string,
  model: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  base64Data: string,
  prompt: string,
): Promise<string | null> {
  const client = new GoogleGenAI({ apiKey })
  const response = await client.interactions.create({
    model,
    store: false,
    input: [
      { type: 'text', text: prompt },
      { type: 'image', data: base64Data, mime_type: mediaType },
    ],
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: geminiVisionJsonSchema,
    },
  })
  return response.output_text ?? null
}

function matchCards(
  detected: ReadonlyArray<{
    month: number
    kind: string
    ssangpi?: boolean
    box?: RecognizedCardBox
  }>,
  gameType: GameType,
): RecognizedCard[] {
  const used = new Set<CardId>()
  const matched: RecognizedCard[] = []

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
      matched.push({ cardId: free.id, box: item.box })
    }
  }

  return matched
}
