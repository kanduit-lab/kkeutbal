import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AdvisorClient } from '@/features/jokbo-advisor/components/advisor-client'
import { getVisionSettings } from '@/features/jokbo-advisor/vision/settings'

export default async function AdvisorPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const visionSettings = await getVisionSettings()
  const visionEnabled =
    visionSettings.enabled &&
    (visionSettings.provider === 'anthropic'
      ? visionSettings.hasAnthropicApiKey
      : visionSettings.hasGeminiApiKey)

  return <AdvisorClient visionEnabled={visionEnabled} />
}
