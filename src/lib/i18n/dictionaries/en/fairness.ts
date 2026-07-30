// ko 쪽 타입을 명시적으로 붙여 두면 ko에 없는 여분 키가 타입 에러로 잡힌다.
// 분할 전 en.ts는 인라인 리터럴이라 이 검사가 공짜였는데, 참조값 조립으로
// 바뀌면서 그 방향이 뚫렸다 — 두 언어가 갈라지지 않게 막는 장치라 복원한다.
import type { Dictionary } from '../ko'

export const fairness: Dictionary['fairness'] = {
  title: 'Verifiable Seotda deal',
  collecting: 'Collecting seeds',
  sealed: 'Deal sealed',
  submitted: '{submitted}/{total} seeds submitted',
  deadline: 'Deadline {time}',
  deadlineIn: '{n}s left',
  commitmentLabel: 'Server seed commitment',
  copyCommitment: 'Copy commitment',
  commitmentCopied: 'Commitment copied',
  copyFailed: 'Could not copy',
  seedReady: 'Your seed is retained on this device. Keep it for the post-round audit.',
  submitSeed: 'Submit my seed',
  seedSubmitted: 'My seed submitted',
  sealDeal: 'Seal verified deal',
  waitForSeeds: 'Seal after everyone submits or the deadline passes',
  showMyHand: 'Show my verified hand',
  hideMyHand: 'Hide my verified hand',
  handTitle: 'My verified hand',
  dealerWillResolve: 'The sealed deck determines the result automatically',
  replayHint: 'Ties and gusa are voided and replayed',
  settingsLabel: 'Fair dealing',
  verifiedEnabled: 'Use verifiable Seotda dealing',
  verifiedDisabled: 'Manual dealing',
  verifiedHint:
    'Cards are dealt only after server and participant seed commitments, then the full deck is auditable after the round.',
  seedTimeoutLabel: 'Seed submission timeout',
  seedTimeoutHint:
    'After this time, missing submissions are recorded and the deal can be sealed.',
  settingsLocked: 'Fair-dealing options lock after the first round starts.',
  auditLink: 'Fairness audit',
  auditTitle: 'Verifiable deal audit',
  auditVerified: 'Deck recomputation verified',
  auditInvalid: 'Audit data did not verify',
  auditBack: 'Back to room',
} as const
