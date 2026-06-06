import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/i18n/server";
import Link from "next/link";
import { markNotificationRead, markAllNotificationsRead } from "@/app/actions/notifications";

export default async function NotificationsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;

  const { t } = await getDict();

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  const hasUnread = notifications.some((n) => n.readAt === null);

  return (
    <div className="reveal" style={{ maxWidth: 640, margin: "0 auto" }}>
      <p className="kicker">{t.notifications.title.toUpperCase()}</p>
      <h1 className="h-lg" style={{ fontSize: "clamp(1.9rem, 4vw, 2.7rem)", margin: "10px 0 20px" }}>{t.notifications.title}</h1>

      {hasUnread && (
        <form action={markAllNotificationsRead} style={{ marginBottom: 16 }}>
          <button type="submit" className="btn btn-ghost" style={{ fontSize: "0.82rem", padding: "0.45rem 0.9rem" }}>
            {t.notifications.markAllRead}
          </button>
        </form>
      )}

      {notifications.length === 0 && (
        <p className="text-steel">{t.notifications.empty}</p>
      )}

      {notifications.map((n) => {
        const isUnread = n.readAt === null;
        return (
          <div
            key={n.id}
            className="row"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 4,
              borderLeft: isUnread ? "3px solid var(--accent)" : "3px solid transparent",
              paddingLeft: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%", gap: 8 }}>
              <div>
                {n.link ? (
                  <Link href={n.link} className="row-link" style={{ fontWeight: isUnread ? 700 : 400 }}>
                    {n.title}
                  </Link>
                ) : (
                  <span style={{ fontWeight: isUnread ? 700 : 400 }}>{n.title}</span>
                )}
                {n.body && <p className="text-soft" style={{ margin: "2px 0 0", fontSize: "0.88rem" }}>{n.body}</p>}
                <p className="text-steel" style={{ margin: "3px 0 0", fontSize: "0.76rem" }}>
                  {n.createdAt.toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" })}
                  {isUnread && (
                    <span style={{ marginLeft: 6, fontFamily: "var(--font-mono)", fontSize: "0.62rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)" }}>
                      {t.notifications.unread}
                    </span>
                  )}
                </p>
              </div>
              {isUnread && (
                <form action={markNotificationRead}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" className="btn btn-ghost" style={{ fontSize: "0.76rem", padding: "0.3rem 0.65rem", whiteSpace: "nowrap" }}>
                    {t.notifications.markRead}
                  </button>
                </form>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
