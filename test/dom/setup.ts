/**
 * `test/dom/**`(jsdom 환경) 전용 전역 설정. `vitest.config.ts`의 `setupFiles`에 등록돼
 * 모든 테스트 파일 로드 전에 한 번 실행된다 — node 환경 테스트(`src/**`의 순수 함수 26개)는
 * `typeof window === 'undefined'`라 아래 스텁이 아무 영향을 주지 않는다.
 *
 * ## jsdom에 없는 것: ResizeObserver
 * jsdom(v30 포함)은 실제 레이아웃 엔진이 없어 `ResizeObserver`를 구현하지 않는다.
 * `src/components/ui/paged.tsx`(`useFitCount`)와 `src/features/game/components/action-bar.tsx`
 * 둘 다 `new ResizeObserver(...)`를 호출하므로, 이게 없으면 렌더링 자체가
 * `ReferenceError: ResizeObserver is not defined`로 죽는다.
 *
 * 이 스텁은 "관찰"을 실제로 하지 않는다 — `observe()`/`unobserve()`/`disconnect()`는 전부
 * no-op이다. 실제 브라우저라면 요소 크기가 바뀔 때 콜백이 비동기로 발화하지만, jsdom은애초에
 * 레이아웃을 계산하지 않으므로 "크기가 바뀌었다"는 사건 자체가 없다. 대신:
 * - 마운트 시 `useFitCount`가 직접 `measure()`를 한 번 동기 호출하므로(paged.tsx:40),
 *   `clientHeight`만 미리 고정해두면 초기 측정값은 정확히 검증할 수 있다
 *   (`Object.defineProperty(node, 'clientHeight', { value, configurable: true })`).
 * - "리사이즈가 실제로 일어났을 때" 재측정되는지 확인하려면, 이 스텁이 저장해 둔
 *   콜백을 테스트가 직접 호출해야 한다(`ResizeObserverStub.instances`). 실제 브라우저의
 *   비동기·자동 발화와는 다르다 — 이 파일의 스텁은 "수동으로 트리거 가능한 훅"일 뿐이다.
 */
export class ResizeObserverStub {
  static instances: ResizeObserverStub[] = []

  readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ResizeObserverStub.instances.push(this)
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}

  /** 테스트에서 "리사이즈가 일어났다"를 흉내 낼 때 쓴다 — jsdom은 자동으로 안 부른다. */
  fire(): void {
    this.callback([], this as unknown as ResizeObserver)
  }
}

if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

/**
 * ## jsdom에 없는 것: matchMedia
 * jsdom은 미디어 쿼리를 평가하지 않아 `window.matchMedia`가 아예 없다. 실제 브라우저에는
 * 전부 있는 API라 앱 코드에서 존재 여부를 확인하지 않는 게 맞고(`useIsDesktop`,
 * 족보 순위표의 `prefers-reduced-motion` 확인), 없는 쪽이 jsdom의 한계다 — 그래서 앱을
 * 방어적으로 고치는 대신 여기서 채운다.
 *
 * 항상 `matches: false`를 돌려준다: 데스크톱 분기도, 모션 축소도 켜지지 않은 기본 상태다.
 * 특정 쿼리가 참이어야 하는 테스트는 이 스텁을 자기 파일에서 다시 덮어쓰면 된다.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
