import { redirect } from 'next/navigation'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { AdvisorClient } from '@/features/jokbo-advisor/components/advisor-client'
import { getVisionSettings } from '@/features/jokbo-advisor/vision/settings'

const searchParamsSchema = z.object({
  game: z.enum(['seotda', 'gostop', 'poker']).catch('seotda'),
})

export default async function AdvisorPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string | string[] }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { game } = searchParamsSchema.parse(await searchParams)

  const visionSettings = await getVisionSettings()
  const visionEnabled =
    visionSettings.enabled &&
    (visionSettings.provider === 'anthropic'
      ? visionSettings.hasAnthropicApiKey
      : visionSettings.hasGeminiApiKey)

  return <AdvisorClient visionEnabled={visionEnabled} initialTab={game} />
}
