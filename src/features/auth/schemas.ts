import { z } from 'zod'

/**
 * 인증·프로필 입력 제약을 한 곳에 둔다.
 *
 * **왜 별도 파일인가**: `actions.ts`와 `profile-actions.ts`는 `'use server'` 파일이고,
 * Next.js는 그런 파일이 async 함수만 export하도록 요구한다. 스키마 객체를 거기서 export하면
 * 그 파일이 묶인 서버 액션 번들 전체가 "A 'use server' file can only export async functions,
 * found object"로 죽는다 — 로그인·게스트 입장·로케일 전환이 한꺼번에 500이 된다.
 * 타입 검사와 단위 테스트로는 안 잡히고 실제 요청에서만 드러나므로 이 경계를 지켜야 한다.
 */

/** 회원가입과 계정 설정이 공유하는 표시 이름 제약. 한 곳에서 바뀌면 두 경로가 함께 바뀐다. */
export const displayNameSchema = z.string().trim().min(1).max(20)
