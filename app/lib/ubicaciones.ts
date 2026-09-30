// ─── Mapa de cajas físicas (parametrizable) ─────────────────────────────────────
// Lógica pura compartida entre el portal de configuración, la API y la vista de
// pedidos. Una "caja" ubica una carta según (proveedor × color × CMC × rango de
// letras). El nombre físico es lo que se muestra a quien alista.

export interface Ubicacion {
  id?: string;
  proveedor: string;
  color: string; // clave: W U B R G C MULTI NONE
  cmc: number;
  cmcOrMas: boolean; // true = "coste N o superiores"
  letraDesde: string; // "A".."Z"
  letraHasta: string; // "A".."Z"
  nombre: string; // nombre físico mostrado (ej. "Caja 12")
}

// Mismos colores y orden que la agrupación WUBRG de la vista de pedidos.
export const COLOR_OPCIONES: { key: string; label: string; dot: string }[] = [
  { key: "W", label: "Blanco", dot: "#F4ECCB" },
  { key: "U", label: "Azul", dot: "#4A90D9" },
  { key: "B", label: "Negro", dot: "#3A3A3A" },
  { key: "R", label: "Rojo", dot: "#D9534F" },
  { key: "G", label: "Verde", dot: "#5CB85C" },
  { key: "C", label: "Incoloro", dot: "#B8B8B8" },
  { key: "LAND_BASIC", label: "Tierras básicas", dot: "#D8BE86" },
  { key: "LAND_NB", label: "Tierras no básicas", dot: "#A97C4A" },
  { key: "MULTI", label: "Multicolor", dot: "#E0A526" },
  { key: "NONE", label: "Sin color", dot: "#5C84A0" },
];

export const COLOR_LABEL: Record<string, string> = Object.fromEntries(
  COLOR_OPCIONES.map((c) => [c.key, c.label]),
);

export const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Etiqueta descriptiva del contexto de una caja (proveedor · color · coste).
export function contextoLabel(u: {
  proveedor: string;
  color: string;
  cmc: number;
  cmcOrMas: boolean;
}): string {
  return `${u.proveedor} · ${COLOR_LABEL[u.color] ?? u.color} · ${costeTexto(u.cmc, u.cmcOrMas)}`;
}

// Texto del coste para etiquetas: "coste 2", "coste 8+" o "cualquier coste"
// (cuando es coste 0 con "y superiores", que equivale a todos los costes → sirve
// para proveedores organizados solo por color).
export function costeTexto(cmc: number, cmcOrMas: boolean): string {
  if (cmcOrMas) return cmc === 0 ? "cualquier coste" : `coste ${cmc}+`;
  return `coste ${cmc}`;
}

// Etiqueta completa de una caja — lo que estaría escrito en la etiqueta física.
// Se genera a partir de los datos estructurados, así que NO hay que teclearla:
// solo se guarda el número de caja (campo `nombre`).
export function cajaEtiqueta(u: {
  proveedor: string;
  color: string;
  cmc: number;
  cmcOrMas: boolean;
  letraDesde: string;
  letraHasta: string;
}): string {
  const d = (u.letraDesde || "").toUpperCase();
  const h = (u.letraHasta || "").toUpperCase();
  return `${contextoLabel(u)} · ${d}–${h}`;
}

// Devuelve la caja que corresponde a una carta, o null si no hay ninguna
// configurada para su (proveedor, color, CMC, letra).
export function findCaja(
  ubicaciones: Ubicacion[],
  q: { proveedor: string; color: string; cmc: number; letra: string },
): Ubicacion | null {
  const letra = (q.letra || "").toUpperCase();
  if (letra < "A" || letra > "Z") return null; // solo iniciales A-Z

  for (const u of ubicaciones) {
    if (u.proveedor !== q.proveedor) continue;
    if (u.color !== q.color) continue;

    const cmcOk = u.cmcOrMas ? q.cmc >= u.cmc : q.cmc === u.cmc;
    if (!cmcOk) continue;

    const desde = (u.letraDesde || "").toUpperCase();
    const hasta = (u.letraHasta || "").toUpperCase();
    if (letra >= desde && letra <= hasta) return u;
  }
  return null;
}

