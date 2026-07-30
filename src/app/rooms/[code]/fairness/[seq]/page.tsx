import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { Panel } from '@/components/ui'
import { getVerifiedFairnessAudit } from '@/features/fairness/fairness-actions'
import { parseFairShuffleReceipt } from '@/features/fairness/protocol'
import { verifyPublicFairnessAudit } from '@/features/fairness/receipt'
import { SEOTDA_DECK } from '@/features/hwatu/cards'
import { findRoomByCode } from '@/features/game/queries'
import { normalizeRoomCode } from '@/features/game/room-code'
import { auth } from '@/lib/auth'
import { db, schema } from '@/lib/db'
import { RoomEntryError } from '@/features/game/components/room-entry-error'
import { getDict, format } from '@/lib/i18n/server'

export default async function FairnessAuditPage({
  params,
}: {
  params: Promise<{ code: string; seq: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { code: rawCode, seq: rawSeq } = await params
  const code = normalizeRoomCode(rawCode)
  const seq = Number(rawSeq)
  if (!Number.isSafeInteger(seq) || seq < 1) notFound()

  const [room, { d }] = await Promise.all([findRoomByCode(code), getDict()])

  if (!room) {
    return (
      <RoomEntryError
        title={d.room.notFoundTitle}
        hint={format(d.room.notFoundHint, { code })}
        homeLabel={d.common.home}
      />
    )
  }
  const [round] = await db
    .select({ id: schema.rounds.id, gameType: schema.rooms.gameType })
    .from(schema.rounds)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.rounds.roomId))
    .where(and(eq(schema.rounds.roomId, room.id), eq(schema.rounds.seq, seq)))
    .limit(1)
  if (!round || round.gameType !== 'seotda') notFound()

  const audit = await getVerifiedFairnessAudit(room.id, round.id)
  if (!audit.success) {
    const key = audit.error.startsWith('errors.')
      ? (audit.error.slice('errors.'.length) as keyof typeof d.errors)
      : null
    return (
      <AuditError
        code={code}
        message={(key && d.errors[key]) || audit.error}
        backLabel={d.fairness.auditBack}
      />
    )
  }

  let valid = false
  try {
    valid = await verifyPublicFairnessAudit(
      audit.data.publicReceipt,
      parseFairShuffleReceipt(audit.data.fullReceipt),
      SEOTDA_DECK.map((card) => card.id),
    )
  } catch {
    valid = false
  }

  return (
    <main id="main" className="mx-auto w-full max-w-2xl space-y-5 px-4 pb-16 pt-8">
      <header>
        <Link
          href={`/rooms/${code}`}
          className="-ml-2 inline-flex min-h-12 items-center gap-1 rounded-xl px-2 text-sm font-bold text-muted transition-colors hover:text-text"
        >
          ← {d.fairness.auditBack}
        </Link>
        <h1 className="mt-3 font-brush text-3xl font-black">{d.fairness.auditTitle}</h1>
      </header>
      <Panel className="space-y-3">
        <p className={valid ? 'font-bold text-win' : 'font-bold text-accent'}>
          {valid ? `✓ ${d.fairness.auditVerified}` : `! ${d.fairness.auditInvalid}`}
        </p>
        <p className="text-xs text-muted">
          #{seq} · {room.name}
        </p>
        <pre className="max-h-[60vh] overflow-auto rounded-lg bg-black/30 p-3 text-xs leading-relaxed text-muted">
          {JSON.stringify(audit.data.fullReceipt, null, 2)}
        </pre>
      </Panel>
    </main>
  )
}

function AuditError({
  code,
  message,
  backLabel,
}: {
  code: string
  message: string
  backLabel: string
}) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6">
      <Panel className="space-y-4 text-center">
        <p className="text-sm text-muted">{message}</p>
        <Link
          href={`/rooms/${code}`}
          className="inline-flex min-h-12 items-center justify-center rounded-xl px-3 font-bold text-accent underline underline-offset-2"
        >
          ← {backLabel}
        </Link>
      </Panel>
    </main>
  )
}