import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['image-hash', 'file-type', 'better-sqlite3', 'sharp'],
};

export default nextConfig;
