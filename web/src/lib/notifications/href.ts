// Query-string builder for /app/notifications. Pager links preserve every
// filter plus the other section's page; the filter form omits `up`/`rp` so a
// submit resets both to page 1. The legacy `page` param is never written.

export type NotificationQuery = {
  q?: string;
  status?: string;
  projectId?: string;
  type?: string;
  severity?: string;
  from?: string;
  to?: string;
  up?: number;
  rp?: number;
};

export function notificationsHref(q: NotificationQuery): string {
  const params = new URLSearchParams();
  if (q.q) params.set("q", q.q);
  if (q.status) params.set("status", q.status);
  if (q.projectId) params.set("projectId", q.projectId);
  if (q.type) params.set("type", q.type);
  if (q.severity) params.set("severity", q.severity);
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  if (q.up && q.up > 1) params.set("up", String(q.up));
  if (q.rp && q.rp > 1) params.set("rp", String(q.rp));
  const s = params.toString();
  return s ? `/app/notifications?${s}` : "/app/notifications";
}
