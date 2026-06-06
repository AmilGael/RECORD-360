-- DropForeignKey
ALTER TABLE "Registro" DROP CONSTRAINT "Registro_locationId_fkey";

-- AddForeignKey
ALTER TABLE "Registro" ADD CONSTRAINT "Registro_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
