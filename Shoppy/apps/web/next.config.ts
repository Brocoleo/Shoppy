import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@shopy/types", "@shopy/shared", "@shopy/validation"],
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2_678_400,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/product-images/**",
      },
    ],
  },
};

export default nextConfig;
