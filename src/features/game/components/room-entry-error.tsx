import { ButtonLink, Panel } from '@/components/ui'

export function RoomEntryError({
  title,
  hint,
  homeLabel,
}: {
  title: string
  hint: string
  homeLabel: string
}) {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6"
    >
      <Panel className="space-y-3 py-8 text-center">
        <p className="text-3xl" aria-hidden>
          🎴
        </p>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-muted">{hint}</p>
        <div className="pt-2">
          <ButtonLink href="/" variant="primary" className="w-full">
            {homeLabel}
          </ButtonLink>
        </div>
      </Panel>
    </main>
  )
}