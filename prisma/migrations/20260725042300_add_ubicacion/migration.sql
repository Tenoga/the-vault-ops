-- CreateTable
CREATE TABLE "Ubicacion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proveedor" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "cmc" INTEGER NOT NULL,
    "cmcOrMas" BOOLEAN NOT NULL DEFAULT false,
    "letraDesde" TEXT NOT NULL,
    "letraHasta" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Ubicacion_proveedor_color_cmc_idx" ON "Ubicacion"("proveedor", "color", "cmc");
