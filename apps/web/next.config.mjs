/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Rule engine + coach tất định dùng chung với server, chạy được ở client (offline).
  transpilePackages: ['@tiny/domain', '@tiny/ai-gateway', '@tiny/analytics'],
  env: {
    API_INTERNAL_BASE: process.env.API_INTERNAL_BASE ?? 'http://localhost:4000',
  },
  webpack(config) {
    // Các package workspace dùng import kiểu NodeNext ('./x.js' trỏ tới ./x.ts).
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
