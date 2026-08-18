import type { Metadata, Viewport } from "next";
// Plancha Industrial world: all three faces are Omnibus-Type (Latin American
// foundry) — Archivo carries UI + condensed-caps labels via its width axis,
// Chivo Mono carries data (timestamps, hashes, codes), Saira Stencil One is
// display numerals ONLY. Fraunces (the old serif brand voice) retires with the
// old world.
import { Archivo, Chivo_Mono, Saira_Stencil_One } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { getLang } from "@/i18n/server";
import { ServiceWorkerRegister } from "@/components/sw-register";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", axes: ["wdth"] });
const mono = Chivo_Mono({ subsets: ["latin"], variable: "--font-mono" });
const stencil = Saira_Stencil_One({ subsets: ["latin"], weight: "400", variable: "--font-stencil" });

export const metadata: Metadata = {
  title: "Raphel — La caja negra de tu obra",
  description: "Cada nota, foto y decisión de tu obra, registrada para siempre.",
  appleWebApp: { capable: true, title: "Raphel", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  // Night is the world's native state (direction contract + confirmed
  // dark-first): first run lands on night shift; day is the chosen derivation.
  const theme = (await cookies()).get("r360_theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang={lang}>
      <body className={`${archivo.variable} ${mono.variable} ${stencil.variable}`} data-theme={theme}>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
