import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }];
  },
  transpilePackages: ["@shopy/types", "@shopy/shared", "@shopy/validation"],
};

export default nextConfig;
