import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Misma razón que en el admin: el E2E y el sitio público pueden quedar en
  // `localhost` o en `127.0.0.1` según cómo se arrancó el dev server. Si no
  // coinciden, la web pública se sirve pero no hidrata y el E2E de compra falla
  // sin dar ningún error.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Esta es la cara pública de la tienda: sin estos headers el navegador
  // expone el mimetype a la sniffing, permite que el sitio se embeba en
  // frames ajenos (clickjacking) y deja correr plugins que no se usan.
  // `Referrer-Policy: no-referrer` coincide con el que ya devuelve el puente
  // de pagos (`/api/payments/*`), así no quedan dos valores distintos.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
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
