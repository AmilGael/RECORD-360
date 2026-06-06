"use client";
import { useEffect } from "react";

/**
 * Registers the service worker — PRODUCTION ONLY. In dev the SW is never
 * registered (and any existing one is unregistered), so it can't serve stale
 * content while iterating. Renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
