// Centralized notification event policy (R3 WS3). Every notification-producing
// action goes through notifyEvent() so event names, severities, recipients, and
// links stay consistent. Do NOT scatter ad-hoc `type` strings in actions.
import { Role, NotificationSeverity } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createNotifications, type NewNotification } from "./create";

export const EVENT_KEYS = [
  "block.created",
  "block.closed",
  "block.reopened",
  "partida.created",
  "partida.completed",
  "partida.reopened",
  "partida.deleted",
  "request.created",
  "alert.created",
  "request.resolved",
  "request.rejected",
  "reminder.resolved",
  "user.archived",
] as const;

export type EventKey = (typeof EVENT_KEYS)[number];

// Legacy `type` strings written before eventKey existed, mapped to their
// canonical key. Notification filters must include these aliases.
export const LEGACY_TYPE_ALIASES: Record<string, EventKey> = {
  "cambio.created": "request.created",
  "cambio.resolved": "request.resolved",
};

// Severity semantics (WS3): SUCCESS/green = completed or resolved; IMPORTANT/
// yellow and CRITICAL/red mirror RequestSeverity on unresolved requests/alerts;
// null = informational. Color is never the only carrier — the UI must render a
// text label alongside (see dictionaries `notificationSeverity`).
const DEFAULT_SEVERITY: Partial<Record<EventKey, NotificationSeverity>> = {
  "partida.completed": NotificationSeverity.SUCCESS,
  "block.closed": NotificationSeverity.SUCCESS,
  "request.resolved": NotificationSeverity.SUCCESS,
  "request.rejected": NotificationSeverity.SUCCESS,
  "reminder.resolved": NotificationSeverity.SUCCESS,
};

export type DomainEvent = {
  key: EventKey;
  companyId: string;
  actorId: string;
  projectId?: string | null;
  title: string;
  body?: string | null;
  link?: string | null;
  // Overrides DEFAULT_SEVERITY (e.g. request.created carries the request's own severity).
  severity?: NotificationSeverity | null;
  // Explicit recipients override the default policy (e.g. notify the request author).
  recipientIds?: string[];
};

// Default recipient policy: company ADMIN + MANAGER, plus users assigned to the
// project for project-scoped events. Excludes the actor and disabled users.
// Never crosses companyId. Deduplicated.
export async function resolveRecipients(ev: DomainEvent): Promise<string[]> {
  if (ev.recipientIds) {
    const users = await prisma.user.findMany({
      where: { id: { in: ev.recipientIds }, companyId: ev.companyId, disabledAt: null, NOT: { id: ev.actorId } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  const users = await prisma.user.findMany({
    where: {
      companyId: ev.companyId,
      disabledAt: null,
      NOT: { id: ev.actorId },
      OR: [
        { role: { in: [Role.ADMIN, Role.MANAGER] } },
        ...(ev.projectId ? [{ projectAssignments: { some: { projectId: ev.projectId } } }] : []),
      ],
    },
    select: { id: true },
  });
  return [...new Set(users.map((u) => u.id))];
}

export async function notifyEvent(ev: DomainEvent): Promise<number> {
  const recipients = await resolveRecipients(ev);
  if (recipients.length === 0) return 0;
  const severity = ev.severity !== undefined ? ev.severity : DEFAULT_SEVERITY[ev.key] ?? null;
  const items: NewNotification[] = recipients.map((userId) => ({
    companyId: ev.companyId,
    userId,
    type: ev.key,
    eventKey: ev.key,
    severity,
    projectId: ev.projectId ?? null,
    title: ev.title,
    body: ev.body ?? null,
    link: ev.link ?? null,
  }));
  await createNotifications(items);
  return items.length;
}
