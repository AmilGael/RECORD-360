-- R3 remediation: lifecycle states, request kind/severity, informe archetypes,
-- notification event metadata, project owner. Additive only (new enums +
-- nullable/defaulted columns) — backward compatible; reversible by dropping the
-- columns and types. No new tables → no new RLS statements required.

-- CreateEnum
CREATE TYPE "RequestKind" AS ENUM ('CHANGE', 'ALERT');

-- CreateEnum
CREATE TYPE "RequestSeverity" AS ENUM ('IMPORTANT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "InformeArchetype" AS ENUM ('OWNER', 'SENIOR_MANAGEMENT', 'PERSONAL_FEEDBACK');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('SUCCESS', 'IMPORTANT', 'CRITICAL');

-- AlterTable: Project owner (WS4A). Free text; existing projects keep NULL.
ALTER TABLE "Project" ADD COLUMN "ownerName" TEXT;

-- AlterTable: Partida lifecycle (WS8). Existing partidas remain open (NULL).
ALTER TABLE "Partida" ADD COLUMN "completedAt" TIMESTAMP(3),
                      ADD COLUMN "completedById" TEXT,
                      ADD COLUMN "priorProgressPct" INTEGER;

-- AlterTable: Segment (block) lifecycle (WS4C). Existing blocks remain open.
ALTER TABLE "Segment" ADD COLUMN "closedAt" TIMESTAMP(3),
                      ADD COLUMN "closedById" TEXT;

-- AlterTable: ChangeRequest kind + severity (WS5). DB default backfills existing
-- rows as CHANGE/IMPORTANT; the creation form requires an explicit choice.
ALTER TABLE "ChangeRequest" ADD COLUMN "kind" "RequestKind" NOT NULL DEFAULT 'CHANGE',
                            ADD COLUMN "severity" "RequestSeverity" NOT NULL DEFAULT 'IMPORTANT';

-- AlterTable: Informe archetype (WS7). NULL = legacy report predating archetypes.
ALTER TABLE "Informe" ADD COLUMN "archetype" "InformeArchetype";

-- AlterTable: Notification typed event metadata (WS3). NULL eventKey = legacy row.
ALTER TABLE "Notification" ADD COLUMN "eventKey" TEXT,
                           ADD COLUMN "severity" "NotificationSeverity",
                           ADD COLUMN "projectId" TEXT;

-- CreateIndex: project-scoped notification filtering/search (WS3).
CREATE INDEX "Notification_userId_projectId_createdAt_idx" ON "Notification"("userId", "projectId", "createdAt");
