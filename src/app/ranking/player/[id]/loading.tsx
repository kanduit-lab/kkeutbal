import { Spinner } from '@/components/ui'

export default function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <Spinner label="전적 불러오는 중…" />
    </main>
  )
}
