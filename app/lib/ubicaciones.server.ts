import prisma from "../db.server";
import type { Ubicacion } from "./ubicaciones";

// Lectura ordenada por proveedor → color → cmc → letra, lista para pintar.
export async function getUbicaciones(): Promise<Ubicacion[]> {
  const rows = await prisma.ubicacion.findMany({
    orderBy: [
      { proveedor: "asc" },
      { color: "asc" },
      { cmc: "asc" },
      { letraDesde: "asc" },
    ],
  });

  return rows.map((r) => ({
    id: r.id,
    proveedor: r.proveedor,
    color: r.color,
    cmc: r.cmc,
    cmcOrMas: r.cmcOrMas,
    letraDesde: r.letraDesde,
    letraHasta: r.letraHasta,
    nombre: r.nombre,
  }));
}

// Reemplaza TODO el mapa de cajas en una transacción. El dataset es pequeño y
// el portal edita el conjunto completo, así que un borrar-y-recrear evita
// estados intermedios inválidos.
export async function replaceUbicaciones(items: Ubicacion[]): Promise<void> {
  await prisma.$transaction([
    prisma.ubicacion.deleteMany({}),
    prisma.ubicacion.createMany({
      data: items.map((i) => ({
        proveedor: i.proveedor,
        color: i.color,
        cmc: i.cmc,
        cmcOrMas: i.cmcOrMas,
        letraDesde: (i.letraDesde || "").toUpperCase(),
        letraHasta: (i.letraHasta || "").toUpperCase(),
        nombre: i.nombre.trim(),
      })),
    }),
  ]);
}
