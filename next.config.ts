import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['image-hash', 'file-type', 'better-sqlite3', 'sharp'],
  outputFileTracingIncludes: {
    '/*': ['node_modules/image-hash/**/*'],
  },
};

export default nextConfig;
