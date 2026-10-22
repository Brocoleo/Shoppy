import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // En desarrollo Next bloquea los recursos cross-origin. Si el E2E apunta a
  // `127.0.0.1` y el servidor se arrancó en `localhost` (o al revés), la página
  // se sirve pero nunca hidrata: el login no responde y el test expira sin
  // error visible. Autorizar los dos nombres de loopback evita ese fallo.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // El panel no debe indexarse ni embeberse: la misma lógica de
          // seguridad que la web pública, más el noindex.
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
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
};

export default nextConfig;
