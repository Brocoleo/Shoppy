import type { Metadata } from "next";
import "./globals.css";
import { AdminShell } from "../components/AdminShell";

export const metadata: Metadata = {
  title: "vinta.zhe Admin",
  description:
    "Panel administrativo de vinta.zhe — e-commerce chileno de ropa de segunda mano",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
