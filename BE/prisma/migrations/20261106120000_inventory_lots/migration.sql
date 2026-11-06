-- CreateEnum
CREATE TYPE "IngredientType" AS ENUM ('RAW', 'PREPARED');

-- CreateEnum
CREATE TYPE "LotSource" AS ENUM ('OPENING', 'STOCK_IN', 'PREP', 'COUNT');

-- AlterEnum
ALTER TYPE "StockOutReason" ADD VALUE 'PREP';

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "batchYield" DECIMAL(12,3),
ADD COLUMN     "shelfLifeHours" INTEGER,
ADD COLUMN     "type" "IngredientType" NOT NULL DEFAULT 'RAW',
ALTER COLUMN "avgCost" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "StockInItem" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "packFactor" DECIMAL(12,3),
ADD COLUMN     "packPrice" DECIMAL(14,2),
ADD COLUMN     "packQty" DECIMAL(12,3),
ADD COLUMN     "purchaseUnitName" TEXT,
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(14,4);

-- AlterTable
ALTER TABLE "StockOut" ADD COLUMN     "prepBatchId" INTEGER,
ADD COLUMN     "stockCountId" INTEGER;

-- AlterTable
ALTER TABLE "StockOutItem" ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(14,4);

-- CreateTable
CREATE TABLE "PurchaseUnit" (
    "id" SERIAL NOT NULL,
    "ingredientId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "factor" DECIMAL(12,3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PurchaseUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepRecipeItem" (
    "id" SERIAL NOT NULL,
    "preparedId" INTEGER NOT NULL,
    "ingredientId" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "PrepRecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLot" (
    "id" SERIAL NOT NULL,
    "ingredientId" INTEGER NOT NULL,
    "source" "LotSource" NOT NULL,
    "stockInItemId" INTEGER,
    "prepBatchId" INTEGER,
    "countItemId" INTEGER,
    "initialQty" DECIMAL(12,3) NOT NULL,
    "remainingQty" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOutAllocation" (
    "id" SERIAL NOT NULL,
    "stockOutItemId" INTEGER NOT NULL,
    "lotId" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "StockOutAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepBatch" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "preparedId" INTEGER NOT NULL,
    "batches" DECIMAL(8,2) NOT NULL,
    "expectedQty" DECIMAL(12,3) NOT NULL,
    "actualQty" DECIMAL(12,3) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "producedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,

    CONSTRAINT "PrepBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountItem" (
    "id" SERIAL NOT NULL,
    "stockCountId" INTEGER NOT NULL,
    "ingredientId" INTEGER NOT NULL,
    "systemQty" DECIMAL(12,3) NOT NULL,
    "actualQty" DECIMAL(12,3) NOT NULL,
    "diff" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "StockCountItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseUnit_ingredientId_name_key" ON "PurchaseUnit"("ingredientId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PrepRecipeItem_preparedId_ingredientId_key" ON "PrepRecipeItem"("preparedId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLot_stockInItemId_key" ON "StockLot"("stockInItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLot_prepBatchId_key" ON "StockLot"("prepBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLot_countItemId_key" ON "StockLot"("countItemId");

-- CreateIndex
CREATE INDEX "StockLot_ingredientId_remainingQty_idx" ON "StockLot"("ingredientId", "remainingQty");

-- CreateIndex
CREATE INDEX "StockLot_expiresAt_idx" ON "StockLot"("expiresAt");

-- CreateIndex
CREATE INDEX "StockOutAllocation_lotId_idx" ON "StockOutAllocation"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "PrepBatch_code_key" ON "PrepBatch"("code");

-- CreateIndex
CREATE INDEX "PrepBatch_producedAt_idx" ON "PrepBatch"("producedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_code_key" ON "StockCount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountItem_stockCountId_ingredientId_key" ON "StockCountItem"("stockCountId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "StockOut_prepBatchId_key" ON "StockOut"("prepBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "StockOut_stockCountId_key" ON "StockOut"("stockCountId");

-- AddForeignKey
ALTER TABLE "PurchaseUnit" ADD CONSTRAINT "PurchaseUnit_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepRecipeItem" ADD CONSTRAINT "PrepRecipeItem_preparedId_fkey" FOREIGN KEY ("preparedId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepRecipeItem" ADD CONSTRAINT "PrepRecipeItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_stockInItemId_fkey" FOREIGN KEY ("stockInItemId") REFERENCES "StockInItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_prepBatchId_fkey" FOREIGN KEY ("prepBatchId") REFERENCES "PrepBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_countItemId_fkey" FOREIGN KEY ("countItemId") REFERENCES "StockCountItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOut" ADD CONSTRAINT "StockOut_prepBatchId_fkey" FOREIGN KEY ("prepBatchId") REFERENCES "PrepBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOut" ADD CONSTRAINT "StockOut_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOutAllocation" ADD CONSTRAINT "StockOutAllocation_stockOutItemId_fkey" FOREIGN KEY ("stockOutItemId") REFERENCES "StockOutItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOutAllocation" ADD CONSTRAINT "StockOutAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepBatch" ADD CONSTRAINT "PrepBatch_preparedId_fkey" FOREIGN KEY ("preparedId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepBatch" ADD CONSTRAINT "PrepBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== Chuyển dữ liệu đợt 1 =====

-- Mỗi nguyên liệu còn tồn sinh một lô tồn đầu kỳ. Hạn theo ngày hiểu là 23:59:59 giờ VN.
INSERT INTO "StockLot" ("ingredientId", "source", "initialQty", "remainingQty", "unitCost", "expiresAt")
SELECT "id", 'OPENING', "quantity", "quantity", "avgCost",
       CASE WHEN "expiryDate" IS NULL THEN NULL
            ELSE ((("expiryDate" + TIME '23:59:59') AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC') END
FROM "Ingredient"
WHERE "quantity" > 0;

UPDATE "StockInItem"
SET "expiresAt" = ((("expiryDate" + TIME '23:59:59') AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC')
WHERE "expiryDate" IS NOT NULL;

ALTER TABLE "Ingredient" DROP COLUMN "expiryDate";
ALTER TABLE "StockInItem" DROP COLUMN "expiryDate";
