import { Nanum_Myeongjo, Noto_Sans_KR } from 'next/font/google'

export const displayFont = Nanum_Myeongjo({
  weight: ['400', '700', '800'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-display-bundled',
  fallback: ['Gungsuh', 'Batang', 'AppleMyungjo', 'serif'],
})

export const bodyFont = Noto_Sans_KR({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-body-bundled',
  fallback: ['Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', 'system-ui', 'sans-serif'],
})