/**
 * 베팅·멤버 시트 버튼의 공통 클래스 레시피.
 *
 * `action-bar` · `member-sheet-buy-in` · `member-sheet-proxy-bet` · `member-sheet-role`이
 * 같은 모양의 버튼을 그린다. 예전에는 네 파일이 각자 값을 적어서 같은 2줄 버튼이 44·48·56·64px
 * 네 가지 높이로 렌더됐다 — 한 곳에서만 정의해 갈라질 수 없게 한다.
 *
 * ## `!`가 왜 필요한가 (지우면 조용히 무력화된다)
 * 이 저장소는 `tailwind-merge` 없이 `clsx`로 className 을 이어 붙인다. 충돌하는 유틸리티는
 * 특이도가 같아서 **생성된 CSS 순서**로 승자가 정해지고, Tailwind 는 `px-1 → px-2 → … → px-5`,
 * `gap-0 → gap-0.5 → … → gap-1.5` 순으로 찍는다. 즉 나중에 오는 계약 기본값이 항상 이기므로
 * 값을 **줄이는** 오버라이드는 `!` 없이는 전부 죽은 코드다. 실제로 이전 `size="lg"` +
 * `className="px-1"` 조합은 px-5 그대로 렌더되고 있었다.
 *
 * `leading-tight`만 `!`가 없다 — `text-*` 유틸이 `--tw-leading` 변수를 거쳐 line-height 를
 * 읽으므로 순서와 무관하게 이긴다.
 */

/**
 * 3~4열 그리드에 들어가는 단일 라벨 버튼의 가로 패딩.
 *
 * 계약(`src/components/ui/button.tsx`)의 px-5(lg)·px-4(md)는 좁은 셀에서 과하다. 320px 화면의
 * 3열 셀은 93px뿐이라 px-5면 콘텐츠 폭이 53px만 남아 `레이즈`(text-lg 기준 약 57px)가 셀 밖으로
 * 밀린다. 8px 은 그리드의 gap-2 와 같은 값이라 셀 사이 여백과 셀 안 여백이 같은 리듬을 갖는다.
 */
export const GRID_BUTTON_CLASS = 'px-2!'

/**
 * 라벨 + 금액 2줄 버튼.
 *
 * 높이는 계약 기본값 md(min-h-12, 48px)로 통일한다 — sm(44px)은 접근성 하한이지 2줄을 담는
 * 높이가 아니다. 이 저장소의 커스텀 타입 스케일에서 md + leading-tight 조합은 내용이 38px 정도라
 * 위아래 5px씩 여유가 남는다. gap-0.5(2px)는 라벨과 금액이 한 덩어리로 읽히게 하는 값이다.
 */
export const STACK_BUTTON_CLASS = 'flex-col gap-0.5! px-2! leading-tight'

/** 2줄 버튼의 둘째 줄(금액) — 12px 는 임의값 대신 `text-micro` 토큰을 쓴다. */
export const STACK_AMOUNT_CLASS = 'text-micro leading-tight tabular-nums opacity-80'

/**
 * 옆에 붙은 카드와 키를 맞추는 아이콘 버튼.
 *
 * `size="icon"`은 `size-12`(48×48 고정)이라, 64px짜리 `SelfBar`나 72px짜리 노선도 옆에
 * 세우면 위아래로 8~12px씩 빈다. 세로 화면 한 열에 64·48·56이 번갈아 쌓이던 게
 * "크기가 들쭉날쭉하다"의 실체였다. 폭(48)은 터치 타깃으로 유지하고 높이만 이웃에 맞춘다.
 *
 * `!`가 필요한 이유는 이 파일 상단 주석 참고 — `size-12`의 height 를 이기려면 `h-*`만으로는
 * 부족하다.
 */
export const MATCH_SELF_BAR_HEIGHT_CLASS = 'h-16!'

/** 노선도(`h-18`, 72px) 옆에 세우는 아이콘 버튼. */
export const MATCH_RAIL_HEIGHT_CLASS = 'h-18!'
