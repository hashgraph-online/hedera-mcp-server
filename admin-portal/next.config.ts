import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        path: false,
        os: false,
        stream: false,
        buffer: false,
        worker_threads: false,
      };
      
      config.externals = [...(config.externals || []), 'better-sqlite3'];
    }
    
    config.ignoreWarnings = [
      { module: /vendor-chunks\/lib\/worker\.js/ },
    ];
    
    return config;
  },
  serverExternalPackages: ['better-sqlite3', 'drizzle-orm'],
};

export default nextConfig;
