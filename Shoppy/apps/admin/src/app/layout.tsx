import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AdminShell } from "../components/AdminShell";

/** Inter variable autoalojada (expuesta como `--font-inter` para globals.css). */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "vinta.zhe Admin",
  robots: { index: false, follow: false },
  description:
    "Panel administrativo de vinta.zhe — e-commerce chileno de ropa de segunda mano",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`h-full antialiased ${inter.variable}`}>
      <body className="min-h-full flex flex-col bg-ivory text-carbon">
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
