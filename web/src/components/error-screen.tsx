"use client";
import { startTransition, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { errorsCopy } from "@/i18n/errors-copy";
import { langFromHtml } from "@/lib/i18n/error-lang";

const subscribeNever = () => () => {};

/**
 * Body of the error.tsx boundaries. Never renders error.message: in production
 * it is either generic or, for client errors, may carry internals. The digest
 * is the only identifier shown, so support can match it to the server log.
 */
export function ErrorScreen({
  error, reset, scope,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  scope: "site" | "app";
}) {
  const router = useRouter();
  // <html lang> is set by the root layout from r360_lang; the server snapshot
  // (Spanish) keeps SSR and hydration consistent.
  const lang = useSyncExternalStore(subscribeNever, () => langFromHtml(document.documentElement.lang), () => "es" as const);
  const T = errorsCopy[lang];

  // reset() alone re-renders with the cached server payload; refreshing first
  // re-fetches server components, which is what most failures need.
  const retry = () => startTransition(() => { router.refresh(); reset(); });

  return (
    <div
      className={scope === "site" ? "grid-bg" : undefined}
      style={{ minHeight: scope === "site" ? "100vh" : undefined, display: "grid", placeItems: "center", padding: "28px 16px" }}
    >
      <div role="alert" className="card" style={{ width: "100%", maxWidth: 440, padding: "24px 22px" }}>
        <div className="kicker">{T.kicker}</div>
        <h1 className="h-lg" style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)", margin: "8px 0 10px" }}>{T.title}</h1>
        <p className="text-steel" style={{ marginBottom: 16 }}>{T.body}</p>
        {error.digest && (
          <p className="mono text-steel" style={{ fontSize: "0.72rem", letterSpacing: "0.06em", marginBottom: 16, overflowWrap: "anywhere" }}>
            {T.code}: {error.digest}
          </p>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ink" onClick={retry}>{T.retry}</button>
          <Link href={scope === "app" ? "/app" : "/"} className="btn btn-ghost">{scope === "app" ? T.backToApp : T.home}</Link>
        </div>
      </div>
    </div>
  );
}
