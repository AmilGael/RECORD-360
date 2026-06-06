import type { Metadata, Viewport } from "next";
import { Archivo, Space_Mono, Fraunces } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { getLang } from "@/i18n/server";
import { ServiceWorkerRegister } from "@/components/sw-register";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo" });
const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: "Raphl — La caja negra de tu obra",
  description: "Cada nota, foto y decisión de tu obra, registrada para siempre.",
  appleWebApp: { capable: true, title: "Raphl", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const theme = (await cookies()).get("r360_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang={lang}>
      <body className={`${archivo.variable} ${mono.variable} ${fraunces.variable}`} data-theme={theme}>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
