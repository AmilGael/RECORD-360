-- AlterTable
ALTER TABLE "ChangeRequest" ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "Registro" ADD COLUMN     "replyToId" TEXT;

-- CreateTable
CREATE TABLE "PartidaTag" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartidaTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartidaTagOnPartida" (
    "partidaId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "PartidaTagOnPartida_pkey" PRIMARY KEY ("partidaId","tagId")
);

-- CreateTable
CREATE TABLE "ChangeRequestSegment" (
    "changeRequestId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,

    CONSTRAINT "ChangeRequestSegment_pkey" PRIMARY KEY ("changeRequestId","segmentId")
);

-- CreateIndex
CREATE INDEX "PartidaTag_projectId_idx" ON "PartidaTag"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PartidaTag_projectId_name_key" ON "PartidaTag"("projectId", "name");

-- CreateIndex
CREATE INDEX "PartidaTagOnPartida_tagId_idx" ON "PartidaTagOnPartida"("tagId");

-- CreateIndex
CREATE INDEX "ChangeRequestSegment_segmentId_idx" ON "ChangeRequestSegment"("segmentId");

-- CreateIndex
CREATE INDEX "Registro_replyToId_idx" ON "Registro"("replyToId");

-- AddForeignKey
ALTER TABLE "PartidaTag" ADD CONSTRAINT "PartidaTag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartidaTagOnPartida" ADD CONSTRAINT "PartidaTagOnPartida_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartidaTagOnPartida" ADD CONSTRAINT "PartidaTagOnPartida_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "PartidaTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registro" ADD CONSTRAINT "Registro_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Registro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestSegment" ADD CONSTRAINT "ChangeRequestSegment_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestSegment" ADD CONSTRAINT "ChangeRequestSegment_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
