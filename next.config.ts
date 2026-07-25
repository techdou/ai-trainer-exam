import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

// unsafe-eval 只在开发环境放行(react-refresh 依赖 eval); 生产环境禁止, 堵住 XSS 后的 eval 执行面。
// unsafe-inline 保留: Next.js 水合内联脚本必需, 彻底移除需引入 nonce 中间件(后续加固项)。
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: `default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https:; style-src 'self' 'unsafe-inline'; ${scriptSrc}; frame-ancestors 'self'; base-uri 'self'; form-action 'self'` },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.dev.coze.site'],
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
