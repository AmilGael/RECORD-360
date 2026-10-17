import Link from "next/link";
import { getDict } from "@/i18n/server";

/** Shared by app/not-found.tsx (public, links home) and app/app/not-found.tsx (inside the app shell, links to Obras). */
export async function NotFoundScreen({ scope }: { scope: "site" | "app" }) {
  const { t } = await getDict();
  const T = t.errors;
  return (
    <div
      className={scope === "site" ? "grid-bg" : undefined}
      style={{ minHeight: scope === "site" ? "100vh" : undefined, display: "grid", placeItems: "center", padding: "28px 16px" }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 440, padding: "24px 22px" }}>
        <div className="kicker">{T.notFoundKicker}</div>
        <h1 className="h-lg" style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)", margin: "8px 0 10px" }}>{T.notFoundTitle}</h1>
        <p className="text-steel" style={{ marginBottom: 16 }}>{T.notFoundBody}</p>
        <Link href={scope === "app" ? "/app" : "/"} className="btn btn-ghost">{scope === "app" ? T.backToApp : T.home}</Link>
      </div>
    </div>
  );
}
