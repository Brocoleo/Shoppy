import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Misma razón que en el admin: el E2E y el sitio público pueden quedar en
  // `localhost` o en `127.0.0.1` según cómo se arrancó el dev server. Si no
  // coinciden, la web pública se sirve pero no hidrata y el E2E de compra falla
  // sin dar ningún error.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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
