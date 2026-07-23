import { Spinner } from '@/components/ui'

export default function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <Spinner label="결과 집계 중…" />
    </main>
  )
}
