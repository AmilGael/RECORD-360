-- CreateTable
CREATE TABLE "Signature" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partidaId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerRole" "Role" NOT NULL,
    "statement" TEXT,
    "chainHead" TEXT NOT NULL,
    "seal" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Signature_partidaId_idx" ON "Signature"("partidaId");

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
