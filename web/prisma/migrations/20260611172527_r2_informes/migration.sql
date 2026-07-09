-- CreateTable
CREATE TABLE "Informe" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "segmentId" TEXT,
    "partidaId" TEXT,
    "requestedById" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "contentMd" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Informe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Informe_projectId_createdAt_idx" ON "Informe"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "Informe" ADD CONSTRAINT "Informe_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
