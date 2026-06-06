-- AlterTable
ALTER TABLE "Registro" ADD COLUMN     "clientCapturedAt" TIMESTAMP(3),
ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Registro_idempotencyKey_key" ON "Registro"("idempotencyKey");
