-- CreateEnum
CREATE TYPE "RegistroCategory" AS ENUM ('MATERIALES', 'PROCESOS', 'EVENTUALIDADES', 'OBSERVACIONES', 'COSTOS', 'PERSONAL');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('IMAGE', 'VIDEO', 'PDF', 'AUDIO');

-- AlterTable
ALTER TABLE "Registro" ADD COLUMN     "category" "RegistroCategory",
ADD COLUMN     "ledgerVersion" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "locationId" TEXT,
ALTER COLUMN "type" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "registroId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "fileType" "AttachmentType" NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_projectId_label_key" ON "Location"("projectId", "label");

-- CreateIndex
CREATE INDEX "Attachment_registroId_idx" ON "Attachment"("registroId");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_registroId_fkey" FOREIGN KEY ("registroId") REFERENCES "Registro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registro" ADD CONSTRAINT "Registro_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
