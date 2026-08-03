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
  "informe.ready",
  "informe.failed",
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
  "partida.reopened": NotificationSeverity.SUCCESS,
  "block.reopened": NotificationSeverity.SUCCESS,
  "request.resolved": NotificationSeverity.SUCCESS,
  "request.rejected": NotificationSeverity.SUCCESS,
  "reminder.resolved": NotificationSeverity.SUCCESS,
  // Background informe generation: the requester may have left the page, so
  // these notifications ARE the completion signal. Failure is actionable
  // (retry / fix the account), hence IMPORTANT rather than informational.
  "informe.ready": NotificationSeverity.SUCCESS,
  "informe.failed": NotificationSeverity.IMPORTANT,
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
  // Creation confirmations (partida.created, block.created) must also be
  // visible to the person who performed the action. Every other domain event
  // keeps the anti-noise default of excluding the actor.
  includeActor?: boolean;
};

// Default recipient policy: company ADMIN + MANAGER, plus users assigned to the
// project for project-scoped events. Excludes the actor unless includeActor is
// explicitly requested, and always excludes disabled users.
// Never crosses companyId. Deduplicated.
export async function resolveRecipients(ev: DomainEvent): Promise<string[]> {
  // An explicit recipientIds list is a deliberate decision by the caller ("the
  // registro's author must always hear this"), so it is honored as given. The
  // anti-noise actor filter applies ONLY to the default stakeholder policy
  // below.
  //
  // Applying it here too was a bug: resolveReminder and resolveChangeRequest
  // both union the author into recipientIds precisely so they can never miss
  // the resolution, and that union was silently stripped whenever the author
  // was also the actor — the normal case for a single-admin company, where it
  // meant NO notification was produced at all.
  if (ev.recipientIds) {
    const users = await prisma.user.findMany({
      where: { id: { in: ev.recipientIds }, companyId: ev.companyId, disabledAt: null },
      select: { id: true },
    });
    return [...new Set(users.map((u) => u.id))];
  }
  const actorFilter = ev.includeActor ? {} : { NOT: { id: ev.actorId } };
  const users = await prisma.user.findMany({
    where: {
      companyId: ev.companyId,
      disabledAt: null,
      ...actorFilter,
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
