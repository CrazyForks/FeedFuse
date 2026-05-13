/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Next.js 仅支持在项目根读取 next.config，这里保留唯一根配置入口。
  poweredByHeader: false,
  experimental: {
    // 对高频图标库做按需导入重写，减少客户端打包体积。
    optimizePackageImports: ['lucide-react'],
  },
  typescript: {
    // 将 TypeScript 主配置迁移到 config 目录，避免根目录散落配置文件。
    tsconfigPath: 'config/typescript/tsconfig.json',
  },
};

export default nextConfig;
