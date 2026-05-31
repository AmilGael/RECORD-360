import type { Metadata } from "next";
import { Archivo, Space_Mono } from "next/font/google";
import "./globals.css";
import { getLang } from "@/i18n/server";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo" });
const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "RECORD 360 — La caja negra de tu obra",
  description: "Cada nota, foto y decisión de tu obra, registrada para siempre.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body className={`${archivo.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
