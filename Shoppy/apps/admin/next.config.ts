import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@shopy/types", "@shopy/shared", "@shopy/validation"],
};

export default nextConfig;
