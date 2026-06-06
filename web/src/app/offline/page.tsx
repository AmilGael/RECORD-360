import { getDict } from "@/i18n/server";

// Shown by the service worker when a navigation is requested with no network.
export default async function OfflinePage() {
  const { t } = await getDict();
  return (
    <div className="grid-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 28 }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 className="h-lg" style={{ fontSize: "clamp(1.6rem, 4vw, 2.2rem)", marginBottom: 10 }}>{t.offline.title}</h1>
        <p className="text-steel">{t.offline.body}</p>
      </div>
    </div>
  );
}
