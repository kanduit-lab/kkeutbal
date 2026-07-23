import { Spinner } from '@/components/ui'

export default function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <Spinner label="방에 들어가는 중…" />
    </main>
  )
}
