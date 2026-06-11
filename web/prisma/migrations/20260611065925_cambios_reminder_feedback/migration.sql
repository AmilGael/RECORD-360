-- AlterTable
ALTER TABLE "ChangeRequest" ADD COLUMN     "reminderDueAt" TIMESTAMP(3),
ADD COLUMN     "resolutionNote" TEXT;

-- AlterTable
ALTER TABLE "LoginAttempt" ALTER COLUMN "updatedAt" DROP DEFAULT;
