import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

/** Rutas de sesión, pago o datos privados: nunca indexar ni seguir enlaces. */
const PRIVATE_PATHS = [
  "/carrito",
  "/checkout",
  "/checkout-return",
  "/login",
  "/pedidos",
  "/pedido",
  "/api/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
