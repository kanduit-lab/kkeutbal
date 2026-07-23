import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // dockerfiles/Dockerfile.nextjs 가 .next/standalone + node server.js 를 사용한다
  output: 'standalone',
  webpack: (config) => {
    // 테스트 도구가 프로젝트 안에 로그를 쓰면 watcher 가 무한 재컴파일에 빠진다
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/.playwright-mcp/**',
        '**/.qa-reports/**',
      ],
    }
    return config
  },
  experimental: {
    typedRoutes: true,
  },
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
