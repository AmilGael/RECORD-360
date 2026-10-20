ALTER TABLE "Document" ADD COLUMN "fileName" TEXT;
ALTER TABLE "Document" ADD COLUMN "thumbKey" TEXT;
CREATE INDEX "Document_thumbKey_idx" ON "Document"("thumbKey");
