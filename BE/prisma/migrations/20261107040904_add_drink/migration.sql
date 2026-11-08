-- CreateTable
CREATE TABLE "DrinkCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrinkCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drink" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER,
    "imageUrl" TEXT,
    "description" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrinkSize" (
    "id" SERIAL NOT NULL,
    "drinkId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DrinkSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrinkRecipeItem" (
    "sizeId" INTEGER NOT NULL,
    "ingredientId" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "DrinkRecipeItem_pkey" PRIMARY KEY ("sizeId","ingredientId")
);

-- CreateTable
CREATE TABLE "Topping" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToppingRecipeItem" (
    "toppingId" INTEGER NOT NULL,
    "ingredientId" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "ToppingRecipeItem_pkey" PRIMARY KEY ("toppingId","ingredientId")
);

-- CreateTable
CREATE TABLE "DrinkTopping" (
    "drinkId" INTEGER NOT NULL,
    "toppingId" INTEGER NOT NULL,

    CONSTRAINT "DrinkTopping_pkey" PRIMARY KEY ("drinkId","toppingId")
);

-- CreateIndex
CREATE UNIQUE INDEX "DrinkCategory_name_key" ON "DrinkCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Drink_name_key" ON "Drink"("name");

-- CreateIndex
CREATE INDEX "Drink_categoryId_idx" ON "Drink"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "DrinkSize_drinkId_name_key" ON "DrinkSize"("drinkId", "name");

-- CreateIndex
CREATE INDEX "DrinkRecipeItem_ingredientId_idx" ON "DrinkRecipeItem"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "Topping_name_key" ON "Topping"("name");

-- CreateIndex
CREATE INDEX "ToppingRecipeItem_ingredientId_idx" ON "ToppingRecipeItem"("ingredientId");

-- CreateIndex
CREATE INDEX "DrinkTopping_toppingId_idx" ON "DrinkTopping"("toppingId");

-- AddForeignKey
ALTER TABLE "Drink" ADD CONSTRAINT "Drink_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DrinkCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrinkSize" ADD CONSTRAINT "DrinkSize_drinkId_fkey" FOREIGN KEY ("drinkId") REFERENCES "Drink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrinkRecipeItem" ADD CONSTRAINT "DrinkRecipeItem_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "DrinkSize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrinkRecipeItem" ADD CONSTRAINT "DrinkRecipeItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToppingRecipeItem" ADD CONSTRAINT "ToppingRecipeItem_toppingId_fkey" FOREIGN KEY ("toppingId") REFERENCES "Topping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToppingRecipeItem" ADD CONSTRAINT "ToppingRecipeItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrinkTopping" ADD CONSTRAINT "DrinkTopping_drinkId_fkey" FOREIGN KEY ("drinkId") REFERENCES "Drink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrinkTopping" ADD CONSTRAINT "DrinkTopping_toppingId_fkey" FOREIGN KEY ("toppingId") REFERENCES "Topping"("id") ON DELETE CASCADE ON UPDATE CASCADE;
