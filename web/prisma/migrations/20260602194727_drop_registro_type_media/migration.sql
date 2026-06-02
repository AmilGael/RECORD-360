-- AlterTable: drop legacy columns
ALTER TABLE "Registro" DROP COLUMN IF EXISTS "type";
ALTER TABLE "Registro" DROP COLUMN IF EXISTS "mediaUrl";

-- DropEnum
DROP TYPE IF EXISTS "RegistroType";
