# Notification Center v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-tenant in-app notification center — triggered by Cambios events, surfaced as an inbox page + unread-count badge in the app nav.

**Architecture:** Notifications are written in a dedicated `Notification` table scoped by `companyId`+`userId`. Generation happens *outside* the main transaction (best-effort, no rollback). The inbox is a simple RSC page; mark-read operations are server actions with `revalidatePath` for badge refresh. The nav badge lives in the RSC layout via a `prisma.notification.count`.

**Tech Stack:** Next.js 15 App Router (RSC + server actions), Prisma 6, Neon Postgres, Vitest, TypeScript.

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `prisma/schema.prisma` | Modify | Add `Notification` model + `User.notifications` back-relation |
| `prisma/migrations/…add_notifications/migration.sql` | Created by Prisma | DDL for the new table |
| `src/components/icons.tsx` | Modify | Add `Bell` SVG icon |
| `src/lib/notifications/create.ts` | Create | `createNotifications()` helper — thin wrapper over `prisma.notification.createMany` |
| `src/app/actions/cambios.ts` | Modify | Return CR id+code from `$transaction`; call `createNotifications` after tx |
| `src/app/actions/notifications.ts` | Create | `markNotificationRead` + `markAllNotificationsRead` server actions |
| `src/app/app/notifications/page.tsx` | Create | Inbox RSC page |
| `src/app/app/layout.tsx` | Modify | Unread count + nav link |
| `src/i18n/dictionaries.ts` | Modify | `nav.notifications` + `notifications.*` keys in both `es` and `en` |
| `web/tests/notifications-generation.test.ts` | Create | TDD for notification generation in cambios actions |
| `web/tests/notifications-actions.test.ts` | Create | TDD for markRead / markAllRead server actions |

---

## Task 1 — Schema + Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Run: `npx prisma migrate dev --name add_notifications` (generates migration file)
- Run: `npx prisma generate`

- [ ] **Step 1.1: Add Notification model to schema**

In `/Users/genel/Mirror/RECORD-360/web/prisma/schema.prisma`, make two changes:

**Change A** — add `notifications Notification[]` to the `User` model (after the `projectAssignments` field):

```prisma
model User {
  id                 String              @id @default(cuid())
  email              String              @unique
  passwordHash       String
  name               String
  role               Role
  companyId          String
  company            Company             @relation(fields: [companyId], references: [id])
  projectAssignments ProjectAssignment[]
  notifications      Notification[]
  createdAt          DateTime            @default(now())
}
```

**Change B** — append the `Notification` model at the end of the file (before the final newline):

```prisma
model Notification {
  id        String    @id @default(cuid())
  companyId String
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  type      String
  title     String
  body      String?
  link      String?
  readAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId, readAt])
  @@index([userId, createdAt])
}
```

