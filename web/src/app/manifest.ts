import type { MetadataRoute } from "next";

// PWA manifest (Next metadata route → served at /manifest.webmanifest).
// Makes Raphl installable to a phone/desktop home screen for on-site use.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Raphl — La caja negra de tu obra",
    short_name: "Raphl",
    description: "Cada nota, foto y decisión de tu obra, registrada para siempre.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#0b0b0c",
    theme_color: "#0b0b0c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
