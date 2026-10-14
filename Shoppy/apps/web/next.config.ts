import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@shopy/types", "@shopy/shared", "@shopy/validation"],
  images: {
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
