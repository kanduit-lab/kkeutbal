import { Nanum_Myeongjo, Noto_Sans_KR } from 'next/font/google'

/**
 * 번들 폰트.
 *
 * 이전에는 `Gungsuh`·`Batang`·`Pretendard` 같은 **시스템 폰트만** 스택에 있었다. 셋 다 특정
 * OS에만 있어서 기기마다 다른 폰트로 떨어졌고, 안드로이드에는 명조 계열 대체가 없어 제목이
 * generic serif로 뭉개졌다. 브랜드 서체가 기기 복불복이면 서체를 고른 의미가 없다.
 *
 * `next/font/google`은 빌드 시점에 폰트 파일을 받아 self-host한다 — 런타임에 Google로 나가는
 * 요청이 없다. 한글은 Google이 unicode-range 슬라이스로 쪼개 주고(명조 기준 276개), 브라우저는
 * 실제로 쓰인 글자가 든 슬라이스만 받는다. 그래서 한글 전체를 번들해도 실제 전송량은 작다.
 *
 * `subsets`는 **preload 대상만** 고르는 옵션이지 내려받을 파일을 거르지 않는다
 * (next/font의 findFontFilesInCss는 CSS의 모든 파일을 받는다). 한글 슬라이스까지 preload를
 * 걸면 링크가 수백 개 붙으므로 `preload: false`로 두고 `display: 'swap'`에 맡긴다.
 */

/** 제목·족보명용 명조. 시스템 궁서와 달리 700/800 실굵기가 있어 합성 볼드가 필요 없다. */
export const displayFont = Nanum_Myeongjo({
  weight: ['400', '700', '800'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-display-bundled',
  fallback: ['Gungsuh', 'Batang', 'AppleMyungjo', 'serif'],
})

/** 본문용. 가변 폰트라 400·500·700·900을 파일 하나로 덮는다. */
export const bodyFont = Noto_Sans_KR({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-body-bundled',
  fallback: ['Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', 'system-ui', 'sans-serif'],
})
