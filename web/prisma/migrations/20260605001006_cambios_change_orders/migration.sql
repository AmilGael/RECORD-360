-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('OPEN', 'INTEGRATED', 'REJECTED');

-- AlterTable
ALTER TABLE "Registro" ADD COLUMN     "changeRequestId" TEXT;

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "costImpact" DECIMAL(12,2),
    "daysImpact" INTEGER,
    "status" "ChangeStatus" NOT NULL DEFAULT 'OPEN',
    "authorId" TEXT NOT NULL,
    "gpsLat" DECIMAL(9,6),
    "gpsLng" DECIMAL(9,6),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "seal" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequestPartida" (
    "changeRequestId" TEXT NOT NULL,
    "partidaId" TEXT NOT NULL,

    CONSTRAINT "ChangeRequestPartida_pkey" PRIMARY KEY ("changeRequestId","partidaId")
);

-- CreateTable
CREATE TABLE "ChangeAttachment" (
    "id" TEXT NOT NULL,
    "changeRequestId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "fileType" "AttachmentType" NOT NULL,

    CONSTRAINT "ChangeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeRequest_projectId_status_idx" ON "ChangeRequest"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeRequest_projectId_code_key" ON "ChangeRequest"("projectId", "code");

-- CreateIndex
CREATE INDEX "ChangeAttachment_changeRequestId_idx" ON "ChangeAttachment"("changeRequestId");

-- AddForeignKey
ALTER TABLE "Registro" ADD CONSTRAINT "Registro_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestPartida" ADD CONSTRAINT "ChangeRequestPartida_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestPartida" ADD CONSTRAINT "ChangeRequestPartida_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeAttachment" ADD CONSTRAINT "ChangeAttachment_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
