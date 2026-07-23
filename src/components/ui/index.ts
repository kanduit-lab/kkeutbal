/**
 * 공용 UI 프리미티브 배럴. 판 옆에서 한 손으로 쓰는 앱이라 터치 타깃은 48px 이상,
 * 상태(로딩/빈/에러)는 반드시 구분해 렌더한다 (원래 ui.tsx 최상단 주석).
 *
 * 모든 소비자는 `@/components/ui` 로만 import 한다 — 아래 이름들이 공개 표면 전체다.
 * ToastContext 는 button.tsx 가 toast.tsx 에서 직접 가져다 쓰는 내부 연결선이라
 * 여기서는 재노출하지 않는다 (분리 전 ui.tsx 에서도 export 되지 않았다).
 */
export { Button, SubmitButton, ButtonLink } from './button'
export { useModalBehavior, ConfirmDialog } from './modal'
export { Input, Field } from './input'
export { Stepper } from './stepper'
export { Panel, Badge, Spinner, EmptyState, Avatar } from './primitives'
export { useToast, ToastProvider } from './toast'
