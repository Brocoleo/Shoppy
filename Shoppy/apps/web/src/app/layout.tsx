import type { Metadata } from "next";
import "./globals.css";
import { WebQueryProvider } from "../lib/query";
import { SessionProvider } from "../lib/session";
import { CartProvider } from "../lib/cart";
import { Header } from "../components/Header";

export const metadata: Metadata = {
  title: "Shopy — Ropa de segunda mano",
  description: "Shopy: e-commerce chileno de ropa de segunda mano. Prendas únicas verificadas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-full bg-ivory font-sans text-carbon antialiased">
        <WebQueryProvider>
          <SessionProvider>
            <CartProvider>
              <a
                href="#contenido"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-carbon focus:px-4 focus:py-2 focus:text-sm focus:text-ivory"
              >
                Saltar al contenido
              </a>
              <Header />
              <main id="contenido" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6">{children}</main>
              <footer className="bg-carbon text-ivory">
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-8 text-sm">
                  <p className="font-display text-lg tracking-wide">Shopy · Beta</p>
                  <p className="text-ivory/70">Ropa de segunda mano verificada · Precios en CLP · Despachos a todo Chile</p>
                </div>
              </footer>
            </CartProvider>
          </SessionProvider>
        </WebQueryProvider>
      </body>
    </html>
  );
}