// ─── Validación ─────────────────────────────────────────────────────────────────
// Cada contexto (proveedor+color+cmc+cmcOrMas) que tenga cajas debe cubrir A–Z
// de forma contigua y sin solapes.

export interface GrupoValidacion {
  proveedor: string;
  color: string;
  cmc: number;
  cmcOrMas: boolean;
  ok: boolean;
  mensaje: string; // "Cubre A–Z" o descripción del hueco/solape
}

export interface ResultadoValidacion {
  ok: boolean;
  grupos: GrupoValidacion[];
  errores: string[]; // problemas de fila individual (campos vacíos, rango invertido)
}

function grupoKey(u: Ubicacion): string {
  return `${u.proveedor}|||${u.color}|||${u.cmc}|||${u.cmcOrMas ? 1 : 0}`;
}

export function validarUbicaciones(ubicaciones: Ubicacion[]): ResultadoValidacion {
  const errores: string[] = [];

  ubicaciones.forEach((u, i) => {
    const ref = u.nombre?.trim() ? `"${u.nombre.trim()}"` : `caja #${i + 1}`;
    if (!u.proveedor) errores.push(`${ref}: falta el proveedor.`);
    if (!u.color) errores.push(`${ref}: falta el color.`);
    if (!Number.isInteger(u.cmc) || u.cmc < 0)
      errores.push(`${ref}: el CMC debe ser un entero ≥ 0.`);
    if (!u.nombre?.trim()) errores.push(`caja #${i + 1}: falta el nombre físico.`);

    const d = (u.letraDesde || "").toUpperCase();
    const h = (u.letraHasta || "").toUpperCase();
    if (!/^[A-Z]$/.test(d) || !/^[A-Z]$/.test(h))
      errores.push(`${ref}: rango de letras inválido.`);
    else if (d > h) errores.push(`${ref}: "desde" (${d}) va después de "hasta" (${h}).`);
  });

  // Agrupar por contexto
  const groups = new Map<string, Ubicacion[]>();
  for (const u of ubicaciones) {
    const k = grupoKey(u);
    const arr = groups.get(k);
    if (arr) arr.push(u);
    else groups.set(k, [u]);
  }

  const grupos: GrupoValidacion[] = [];

  for (const cajas of groups.values()) {
    const primera = cajas[0];
    const ordenadas = [...cajas].sort((a, b) =>
      (a.letraDesde || "").toUpperCase().localeCompare((b.letraDesde || "").toUpperCase()),
    );

    let ok = true;
    let mensaje = "Cubre A–Z";
    let esperado = "A"; // siguiente letra que debería empezar

    for (const c of ordenadas) {
      const d = (c.letraDesde || "").toUpperCase();
      const h = (c.letraHasta || "").toUpperCase();

      if (!/^[A-Z]$/.test(d) || !/^[A-Z]$/.test(h) || d > h) {
        ok = false;
        mensaje = "Hay una caja con rango inválido";
        break;
      }
      if (d > esperado) {
        ok = false;
        const faltaDesde = esperado;
        const faltaHasta = String.fromCharCode(d.charCodeAt(0) - 1);
        mensaje =
          faltaDesde === faltaHasta
            ? `Falta la letra ${faltaDesde}`
            : `Faltan las letras ${faltaDesde}–${faltaHasta}`;
        break;
      }
      if (d < esperado) {
        ok = false;
        mensaje = `Solape en la letra ${d}`;
        break;
      }
      esperado = String.fromCharCode(h.charCodeAt(0) + 1);
    }

    if (ok && esperado !== "[") {
      // "[" = carácter siguiente a "Z" (charCode 91)
      ok = false;
      mensaje = `Faltan las letras ${esperado}–Z`;
    }

    grupos.push({
      proveedor: primera.proveedor,
      color: primera.color,
      cmc: primera.cmc,
      cmcOrMas: primera.cmcOrMas,
      ok,
      mensaje,
    });
  }

  return {
    ok: errores.length === 0 && grupos.every((g) => g.ok),
    grupos,
    errores,
  };
}
