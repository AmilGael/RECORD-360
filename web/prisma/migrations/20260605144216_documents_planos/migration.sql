-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('PLANO', 'DOCUMENTO', 'LEVANTAMIENTO', 'IDEA', 'MINUTA', 'PLANO_ACTUALIZADO');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "segmentId" TEXT,
    "kind" "DocumentKind" NOT NULL DEFAULT 'PLANO',
    "title" TEXT,
    "url" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "fileType" "AttachmentType" NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_projectId_kind_createdAt_idx" ON "Document"("projectId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
