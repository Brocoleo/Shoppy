import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { WebQueryProvider } from "../lib/query";
import { SessionProvider } from "../lib/session";
import { CartProvider } from "../lib/cart";
import { Header } from "../components/Header";
import { CookieConsent, CookiePreferencesButton } from "../components/CookieConsent";

export const metadata: Metadata = {
  title: {
    default: "vinta.zhe — Ropa de segunda mano",
    template: "%s | vinta.zhe",
  },
  openGraph: {
    siteName: "vinta.zhe",
    locale: "es_CL",
    type: "website",
    title: "vinta.zhe — Ropa de segunda mano",
    description: "Prendas de segunda mano y archivo fotográfico de vinta.zhe.",
  },
  description: "vinta.zhe: prendas de segunda mano y archivo de Instagram.",
};

export const viewport: Viewport = { themeColor: "#f8f7f4" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link
          rel="preconnect"
          href="https://evzlqwiipdjgtrqjlwba.supabase.co"
          crossOrigin="anonymous"
        />
      </head>
      <body className="flex min-h-dvh flex-col bg-ivory font-sans text-carbon antialiased">
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
              <main
                id="contenido"
                tabIndex={-1}
                className="mx-auto w-full max-w-[1440px] flex-1 px-5 pb-20 pt-3 sm:px-8 sm:pt-5 lg:px-14"
              >
                {children}
              </main>
              <footer className="mt-auto bg-carbon text-ivory">
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm">
                  <div className="flex flex-col gap-1">
                    <p className="font-display text-2xl">vinta.zhe</p>
                    <a
                      href="https://www.instagram.com/vinta.zhe/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 w-fit items-center underline underline-offset-4"
                    >
                      Instagram @vinta.zhe
                    </a>
                  </div>
                  <nav
                    aria-label="Enlaces legales"
                    className="flex flex-wrap gap-x-5 gap-y-1 border-t border-ivory/20 pt-4"
                  >
                    <Link href="/legal/privacidad" className="inline-flex min-h-11 items-center underline underline-offset-4">
                      Privacidad
                    </Link>
                    <Link href="/legal/terminos" className="inline-flex min-h-11 items-center underline underline-offset-4">
                      Términos
                    </Link>
                    <Link href="/legal/cookies" className="inline-flex min-h-11 items-center underline underline-offset-4">
                      Cookies
                    </Link>
                    <Link href="/envios" className="inline-flex min-h-11 items-center underline underline-offset-4">
                      Envíos
                    </Link>
                    <Link href="/devoluciones" className="inline-flex min-h-11 items-center underline underline-offset-4">
                      Devoluciones
                    </Link>
                    <CookiePreferencesButton />
                  </nav>
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-ivory/70">
                      Archivo fotográfico real de Instagram. Las prendas de
                      archivo no están disponibles para compra.
                    </p>
                    <p className="text-ivory/70">
                      Prendas de segunda mano · Santiago y Rancagua
                    </p>
                  </div>
                </div>
              </footer>
              <CookieConsent />
            </CartProvider>
          </SessionProvider>
        </WebQueryProvider>
      </body>
    </html>
  );
}
