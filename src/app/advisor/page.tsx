import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { serverEnv } from '@/lib/env'
import { AdvisorClient } from '@/features/jokbo-advisor/components/advisor-client'

export default async function AdvisorPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const env = serverEnv()
  const visionEnabled = env.JOKBO_VISION_ENABLED && Boolean(env.ANTHROPIC_API_KEY)

  return <AdvisorClient visionEnabled={visionEnabled} />
}
