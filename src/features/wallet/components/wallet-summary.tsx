import type { CreditWalletSnapshot } from '../actions'
import { EmptyState, Panel } from '@/components/ui'

/** 지갑 화면의 읽기 전용 잔액·원장 요약. mutation UI와 분리해 다른 프로필 화면에서도 재사용한다. */
export function WalletSummary({ wallet }: { wallet: CreditWalletSnapshot }) {
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3" aria-label="가상 크레딧 잔액">
        <Panel className="space-y-1 py-4">
          <p className="text-xs font-medium text-muted">사용 가능</p>
          <p className="text-2xl font-black tabular-nums text-gold">
            {wallet.availableBalance.toLocaleString()}
          </p>
          <p className="text-xs text-muted">새 방에 잠글 수 있는 크레딧</p>
        </Panel>
        <Panel className="space-y-1 py-4">
          <p className="text-xs font-medium text-muted">진행 중 잠금</p>
          <p className="text-2xl font-black tabular-nums">{wallet.lockedBalance.toLocaleString()}</p>
          <p className="text-xs text-muted">정산 전 방에 배정된 크레딧</p>
        </Panel>
      </section>

      <Panel className="flex items-center justify-between gap-3 py-4">
        <div>
          <h2 className="font-bold">총 가상 크레딧</h2>
          <p className="mt-0.5 text-xs text-muted">현금 가치·환전·출금이 없는 게임 전용 수치입니다</p>
        </div>
        <p className="shrink-0 text-2xl font-black tabular-nums">{wallet.totalBalance.toLocaleString()}</p>
      </Panel>

      <section className="space-y-3" aria-labelledby="credit-history-heading">
        <div>
          <h2 id="credit-history-heading" className="font-bold">
            거래 기록
          </h2>
          <p className="mt-0.5 text-xs text-muted">최근 50건 · 수정 대신 반대 거래로 정정됩니다</p>
        </div>
        {wallet.transactions.length === 0 ? (
          <EmptyState title="아직 거래 기록이 없습니다" hint="관리자 지급 또는 방 정산 뒤 여기에 남습니다" />
        ) : (
          <ul className="space-y-2">
            {wallet.transactions.map((transaction) => {
              const change = transaction.deltaAvailable + transaction.deltaLocked
              const movement = transaction.deltaLocked
                ? `사용 가능 ${signed(transaction.deltaAvailable)} · 잠금 ${signed(transaction.deltaLocked)}`
                : signed(transaction.deltaAvailable)
              return (
                <li key={transaction.id}>
                  <Panel className="space-y-1.5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words font-bold">{transaction.reason}</p>
                      <p
                        className={`shrink-0 text-lg font-black tabular-nums ${
                          change > 0 ? 'text-win' : change < 0 ? 'text-accent' : 'text-muted'
                        }`}
                      >
                        {change === 0 ? movement : signed(change)}
                      </p>
                    </div>
                    <p className="text-xs text-muted">
                      {transactionLabel(transaction.kind)} · {formatDateTime(transaction.createdAt)} · 이후 사용
                      가능 {transaction.availableAfter.toLocaleString()} / 잠금{' '}
                      {transaction.lockedAfter.toLocaleString()}
                    </p>
                  </Panel>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString()}`
}

function transactionLabel(kind: CreditWalletSnapshot['transactions'][number]['kind']): string {
  switch (kind) {
    case 'admin_grant':
      return '관리자 지급'
    case 'admin_revoke':
      return '관리자 회수'
    case 'room_lock':
      return '방 입장 잠금'
    case 'room_settlement':
      return '방 정산'
    case 'correction':
      return '정정 거래'
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
