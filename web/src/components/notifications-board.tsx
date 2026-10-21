"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markNotificationRead } from "@/app/actions/notifications";
import { SeverityMarker, type SeverityLabels } from "@/components/severity-marker";
import { NotificationTitleLink } from "@/components/notification-title-link";
import { notificationsHref, type NotificationQuery } from "@/lib/notifications/href";
import { isSafeNotificationLink } from "@/lib/notifications/link";
import {
  addReadOverlay,
  listReadOverlay,
  readOverlayVersion,
  removeReadOverlay,
  subscribeReadOverlay,
} from "@/lib/notifications/read-overlay";
import {
  applyReadOverlay,
  type NotificationListItem,
  type NotificationSectionsState,
} from "@/lib/notifications/sections-state";
import { formatRecordTime } from "@/lib/format/datetime";
import type { Lang } from "@/i18n/dictionaries";

export type NotificationsBoardLabels = {
  unreadSection: string;
  readSection: string;
  unreadCaughtUp: string;
  readEmpty: string;
  noResults: string;
  markRead: string;
  unread: string;
  unreadPager: string;
  readPager: string;
  pager: { older: string; newer: string; pageLabel: string; ofLabel: string };
  severity: SeverityLabels;
};

function fill(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function NotificationsBoard({
  data,
  pageSize,
  query,
  status,
  hasExtraFilters,
  lang,
  labels,
}: {
  data: NotificationSectionsState;
  pageSize: number;
  query: NotificationQuery;
  status: "unread" | "read" | undefined;
  hasExtraFilters: boolean;
  lang: Lang;
  labels: NotificationsBoardLabels;
}) {
  const router = useRouter();
  const overlayVersion = useSyncExternalStore(subscribeReadOverlay, readOverlayVersion, readOverlayVersion);
  const overlayIds = useMemo(() => {
    void overlayVersion;
    return listReadOverlay();
  }, [overlayVersion]);
  // The overlay is the single source for instant moves.
  const view = useMemo(() => applyReadOverlay(data, overlayIds, pageSize), [data, overlayIds, pageSize]);

  useEffect(() => {
    for (const n of data.read.items) removeReadOverlay(n.id);
  }, [data.read.items]);

  function markRead(id: string, navigating: boolean) {
    addReadOverlay(id);
    const fd = new FormData();
    fd.set("id", id);
    void markNotificationRead(fd).then(() => {
      // Navigating away discards the action's revalidation payload (Next 15.5
      // sets needsRefresh and runs one refresh that can beat the write). If
      // the destination is already showing, refresh once after the write so
      // the sidebar badge is not left stale.
      if (navigating && window.location.pathname !== "/app/notifications") {
        router.refresh();
      }
    }).catch(() => {
      removeReadOverlay(id);
    });
  }

  const showUnread = status !== "read";
  const showRead = status !== "unread";

  return (
    <>
      {showUnread && (
        <Section
          headingId="notif-unread-heading"
          title={fill(labels.unreadSection, view.unread.total)}
          empty={hasExtraFilters ? labels.noResults : labels.unreadCaughtUp}
          items={view.unread.items}
          unread
          pagerAria={labels.unreadPager}
          section={view.unread}
          pageKey="up"
          otherPage={query.rp}
          otherKey="rp"
          query={query}
          lang={lang}
          labels={labels}
          onMarkRead={(id) => markRead(id, false)}
          onOpenRead={(id) => markRead(id, true)}
        />
      )}
      {showRead && (
        <Section
          headingId="notif-read-heading"
          title={fill(labels.readSection, view.read.total)}
          empty={hasExtraFilters ? labels.noResults : labels.readEmpty}
          items={view.read.items}
          unread={false}
          pagerAria={labels.readPager}
          section={view.read}
          pageKey="rp"
          otherPage={query.up}
          otherKey="up"
          query={query}
          lang={lang}
          labels={labels}
        />
      )}
    </>
  );
}

function Section({
  headingId,
  title,
  empty,
  items,
  unread,
  pagerAria,
  section,
  pageKey,
  otherPage,
  otherKey,
  query,
  lang,
  labels,
  onMarkRead,
  onOpenRead,
}: {
  headingId: string;
  title: string;
  empty: string;
  items: NotificationListItem[];
  unread: boolean;
  pagerAria: string;
  section: NotificationSectionsState["unread"];
  pageKey: "up" | "rp";
  otherPage?: number;
  otherKey: "up" | "rp";
  query: NotificationQuery;
  lang: Lang;
  labels: NotificationsBoardLabels;
  onMarkRead?: (id: string) => void;
  onOpenRead?: (id: string) => void;
}) {
  function pageHref(page: number) {
    return notificationsHref({
      ...query,
      [pageKey]: page,
      [otherKey]: otherPage,
    });
  }

  return (
    <section className="notif-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="notif-section-title">{title}</h2>
      {items.length === 0 && <p className="text-steel">{empty}</p>}
      {items.map((n) => (
        <NotificationRow
          key={n.id}
          n={n}
          unread={unread}
          lang={lang}
          labels={labels}
          onMarkRead={onMarkRead}
          onOpenRead={onOpenRead}
        />
      ))}
      {section.total > 0 && (
        <nav className="notif-pager" aria-label={pagerAria}>
          {section.hasNewer ? (
            <Link href={pageHref(section.page - 1)} className="btn btn-ghost" style={{ fontSize: "0.82rem", padding: "0.42rem 0.9rem" }}>
              {labels.pager.newer}
            </Link>
          ) : (
            <span style={{ minWidth: 80 }} />
          )}
          <span className="kicker" style={{ color: "var(--steel)" }}>
            {labels.pager.pageLabel} {section.page} {labels.pager.ofLabel} {section.totalPages}
          </span>
          {section.hasOlder ? (
            <Link href={pageHref(section.page + 1)} className="btn btn-ghost" style={{ fontSize: "0.82rem", padding: "0.42rem 0.9rem" }}>
              {labels.pager.older}
            </Link>
          ) : (
            <span style={{ minWidth: 80 }} />
          )}
        </nav>
      )}
    </section>
  );
}

function NotificationRow({
  n,
  unread,
  lang,
  labels,
  onMarkRead,
  onOpenRead,
}: {
  n: NotificationListItem;
  unread: boolean;
  lang: Lang;
  labels: NotificationsBoardLabels;
  onMarkRead?: (id: string) => void;
  onOpenRead?: (id: string) => void;
}) {
  const href = isSafeNotificationLink(n.link) ? n.link! : null;
  const titleClass = `notif-title${unread ? " row-link" : ""}`;
  const title = href && unread && onOpenRead ? (
    <NotificationTitleLink href={href} className={titleClass} onPrimaryOpen={() => onOpenRead(n.id)}>
      {n.title}
    </NotificationTitleLink>
  ) : href ? (
    <Link href={href} prefetch={false} className={titleClass}>{n.title}</Link>
  ) : (
    <span className={titleClass}>{n.title}</span>
  );

  return (
    <div className={`row notif-row${unread ? " is-unread" : " is-read"}`}>
      <div className="notif-row-main">
        <div className="notif-row-head">
          {title}
          <SeverityMarker severity={n.severity} t={labels.severity} />
        </div>
        {n.body && <p className="text-soft" style={{ margin: "2px 0 0", fontSize: "0.88rem" }}>{n.body}</p>}
        <p className="text-steel" style={{ margin: "3px 0 0", fontSize: "0.76rem" }}>
          {formatRecordTime(asDate(n.createdAt), lang)}
          {unread && (
            <span className="notif-unread-tag">{labels.unread}</span>
          )}
        </p>
      </div>
      {unread && onMarkRead && (
        <button type="button" className="btn btn-ghost notif-mark-read" onClick={() => onMarkRead(n.id)}>
          {labels.markRead}
        </button>
      )}
    </div>
  );
}