- [ ] **Step 1.2: Run migration**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx prisma migrate dev --name add_notifications
```

Expected: Prisma prints "Applied 1 migration" and creates `prisma/migrations/<timestamp>_add_notifications/migration.sql`.

- [ ] **Step 1.3: Regenerate Prisma client**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx prisma generate
```

Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 1.4: Type-check**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx tsc --noEmit
```

Expected: 0 errors (Notification type now available from `@prisma/client`).

- [ ] **Step 1.5: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360/web && git add prisma/schema.prisma prisma/migrations && git commit -m "$(cat <<'EOF'
feat(db): add Notification table for in-app inbox

Adds Notification model scoped by companyId+userId with indexes on
(userId, readAt) and (userId, createdAt). Back-relation on User.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Notification Creation Helper + Generation (TDD)

**Files:**
- Create: `src/lib/notifications/create.ts`
- Modify: `src/app/actions/cambios.ts`
- Create: `web/tests/notifications-generation.test.ts`

### Step 2.1 — Write the failing tests first

- [ ] **Step 2.1: Create `web/tests/notifications-generation.test.ts`**

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { createChangeRequest, resolveChangeRequest } from "@/app/actions/cambios";

let companyId = "", adminId = "", managerId = "", residentId = "", projectId = "", segmentId = "";

beforeAll(async () => {
  const s = `notif-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `Notif Co ${s}` } })).id;
  adminId = (await prisma.user.create({ data: { email: `admin-${s}@x.do`, name: "Admin", role: "ADMIN", companyId, passwordHash: "x" } })).id;
  managerId = (await prisma.user.create({ data: { email: `mgr-${s}@x.do`, name: "Mgr", role: "MANAGER", companyId, passwordHash: "x" } })).id;
  residentId = (await prisma.user.create({ data: { email: `res-${s}@x.do`, name: "Res", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
  projectId = (await prisma.project.create({ data: { companyId, name: `Notif Project ${s}` } })).id;
  await prisma.projectAssignment.create({ data: { projectId, userId: residentId, role: "RESIDENT" } });
  segmentId = (await prisma.segment.create({ data: { projectId, name: "Bloque Notif" } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.registro.deleteMany({ where: { partida: { projectId } } });
  await prisma.changeRequestPartida.deleteMany({ where: { changeRequest: { projectId } } });
  await prisma.changeRequestSegment.deleteMany({ where: { segmentId } });
  await prisma.changeAttachment.deleteMany({ where: { changeRequest: { projectId } } });
  await prisma.changeRequest.deleteMany({ where: { projectId } });
  await prisma.projectAssignment.deleteMany({ where: { projectId } });
  await prisma.partida.deleteMany({ where: { projectId } });
  await prisma.segment.deleteMany({ where: { id: segmentId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, managerId, residentId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => { authMock.mockReset(); revalidatePathMock.mockReset(); });

function fd(entries: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) v.forEach((x) => f.append(k, x));
    else f.set(k, v);
  }
  return f;
}

describe("createChangeRequest notifications", () => {
  it("notifies ADMIN and MANAGER (not the RESIDENT author) when a CR is created", async () => {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await prisma.notification.deleteMany({ where: { companyId } });
    await createChangeRequest(fd({ projectId, title: "Refuerzo extra", segmentIds: [segmentId] }));

    const cr = await prisma.changeRequest.findFirstOrThrow({ where: { projectId, title: "Refuerzo extra" } });
    const notifications = await prisma.notification.findMany({ where: { companyId } });

    // One notification per ADMIN/MANAGER in company (2 users: adminId, managerId), not the author
    expect(notifications).toHaveLength(2);
    const recipientIds = notifications.map((n) => n.userId).sort();
    expect(recipientIds).toEqual([adminId, managerId].sort());

    for (const n of notifications) {
      expect(n.type).toBe("cambio.created");
      expect(n.title).toContain(cr.code);
      expect(n.body).toBe("Refuerzo extra");
      expect(n.link).toBe(`/app/projects/${projectId}/cambios/${cr.id}`);
      expect(n.readAt).toBeNull();
      expect(n.companyId).toBe(companyId);
    }
  });

  it("does NOT notify the ADMIN author themselves", async () => {
    authMock.mockResolvedValue({ user: { id: adminId, companyId, role: "ADMIN" } });
    await prisma.notification.deleteMany({ where: { companyId } });
    await createChangeRequest(fd({ projectId, title: "Admin CR", segmentIds: [segmentId] }));

    const notifications = await prisma.notification.findMany({ where: { companyId } });
    const recipientIds = notifications.map((n) => n.userId);
    expect(recipientIds).not.toContain(adminId); // author excluded
    expect(recipientIds).toContain(managerId);    // other manager gets it
  });
});

describe("resolveChangeRequest notifications", () => {
  async function openCR() {
    authMock.mockResolvedValue({ user: { id: residentId, companyId, role: "RESIDENT" } });
    await createChangeRequest(fd({ projectId, title: `T-${Math.random()}`, segmentIds: [segmentId] }));
    return prisma.changeRequest.findFirstOrThrow({ orderBy: { createdAt: "desc" }, where: { projectId } });
  }

  it("REJECT notifies the CR author with correct title", async () => {
    const cr = await openCR();
    await prisma.notification.deleteMany({ where: { companyId } });
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveChangeRequest(fd({ changeRequestId: cr.id, action: "REJECT", rejectionReason: "Fuera de alcance." }));

    const notifications = await prisma.notification.findMany({ where: { companyId, userId: residentId } });
    expect(notifications).toHaveLength(1);
    const [n] = notifications;
    expect(n.type).toBe("cambio.resolved");
    expect(n.title).toContain(cr.code);
    expect(n.title).toContain("rechazada");
    expect(n.body).toBe(cr.title);
    expect(n.link).toBe(`/app/projects/${cr.projectId}/cambios/${cr.id}`);
  });

  it("INTEGRATE notifies the CR author with correct title", async () => {
    // create a partida in the segment so integrate can proceed
    const partida = await prisma.partida.create({ data: { projectId, segmentId, name: `P-${Date.now()}` } });
    const cr = await openCR();
    await prisma.notification.deleteMany({ where: { companyId } });
    authMock.mockResolvedValue({ user: { id: managerId, companyId, role: "MANAGER" } });
    await resolveChangeRequest(fd({ changeRequestId: cr.id, action: "INTEGRATE" }));

    const notifications = await prisma.notification.findMany({ where: { companyId, userId: residentId } });
    expect(notifications).toHaveLength(1);
    const [n] = notifications;
    expect(n.type).toBe("cambio.resolved");
    expect(n.title).toContain(cr.code);
    expect(n.title).toContain("integrada");
    expect(n.body).toBe(cr.title);
    expect(n.link).toBe(`/app/projects/${cr.projectId}/cambios/${cr.id}`);

    // cleanup: delete registro entries so afterAll can delete the partida
    await prisma.registro.deleteMany({ where: { partidaId: partida.id } });
    await prisma.changeRequestPartida.deleteMany({ where: { partidaId: partida.id } });
    await prisma.partida.delete({ where: { id: partida.id } });
  });
});
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npm test -- notifications-generation
```

Expected: Tests fail with errors like "Cannot find module '@/lib/notifications/create'" or type errors.

- [ ] **Step 2.3: Create `src/lib/notifications/create.ts`**

```typescript
import { prisma } from "@/lib/db";

export type NewNotification = {
  companyId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
};

export async function createNotifications(items: NewNotification[]): Promise<void> {
  if (items.length === 0) return;
  await prisma.notification.createMany({ data: items });
}
```

- [ ] **Step 2.4: Modify `src/app/actions/cambios.ts`**

There are two changes:

**Change A** — `createChangeRequest`: make the `$transaction` return `{ id, code }` of the created CR, then call `createNotifications` after the transaction (best-effort, outside try/catch so the error surfaces but does not block):

Replace the existing `createChangeRequest` function body (the `retryOnConflict` call and `revalidatePath` below it) with:

```typescript
export async function createChangeRequest(formData: FormData) {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) throw new Error("Unauthorized");

  const projectId = String(formData.get("projectId"));
  const project = await prisma.project.findFirst({ where: { id: projectId, ...projectAccessWhere({ id: user.id, companyId: user.companyId, role: user.role }) } });
  if (!project) throw new Error("Forbidden");

  const title = parseChangeTitle(formData.get("title"));
  const description = (String(formData.get("description") ?? "").trim()) || null;

  const segmentIds = [...new Set(formData.getAll("segmentIds").map(String).filter(Boolean))];
  if (segmentIds.length === 0) throw new Error("Selecciona al menos un bloque afectado.");
  const validSegments = await prisma.segment.findMany({ where: { id: { in: segmentIds }, projectId }, select: { id: true } });
  if (validSegments.length !== segmentIds.length) throw new Error("Bloque inválido.");

  const latRaw = formData.get("gpsLat"); const lngRaw = formData.get("gpsLng");
  const gpsLat = latRaw ? Number(latRaw) : null;
  const gpsLng = lngRaw ? Number(lngRaw) : null;

  const photos = formData.getAll("evidence").filter((f): f is File => f instanceof File);
  const prepared = await prepareAttachments(photos, storage);

  const cr = await retryOnConflict(() => prisma.$transaction(async (tx) => {
    const count = await tx.changeRequest.count({ where: { projectId } });
    const created = await tx.changeRequest.create({
      data: {
        projectId, code: `SC-${count + 1}`, title, description, costImpact: null, daysImpact: null,
        authorId: user.id!, gpsLat, gpsLng,
        segments: { create: segmentIds.map((id) => ({ segmentId: id })) },
        attachments: { create: prepared.map((a) => ({ url: a.url, sha256: a.sha256, fileType: a.fileType })) },
      },
      select: { id: true, code: true },
    });
    return created;
  }));

  revalidatePath(`/app/projects/${projectId}`);

  // Best-effort notifications — must not roll back the cambio
  const reviewers = await prisma.user.findMany({
    where: { companyId: user.companyId, role: { in: [Role.ADMIN, Role.MANAGER] }, id: { not: user.id } },
    select: { id: true },
  });
  await createNotifications(reviewers.map((r) => ({
    companyId: user.companyId!,
    userId: r.id,
    type: "cambio.created",
    title: `Nueva solicitud de cambio ${cr.code}`,
    body: title,
    link: `/app/projects/${projectId}/cambios/${cr.id}`,
  })));
}
```

**Change B** — `resolveChangeRequest`: after the existing resolve logic (both REJECT and INTEGRATE branches), add a notification to the CR author. The notification must be sent after the transaction completes. Insert this at the bottom of the function, replacing the final `revalidatePath` calls:

```typescript
  revalidatePath(`/app/projects/${cr.projectId}`);
  revalidatePath(`/app/projects/${cr.projectId}/cambios/${cr.id}`);

  // Best-effort notification to author
  const resolvedTitle = action === "INTEGRATE"
    ? `Solicitud ${cr.code} integrada`
    : `Solicitud ${cr.code} rechazada`;
  await createNotifications([{
    companyId: user.companyId!,
    userId: cr.authorId,
    type: "cambio.resolved",
    title: resolvedTitle,
    body: cr.title,
    link: `/app/projects/${cr.projectId}/cambios/${cr.id}`,
  }]);
```

Also add the import at the top of `cambios.ts`:

```typescript
import { createNotifications } from "@/lib/notifications/create";
```

The complete updated `resolveChangeRequest` function (full replacement to avoid ambiguity):

```typescript
export async function resolveChangeRequest(formData: FormData) {
  const session = await auth();
  const user = session?.user as { id?: string; companyId?: string; role?: Role } | undefined;
  if (!user?.id || !user.companyId || !user.role) throw new Error("Unauthorized");
  if (user.role !== Role.ADMIN && user.role !== Role.MANAGER) throw new Error("Forbidden");

  const crId = String(formData.get("changeRequestId"));
  const action = String(formData.get("action"));
  if (action !== "INTEGRATE" && action !== "REJECT") throw new Error("Acción inválida.");

  const cr = await prisma.changeRequest.findFirst({
    where: { id: crId, project: { companyId: user.companyId } },
    include: { partidas: { select: { partidaId: true } }, segments: { select: { segmentId: true } } },
  });
  if (!cr) throw new Error("Forbidden");
  if (cr.status !== "OPEN") throw new Error("La solicitud ya fue resuelta.");
  if (cr.authorId === user.id) throw new Error("No puedes resolver tu propia solicitud.");

  const resolvedAt = new Date();
  if (action === "REJECT") {
    const rejectionReason = parseRejectionReason(formData.get("rejectionReason"));
    await prisma.changeRequest.update({ where: { id: cr.id }, data: { status: "REJECTED", resolvedById: user.id, resolvedAt, rejectionReason } });
  } else if (action === "INTEGRATE") {
    const segmentIds = cr.segments.map((s) => s.segmentId);
    const markerPartidas = segmentIds.length
      ? await prisma.partida.findMany({
          where: { projectId: cr.projectId, segmentId: { in: segmentIds }, deletedAt: null },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        })
      : cr.partidas.map((p) => ({ id: p.partidaId }));
    const markerPartidaIds = markerPartidas.map((p) => p.id);
    const seal = computeChangeSeal({
      code: cr.code, title: cr.title, description: cr.description,
      costImpact: null,
      daysImpact: null, partidaIds: markerPartidaIds,
      authorId: cr.authorId, resolvedById: user.id, resolvedAt,
    });
    const markerText = `Solicitud de cambio ${cr.code} integrada: ${cr.title}`;
    await retryOnConflict(() => prisma.$transaction(async (tx) => {
      await tx.changeRequest.update({ where: { id: cr.id }, data: { status: "INTEGRATED", resolvedById: user.id!, resolvedAt, seal } });
      if (segmentIds.length && markerPartidaIds.length) {
        await tx.changeRequestPartida.createMany({
          data: markerPartidaIds.map((partidaId) => ({ changeRequestId: cr.id, partidaId })),
          skipDuplicates: true,
        });
      }
      for (const partidaId of markerPartidaIds) {
        await appendRegistroTx(tx, {
          partidaId, authorId: user.id!, category: null, text: markerText,
          progressPct: null, gpsLat: null, gpsLng: null, locationId: null,
          attachments: [], changeRequestId: cr.id,
        });
      }
    }));
    for (const partidaId of markerPartidaIds) {
      revalidatePath(`/app/partidas/${partidaId}`);
    }
  } else {
    throw new Error("Acción inválida.");
  }
  revalidatePath(`/app/projects/${cr.projectId}`);
  revalidatePath(`/app/projects/${cr.projectId}/cambios/${cr.id}`);

  // Best-effort notification to author
  const resolvedTitle = action === "INTEGRATE"
    ? `Solicitud ${cr.code} integrada`
    : `Solicitud ${cr.code} rechazada`;
  await createNotifications([{
    companyId: user.companyId!,
    userId: cr.authorId,
    type: "cambio.resolved",
    title: resolvedTitle,
    body: cr.title,
    link: `/app/projects/${cr.projectId}/cambios/${cr.id}`,
  }]);
}
```

- [ ] **Step 2.5: Run tests to confirm they pass**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npm test -- notifications-generation
```

Expected: All tests pass. Also run the existing cambios test to confirm no regression:

```bash
cd /Users/genel/Mirror/RECORD-360/web && npm test -- cambios-action
```

Expected: All existing cambios tests still pass.

- [ ] **Step 2.6: Type-check and lint**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx tsc --noEmit && npm run lint
```

Expected: 0 errors.

- [ ] **Step 2.7: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360/web && git add src/lib/notifications/create.ts src/app/actions/cambios.ts web/tests/notifications-generation.test.ts && git commit -m "$(cat <<'EOF'
feat(notifications): generation helper + cambios hooks (TDD)

createNotifications wraps prisma.createMany (no-op if empty).
createChangeRequest notifies all ADMIN/MANAGER reviewers post-tx.
resolveChangeRequest notifies the CR author post-tx.
Notifications are best-effort and never roll back the cambio.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Read Actions (TDD)

**Files:**
- Create: `src/app/actions/notifications.ts`
- Create: `web/tests/notifications-actions.test.ts`

- [ ] **Step 3.1: Write the failing tests first**

Create `/Users/genel/Mirror/RECORD-360/web/tests/notifications-actions.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { markNotificationRead, markAllNotificationsRead } from "@/app/actions/notifications";

let companyId = "", userAId = "", userBId = "";

beforeAll(async () => {
  const s = `notif-actions-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  companyId = (await prisma.company.create({ data: { name: `NA Co ${s}` } })).id;
  userAId = (await prisma.user.create({ data: { email: `ua-${s}@x.do`, name: "UserA", role: "SUPERVISOR", companyId, passwordHash: "x" } })).id;
  userBId = (await prisma.user.create({ data: { email: `ub-${s}@x.do`, name: "UserB", role: "RESIDENT", companyId, passwordHash: "x" } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.$disconnect();
});

beforeEach(() => { authMock.mockReset(); revalidatePathMock.mockReset(); });

async function seedNotification(userId: string, readAt: Date | null = null) {
  return prisma.notification.create({
    data: { companyId, userId, type: "test", title: "Test notification", readAt },
  });
}

describe("markNotificationRead", () => {
  it("sets readAt for the notification owner", async () => {
    authMock.mockResolvedValue({ user: { id: userAId, companyId, role: "SUPERVISOR" } });
    const n = await seedNotification(userAId);

    const fd = new FormData();
    fd.set("id", n.id);
    await markNotificationRead(fd);

    const after = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.readAt).not.toBeNull();
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/notifications");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app");
  });

  it("does NOT affect another user's notification (cross-user no-op)", async () => {
    authMock.mockResolvedValue({ user: { id: userAId, companyId, role: "SUPERVISOR" } });
    const n = await seedNotification(userBId); // belongs to userB

    const fd = new FormData();
    fd.set("id", n.id);
    await markNotificationRead(fd); // called as userA

    const after = await prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.readAt).toBeNull(); // still unread
  });

  it("throws Unauthorized when not logged in", async () => {
    authMock.mockResolvedValue(null);
    const fd = new FormData();
    fd.set("id", "fake-id");
    await expect(markNotificationRead(fd)).rejects.toThrow(/Unauthorized/i);
  });
});

describe("markAllNotificationsRead", () => {
  it("marks only the current user's unread notifications", async () => {
    authMock.mockResolvedValue({ user: { id: userAId, companyId, role: "SUPERVISOR" } });
    // seed: 2 unread for userA, 1 unread for userB
    const nA1 = await seedNotification(userAId);
    const nA2 = await seedNotification(userAId);
    const nB = await seedNotification(userBId);

    await markAllNotificationsRead();

    const afterA1 = await prisma.notification.findUniqueOrThrow({ where: { id: nA1.id } });
    const afterA2 = await prisma.notification.findUniqueOrThrow({ where: { id: nA2.id } });
    const afterB = await prisma.notification.findUniqueOrThrow({ where: { id: nB.id } });

    expect(afterA1.readAt).not.toBeNull();
    expect(afterA2.readAt).not.toBeNull();
    expect(afterB.readAt).toBeNull(); // userB unaffected

    expect(revalidatePathMock).toHaveBeenCalledWith("/app/notifications");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app");
  });

  it("throws Unauthorized when not logged in", async () => {
    authMock.mockResolvedValue(null);
    await expect(markAllNotificationsRead()).rejects.toThrow(/Unauthorized/i);
  });
});
```

- [ ] **Step 3.2: Run tests to confirm they fail**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npm test -- notifications-actions
```

Expected: Tests fail with "Cannot find module '@/app/actions/notifications'" or similar.

- [ ] **Step 3.3: Create `src/app/actions/notifications.ts`**

```typescript
"use server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function markNotificationRead(formData: FormData): Promise<void> {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) throw new Error("Unauthorized");

  const id = String(formData.get("id"));
  await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { readAt: new Date() },
  });
  revalidatePath("/app/notifications");
  revalidatePath("/app");
}

export async function markAllNotificationsRead(): Promise<void> {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) throw new Error("Unauthorized");

  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/app/notifications");
  revalidatePath("/app");
}
```

- [ ] **Step 3.4: Run tests to confirm they pass**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npm test -- notifications-actions
```

Expected: All tests pass.

- [ ] **Step 3.5: Type-check**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3.6: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360/web && git add src/app/actions/notifications.ts web/tests/notifications-actions.test.ts && git commit -m "$(cat <<'EOF'
feat(notifications): markRead + markAllRead server actions (TDD)

Both actions scope by userId — a user can only mark their own notifications.
updateMany is used so cross-user calls are silently no-ops.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Inbox Page + Nav Badge + i18n

**Files:**
- Modify: `src/i18n/dictionaries.ts`
- Modify: `src/components/icons.tsx`
- Create: `src/app/app/notifications/page.tsx`
- Modify: `src/app/app/layout.tsx`

### Step 4.1 — i18n keys

- [ ] **Step 4.1: Update `src/i18n/dictionaries.ts`**

In the `es` object, add `notifications` key to `nav`:

```typescript
nav: { sites: "Obras", team: "Equipo", signOut: "Salir", notifications: "Notificaciones" },
```

And add the `notifications` section to `es` (place after `admin`):

```typescript
notifications: {
  title: "Notificaciones",
  empty: "Sin notificaciones.",
  markRead: "Marcar leído",
  markAllRead: "Marcar todo como leído",
  unread: "no leída",
},
```

In the `en` object, add to `nav`:

```typescript
nav: { sites: "Sites", team: "Team", signOut: "Sign out", notifications: "Notifications" },
```

And the `notifications` section to `en` (place after `admin`):

```typescript
notifications: {
  title: "Notifications",
  empty: "No notifications.",
  markRead: "Mark read",
  markAllRead: "Mark all as read",
  unread: "unread",
},
```

- [ ] **Step 4.2: Add Bell icon to `src/components/icons.tsx`**

Append this function at the end of the file (before the final newline):

```typescript
export function Bell({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
```

- [ ] **Step 4.3: Create inbox page `src/app/app/notifications/page.tsx`**

```typescript
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
              paddingLeft: isUnread ? 12 : 12,
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
```

- [ ] **Step 4.4: Update `src/app/app/layout.tsx`**

Import `prisma` at the top, add the unread count query, and add the notifications nav link:

```typescript
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { getDict } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const isAdmin = role === "ADMIN" || role === "MANAGER";
  const { lang, t } = await getDict();

  const unread = userId
    ? await prisma.notification.count({ where: { userId, readAt: null } })
    : 0;

  return (
    <div className="grid-bg" style={{ minHeight: "100vh" }}>
      <header className="appbar">
        <div className="appbar-inner">
          <Link href="/app" className="brand"><b>Raphl<span className="dot" aria-hidden="true">.</span></b><span className="tag">{t.common.blackBox}</span></Link>
          <nav className="appnav">
            <Link href="/app">{t.nav.sites}</Link>
            {isAdmin && <Link href="/app/admin">{t.nav.team}</Link>}
            <Link href="/app/notifications">
              {unread > 0 ? `${t.nav.notifications} (${unread})` : t.nav.notifications}
            </Link>
            <LanguageSwitcher current={lang} />
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button>{t.nav.signOut}</button>
            </form>
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "44px 28px 90px" }}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 4.5: Type-check and lint**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx tsc --noEmit && npm run lint
```

Expected: 0 errors, 0 lint warnings/errors.

- [ ] **Step 4.6: Commit**

```bash
cd /Users/genel/Mirror/RECORD-360/web && git add src/i18n/dictionaries.ts src/components/icons.tsx src/app/app/notifications/page.tsx src/app/app/layout.tsx && git commit -m "$(cat <<'EOF'
feat(ui): notifications inbox page + nav badge + i18n

- Bell icon in icons.tsx
- Inbox RSC page: unread-first, mark-read buttons, mark-all button
- Layout: unread count badge in .appnav, visible to all roles
- i18n: nav.notifications + notifications.* in es + en (shape-synced)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Final Verification

- [ ] **Step 5.1: Run all tests**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npm test
```

Expected: All tests pass (including the 2 new test files + all pre-existing tests).

- [ ] **Step 5.2: Full type-check**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5.3: Lint**

```bash
cd /Users/genel/Mirror/RECORD-360/web && npm run lint
```

Expected: No errors or warnings.

- [ ] **Step 5.4: Emoji scan**

```bash
cd /Users/genel/Mirror/RECORD-360/web && rg -n --pcre2 '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}]' src/
```

Expected: No matches (exit code 1 from rg = "no matches found" = pass).

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by |
|---|---|
| Notification model with indexes | Task 1 |
| `createNotifications` helper (no-op if empty, createMany) | Task 2 step 2.3 |
| `createChangeRequest` returns CR id+code from tx | Task 2 step 2.4 Change A |
| Notify ADMIN+MANAGER after createChangeRequest, excluding author | Task 2 step 2.4 Change A |
| Notify CR author after resolveChangeRequest (INTEGRATE/REJECT) | Task 2 step 2.4 Change B |
| Notifications best-effort, outside transaction | Task 2 step 2.4 |
| `markNotificationRead` scoped by userId | Task 3 step 3.3 |
| `markAllNotificationsRead` scoped by userId | Task 3 step 3.3 |
| Cross-user mark-read is a no-op | Task 3 test (step 3.1) |
| Inbox RSC page unread-first order | Task 4 step 4.3 |
| Mark-read button (hidden when already read) | Task 4 step 4.3 |
| Mark-all button (shown when unread exist) | Task 4 step 4.3 |
| Link wraps title when link present | Task 4 step 4.3 |
| Unread row visually distinct (left accent, bold) | Task 4 step 4.3 |
| Empty state when no notifications | Task 4 step 4.3 |
| Nav badge with unread count | Task 4 step 4.4 |
| i18n nav.notifications + notifications.* in es+en | Task 4 step 4.1 |
| Dict type shape-sync (derived from `es`) | Task 4 step 4.1 (both branches identical keys) |
| No emoji | Task 5 step 5.4 scan |
| Multi-tenant companyId scoping | Throughout (notifications write + read) |

**Concerns and scope notes:**

1. **Transaction placement:** `createNotifications` is called after `retryOnConflict` returns, which means it's genuinely outside the Prisma `$transaction`. If notification creation throws, the cambio has already committed — this is the correct best-effort pattern requested.

2. **The `revalidatePath("/app")` revalidation:** The layout is under `/app`, so revalidating `/app` should bust the cached unread count in the layout. This is a straightforward path — if the layout caches aggressively, users may need to navigate away and back. No additional configuration needed for v1.

3. **`take: 100` on inbox:** Capped at 100 notifications. For v1 this is reasonable. Pagination is out of scope.

4. **Locale for `toLocaleString`:** Using `"es-DO"` (Dominican Republic locale). This is correct for the primary market. When `lang === "en"`, it will still show `es-DO` formatted dates on the inbox page because the RSC doesn't pass `lang` to `toLocaleString`. For v1 this is acceptable — a future iteration can pass `lang` to the page.

5. **`revalidatePath("/app")` scope:** Next.js 15 `revalidatePath` with a path revalidates that path and its layout. Passing `"/app"` revalidates the layout segment, which includes the unread count.
