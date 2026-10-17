"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { errorsCopy } from "@/i18n/errors-copy";
import { langFromCookie } from "@/lib/i18n/error-lang";

const subscribeNever = () => () => {};

// Replaces the root layout when it fails, so globals.css and the theme tokens
// may not be loaded: everything is inline, using the night-shift token values
// from DESIGN.md (slate ground, slate plane, chalk, steel, hairline).
const C = {
  ground: "#1E2328",
  plane: "#2A3138",
  chalk: "#F2F1EC",
  steel: "#8D979E",
  line: "rgba(242, 241, 236, 0.30)",
};

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const lang = useSyncExternalStore(subscribeNever, () => langFromCookie(document.cookie), () => "es" as const);
  const T = errorsCopy[lang];
  return (
    <html lang={lang}>
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", padding: "28px 16px", boxSizing: "border-box", background: C.ground, color: C.chalk, fontFamily: "system-ui, sans-serif" }}>
        <div role="alert" style={{ width: "100%", maxWidth: 440, padding: "24px 22px", boxSizing: "border-box", background: C.plane, border: `1px solid ${C.line}`, borderRadius: 0, boxShadow: "6px 7px 0 rgba(0, 0, 0, 0.38)" }}>
          <div style={{ fontFamily: "monospace", fontSize: "0.72rem", letterSpacing: "0.2em", color: C.steel }}>{T.kicker}</div>
          <h1 style={{ margin: "8px 0 10px", fontSize: "1.8rem", fontWeight: 800, textTransform: "uppercase", lineHeight: 1 }}>{T.title}</h1>
          <p style={{ margin: "0 0 16px", color: C.steel, lineHeight: 1.5 }}>{T.body}</p>
          {error.digest && (
            <p style={{ margin: "0 0 16px", fontFamily: "monospace", fontSize: "0.72rem", letterSpacing: "0.06em", color: C.steel, overflowWrap: "anywhere" }}>
              {T.code}: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={reset} style={{ minHeight: 44, padding: "0.72rem 1.2rem", border: 0, borderRadius: 0, background: C.chalk, color: C.ground, font: "700 0.82rem system-ui, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer" }}>
              {T.retry}
            </button>
            <Link href="/" style={{ minHeight: 44, boxSizing: "border-box", display: "inline-flex", alignItems: "center", padding: "0.72rem 1.2rem", border: `1px solid ${C.line}`, color: C.chalk, font: "700 0.82rem system-ui, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", textDecoration: "none" }}>
              {T.home}
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
