/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // 关闭 X-Powered-By 响应头，减少无效暴露并精简响应元信息。
  poweredByHeader: false,
  experimental: {
    // 对高频图标库做按需导入重写，减少客户端打包体积。
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
