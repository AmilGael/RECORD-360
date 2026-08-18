# Slice: Cambios Conversación — the PR discussion thread

**Date:** 2026-08-03
**Branch context:** `main` at `455e331` (offline terminal-sync fix merged)
**Status:** Design approved in brainstorming; pending user review of this spec
**Parent thread:** Change Orders as PRs (roadmap NEXT, decided 2026-08-03).
Original Cambios design: `2026-06-04-raphl-cambios-change-orders-design.md`
(this slice ships its deferred "Comments / conversation thread" item).

## Context

Cambios v1 is live with the PR skeleton: `Abierta → Integrada/Rechazada`,
manager gate, seal-on-integrate with marker Registros, kind (Cambio/Alerta) +
severity, mandatory resolution note, reminders, notifications. What is missing
from the pull-request metaphor is the **discussion**: today a request carries
only its opening description and one closing note; the negotiation in between
happens off-platform.

This slice adds an open conversation thread to every change request.
Principle throughout, per the locked canon: **GitHub structure, construction
skin** — the UI surface is **"Conversación"**, never "comments"/"hilo"; no
emoji; monochrome line icons only.

## Decisions (settled in brainstorming, 2026-08-03)

- **Ledger posture:** comments are plain DB rows **outside the seal** and
  outside the hash chains. Append-only by convention (no edit/delete UI or
  actions). The sealed artifact remains the decision content only, exactly as
  a merged PR's hash does not cover its comments.
- **Participants:** **any project member** with access to the obra
  (Residente+, scoped by `projectAccessWhere`) may comment. Role gates remain
  on the decision itself, untouched.
- **Post-resolution:** the thread **stays open** after Integrada/Rechazada —
  like commenting on a merged PR. Late comments cannot touch the frozen,
  sealed decision content.
- **Model shape:** dedicated `ChangeComment` table (approach A). Rejected:
  reusing `Registro` rows (partida-anchored + hash-chained — wrong home for
  chatter we decided lives outside the ledger) and a generic polymorphic
  `Comment` table (nothing else needs it; polymorphic FKs forfeit referential
  integrity — YAGNI).

## Non-Goals

- Attachments on comments — evidence belongs on the request itself.
- Editing or deleting comments — append-only by convention.
- Threaded replies / reactions / mentions — flat chronological thread v1.
- Locking a thread; any moderation tooling.
- Pre-authorization state, edit-while-Abierta, sealed-change-order PDF —
  siblings in the Change Orders arc, each its own future slice.

## Schema (additive migration — no reset)

```prisma
model ChangeComment {
  id              String        @id @default(cuid())
  changeRequestId String
  changeRequest   ChangeRequest @relation(fields: [changeRequestId], references: [id], onDelete: Cascade)
  authorId        String        // no User relation, consistent with Registro/ChangeRequest
  text            String
  createdAt       DateTime      @default(now())

  @@index([changeRequestId, createdAt])
}
```

`ChangeRequest` gains `comments ChangeComment[]`. Purely additive.

**RLS:** the hand-written migration MUST include
`ALTER TABLE "ChangeComment" ENABLE ROW LEVEL SECURITY;` (deny-all posture —
every public table carries it). Reminder: `prisma migrate dev` is broken
repo-wide; author the migration by hand and apply with `migrate deploy`.

## Validation

`web/src/lib/cambios/validate.ts` gains `parseCommentText(v: unknown)`:
required, trimmed, non-empty, **max 2000 chars**; returns the parsed string or
a typed error, same style as `parseResolutionNote`. Pure, unit-tested first.

## Server action

`createChangeComment(prev, formData)` in `web/src/app/actions/cambios.ts`,
returning the structured `{ ok, error }` shape used with `useActionState`
(field values preserved on error; reset only on success).

Guards, in order:
1. Authenticated user.
2. CR fetched tenant-scoped: `changeRequest.findFirst` where the project
   matches `projectAccessWhere(user)` — cross-tenant and unassigned-project
   access both come back null → error, no existence leak.
3. **Archived-obra revocation:** per R1, RESIDENT/SUPERVISOR lose read AND
   write access to archived obras entirely, so they never reach the thread;
   posting additionally follows the same archived-obra write gate the other
   cambios/registro write actions use for the roles that retain access
   (reuse the existing helper; do not invent a new gate).
4. `parseCommentText` on the body.
5. Any status accepted — Abierta and resolved threads both take comments.

On success: insert the `ChangeComment`, emit the notification event, and
`revalidatePath` the detail page.

## Notifications

New domain event `"cambio.comment"` in `web/src/lib/notifications/events.ts`,
following the existing map convention (`"cambio.created": "request.created"`,
…). Recipients: the request author plus every distinct prior commenter on the
thread, **always excluding the poster**. Delivered via the existing
`notifyEvent`/`createNotifications` pipeline; severity and body copy follow
the current cambios notification conventions (body carries the CR code +
title and a comment excerpt).

## UI

- **Detail page** (`/app/projects/[id]/cambios/[crId]`): a **"Conversación"**
  section under the request fields — chronological list (author name resolved
  via the existing company-scoped `user.findFirst` pattern used for
  `resolvedById`, relative time, text) and a composer (textarea + submit) at
  the bottom for members with write access. Viewers who retain access to an
  archived obra but cannot write to it see the thread without the composer.
  Empty state: a quiet one-liner, not a card.
- **Cambios list** (`?tab=cambios`): each row gains a comment count rendered
  with a monochrome line icon added to `web/src/components/icons.tsx`
  (speech-bubble outline, stroke-consistent with the set). Count comes from
  `_count.comments` in the existing list query — no N+1.
- **i18n:** new `changes.conversation.*` strings in
  `web/src/i18n/dictionaries.ts` — ES: `title: "Conversación"`,
  `placeholder`, `send: "Comentar"`, `empty`, error strings; EN mirrors.
  ES/EN shapes stay in sync (the `Dict` type derives from `es`). No dev
  jargon in any label.

## Error handling

- Validation failure → inline message under the composer, draft text
  preserved (structured result, not a throw).
- Access failures → the action returns the generic error result; the page's
  tenant-scoped fetch already 404s foreign visitors.
- Notification fan-out failures are best-effort and never fail the comment
  write (consistent with existing sendBestEffort semantics).

## Testing (TDD, test-first)

Unit:
- `parseCommentText`: rejects empty/whitespace, trims, rejects >2000 chars,
  accepts a normal body.

DB integration (extend the cambios suite):
- Comment persists and lists in `createdAt` order under its CR.
- Cross-tenant CR: action rejects; no row written.
- A Residente project member can comment (no manager gate).
- Commenting on a resolved (Integrada) CR succeeds — thread stays open.
- Notification recipients = request author + prior commenters − poster
  (poster never notified; no duplicates).
- Archived obra: posting refused per the existing archived-obra write gate
  (and RESIDENT/SUPERVISOR access refused outright, per R1).
- Cascade: deleting a CR (purge path) removes its comments.

UI verified via `tsc`, `npm run lint`, `npm run build`, and a manual pass:
post from two roles, confirm ordering + author names, count on the list row,
notification lands for the author, ES⇄EN toggle, no emoji anywhere.

## Verification

`npm test` all green, lint + build clean, manual pass above, and the existing
seal/chain tests untouched and green — proving the thread stayed outside the
ledger.
