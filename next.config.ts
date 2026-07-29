import type { NextConfig } from "next";

const basePath = process.env.VIBE_3D_BASE_PATH || "";

const nextConfig: NextConfig = {
  basePath,
  output: process.env.VIBE_3D_STANDALONE === "1" ? "standalone" : undefined,
  env: {
    NEXT_PUBLIC_VIBE_3D_BASE_PATH: basePath,
  },
};

export default nextConfig;
