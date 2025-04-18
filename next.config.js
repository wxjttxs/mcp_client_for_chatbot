/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*', // 可以替换为实际的 MCP 服务器 API 地址
      },
    ];
  }
};

module.exports = nextConfig; 