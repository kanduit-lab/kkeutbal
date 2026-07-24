import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // dockerfiles/Dockerfile.nextjs 가 .next/standalone + node server.js 를 사용한다
  output: 'standalone',
  // Next 16 기본 번들러. 빈 설정을 명시해 webpack 설정과의 모호성을 없앤다.
  turbopack: {},
  typedRoutes: true,
  // 족보 vision 업로드 이미지는 Supabase Storage 경유
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
