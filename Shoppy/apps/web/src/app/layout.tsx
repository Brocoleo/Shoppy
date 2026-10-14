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
      <body className="min-h-full bg-zinc-50 text-zinc-900 antialiased">
        <WebQueryProvider>
          <SessionProvider>
            <CartProvider>
              <Header />
              <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6">{children}</main>
              <footer className="border-t border-zinc-200 bg-white">
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-zinc-500">
                  <p className="font-medium text-zinc-700">Shopy · Beta</p>
                  <p>Ropa de segunda mano verificada · Precios en CLP · Despachos a todo Chile</p>
                </div>
              </footer>
            </CartProvider>
          </SessionProvider>
        </WebQueryProvider>
      </body>
    </html>
  );
}
