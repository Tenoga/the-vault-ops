import { useState, useCallback, useEffect } from "react";
import { Link } from "react-router";

import { findCaja, type Ubicacion } from "../lib/ubicaciones";

// ─── Paleta de marca ──────────────────────────────────────────────────────────
// #442E17 #0E1D2B #6A481C #122F43 #8F672E #24445D #0E151D #B08343 #5C84A0

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProveedorInfo {
  cantidad: number;
  ultima_actualizacion?: string;
}

interface OrderItem {
  variant_id: string;
  product_id: string;
  title: string;
  image_url: string;
  finishing: string;
  product_type?: string | null;
  quantity: number;
  sku: string;
  providers: string[];
  proveedores_cantidades: Record<string, ProveedorInfo>;
  price: number;
  gestionado: boolean;
  no_fisico: boolean;
  color_exacto?: string | null;
  mana_cost?: string | null;
  cmc?: number;
  // Nombre impreso en el idioma de la variante (p. ej. el título en español).
  // Opcional: hoy el backend no lo envía; si algún día llega, se muestra entre
  // paréntesis junto al nombre en inglés.
  printed_name?: string | null;
}

interface OrderAddress {
  nombre?: string | null;
  direccion1?: string | null;
  direccion2?: string | null;
  ciudad?: string | null;
  provincia?: string | null;
  pais?: string | null;
  zip?: string | null;
  telefono?: string | null;
}

interface OrderInfo {
  customer_name: string | null;
  phone: string | null;
  email: string | null;
  address: OrderAddress | null;
  shipping_method: string | null;
  is_pickup: boolean | null;
  tracking_numbers: string[];
  total: number | string | null;
  currency: string | null;
}

interface Order {
  status: string;
  order_name: string;
  order_id: string;
  tags: string[];
  items: OrderItem[];
  info?: OrderInfo;
}

interface PendingOrder {
  order_id: string;
  order_name: string;
  created_at: string;
  tags: string[];
  items_count: number;
  total: number;
  currency: string;
  customer_name: string | null;
  is_pickup?: boolean | null;
}

type ItemAllocation = Record<string, number>;
type AllocationMap = Record<string, ItemAllocation>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      day: "2-digit",
      month: "short",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function isSinProveedor(providers: string[]) {
  return providers.length === 1 && providers[0] === "Sin proveedor";
}

// The Vault siempre se prioriza: si está entre los proveedores de un ítem con
// varios, se devuelve su nombre exacto (tolera "The Vault" / "TheVault"). Se usa
// para pre-seleccionarlo por defecto y agrupar el ítem con los demás de The Vault
// (en su color/coste), en vez de mandarlo al grupo "Múltiples proveedores".
function proveedorTheVault(providers: string[]): string | null {
  return (
    providers.find(
      (p) => p.trim().toLowerCase().replace(/\s+/g, "") === "thevault",
    ) ?? null
  );
}

function totalAllocated(alloc: ItemAllocation) {
  return Object.values(alloc).reduce((s, v) => s + v, 0);
}

// ─── Idioma (desde el sufijo del SKU) ───────────────────────────────────────────
// El SKU sigue el formato {SET}-{COLECTOR}-{FINISH}-{VARIANTE}-{IDIOMA}
// (p. ej. "WOC-097-NF-STD-EN"). El último segmento es el código de idioma, que el
// cargador escribe SIEMPRE, incluido inglés. Lo mismo que el `finishing`, que ya
// se deriva del SKU. Se muestra para que quien alista sepa qué versión tomar.

const IDIOMA_LABEL: Record<string, string> = {
  EN: "Inglés",
  ES: "Español",
  JA: "Japonés",
  PT: "Portugués",
  DE: "Alemán",
  FR: "Francés",
  IT: "Italiano",
  RU: "Ruso",
  KO: "Coreano",
  ZHS: "Chino simpl.",
  ZHT: "Chino trad.",
  ZH: "Chino",
};

function parseIdioma(sku?: string | null): { code: string; label: string } | null {
  if (!sku) return null;
  const segments = sku.trim().toUpperCase().split("-").filter(Boolean);
  if (segments.length === 0) return null;
  const code = segments[segments.length - 1];
  const label = IDIOMA_LABEL[code];
  return label ? { code, label } : null;
}

// ─── Letra inicial (para ubicar físicamente la carta) ───────────────────────────
// El inventario está archivado alfabéticamente por el nombre canónico en inglés
// (el título del producto). Mostramos la inicial para saber en qué tramo buscar.
// Ignora artículos/símbolos iniciales y cae en "#" si no hay letra ni número.

function initialLetter(title?: string | null): string {
  if (!title) return "#";
  const match = title.trim().toUpperCase().match(/[A-Z0-9]/);
  return match ? match[0] : "#";
}

// ─── Agrupación por color (MTG) ────────────────────────────────────────────────
// Orden canónico WUBRG (igual que el bot anterior): Blanco, Azul, Negro, Rojo,
// Verde, Incoloro, Multicolor y por último Sin color. El metafield
// `mtg.color_exacto` llega como las iniciales concatenadas, p. ej. "U", "WU", "".

const COLOR_META: Record<
  string,
  { label: string; dot: string; order: number }
> = {
  W: { label: "Blanco", dot: "#F4ECCB", order: 0 },
  U: { label: "Azul", dot: "#4A90D9", order: 1 },
  B: { label: "Negro", dot: "#3A3A3A", order: 2 },
  R: { label: "Rojo", dot: "#D9534F", order: 3 },
  G: { label: "Verde", dot: "#5CB85C", order: 4 },
  C: { label: "Incoloro", dot: "#B8B8B8", order: 5 },
  LAND_BASIC: { label: "Tierras básicas", dot: "#D8BE86", order: 6 },
  LAND_NB: { label: "Tierras no básicas", dot: "#A97C4A", order: 7 },
  MULTI: { label: "Multicolor", dot: "#E0A526", order: 8 },
  NONE: { label: "Sin color", dot: "#5C84A0", order: 9 },
};

// Algunos productos guardan color_exacto como palabra en español (p. ej.
// "Incoloro") en vez de códigos WUBRGC; esas palabras romperían el parseo por
// letras (p. ej. "INCOLORO" caería en Rojo), así que se mapean explícitamente.
const COLOR_PALABRA: Record<string, string> = {
  BLANCO: "W", AZUL: "U", NEGRO: "B", ROJO: "R", VERDE: "G",
  INCOLORO: "C", COLORLESS: "C", MULTICOLOR: "MULTI",
  "SIN COLOR": "NONE", TIERRA: "LAND", TIERRAS: "LAND",
};

function colorGroupKey(colorExacto?: string | null): string {
  const raw = (colorExacto ?? "").trim().toUpperCase();
  if (!raw) return "NONE";
  if (COLOR_PALABRA[raw]) return COLOR_PALABRA[raw];

  const clean = raw.replace(/[^WUBRGC]/g, "");
  if (!clean) return "NONE";

  const letras = Array.from(new Set(clean.split("")));
  const deColor = letras.filter((c) => "WUBRG".includes(c));

  if (deColor.length > 1) return "MULTI";
  if (deColor.length === 1) return deColor[0];
  if (letras.includes("C")) return "C";

  return "NONE";
}

// Las tierras se archivan en su propia categoría (no por color): básicas y no
// básicas van en cajas distintas. Se distinguen por el productType: "Basic Land"
// (incl. "Basic Snow Land") → básicas; cualquier otro que contenga "land"
// (Land, Artifact Land, Legendary Land…) → no básicas.
//
// SOLO la cara FRONTAL: en las dobles cara "algo // Land" (p. ej. "Sorcery //
// Land", "Creature // Land") el reverso es tierra pero la carta se archiva por su
// frente. Se toma la parte anterior al "//"; así un hechizo/criatura con reverso
// de tierra NO cuenta como tierra, pero una "Land // Land" (pathway) sí.
function tipoTierra(productType?: string | null): "LAND_BASIC" | "LAND_NB" | null {
  const frente = (productType ?? "").split("//")[0].toLowerCase();
  if (!frente.includes("land")) return null;
  return frente.includes("basic") ? "LAND_BASIC" : "LAND_NB";
}

// Color REAL de la carta = los símbolos de color del COSTO de maná (esquina
// superior derecha). Ignora la identidad de color y el texto de reglas. Cubre
// híbridos ({W/U} cuenta como ambos) y Phyrexian ({B/P} cuenta como negro). Una
// carta devoid/incolora cuyo costo lleva maná de color cuenta como ese color.
function coloresDelCosto(manaCost?: string | null): string[] {
  const mc = (manaCost ?? "").toUpperCase();
  return ["W", "U", "B", "R", "G"].filter((c) => mc.includes(c));
}

// Clave de color para agrupar y ubicar una carta:
//   1) tierras → "LAND"
//   2) por el costo de maná (fuente real del color)
//   3) si no hay costo de maná disponible → respaldo a color_exacto (datos viejos)
function itemColorKey(item: {
  product_type?: string | null;
  color_exacto?: string | null;
  mana_cost?: string | null;
}): string {
  const tierra = tipoTierra(item.product_type);
  if (tierra) return tierra;

  const mc = item.mana_cost;
  if (mc != null && mc !== "") {
    const cols = coloresDelCosto(mc);
    if (cols.length > 1) return "MULTI";
    if (cols.length === 1) return cols[0];
    return "C"; // costo sin símbolos de color = incolora
  }

  return colorGroupKey(item.color_exacto);
}

// CMC (coste convertido) para ubicar la carta, contando cada {X} como 1 (no como
// 0 como hace Scryfall). Así {X}{G}{U} cuenta 3 y no 2, y cae en la caja correcta.
function itemCmc(item: { cmc?: number; mana_cost?: string | null }): number {
  const base = item.cmc ?? 999;
  if (base === 999) return 999; // desconocido: se deja tal cual
  const equis = ((item.mana_cost ?? "").toUpperCase().match(/X/g) ?? []).length;
  return base + equis;
}

// Devuelve [clave_color, items][] ordenado WUBRG; dentro de cada color, por
// coste de maná (cmc) y luego por nombre.
function groupByColor(items: OrderItem[]): [string, OrderItem[]][] {
  const groups: Record<string, OrderItem[]> = {};

  for (const item of items) {
    const key = itemColorKey(item);
    (groups[key] ??= []).push(item);
  }

  for (const key of Object.keys(groups)) {
    groups[key].sort(
      (a, b) =>
        itemCmc(a) - itemCmc(b) ||
        a.title.localeCompare(b.title, "es"),
    );
  }

  return Object.entries(groups).sort(
    ([a], [b]) => (COLOR_META[a]?.order ?? 99) - (COLOR_META[b]?.order ?? 99),
  );
}

// ─── Provider Selector ────────────────────────────────────────────────────────

function ProviderSelector({
  item,
  allocation,
  onChange,
}: {
  item: OrderItem;
  allocation: ItemAllocation;
  onChange: (alloc: ItemAllocation) => void;
}) {
  const { providers, quantity } = item;

  if (isSinProveedor(providers)) {
    return (
      <p style={{ fontSize: 12, color: "#6A481C", fontStyle: "italic", marginTop: 6 }}>
        Sin proveedor disponible
      </p>
    );
  }

  const stockBadge = (prov: string) => {
    const info = item.proveedores_cantidades?.[prov];
    const cant = info?.cantidad;
    return (
      <span style={{
        fontSize: 11, fontWeight: 700,
        padding: "1px 7px", borderRadius: 20,
        background: cant !== undefined ? "#0a1f0a" : "#122F43",
        color: cant !== undefined ? "#39FF14" : "#5C84A0",
        border: `1px solid ${cant !== undefined ? "#39FF1460" : "#24445D"}`,
        fontFamily: "monospace",
        flexShrink: 0,
      }}>
        {cant !== undefined ? `${cant} disp.` : "? disp."}
      </span>
    );
  };

  if (providers.length === 1) {
    const prov = providers[0];
    const selected = allocation[prov] !== undefined;
    return (
      <div
        onClick={() => onChange({ [prov]: quantity })}
        style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}
      >
        <div style={{
          width: 16, height: 16, borderRadius: "50%",
          border: `2px solid ${selected ? "#B08343" : "#24445D"}`,
          background: selected ? "#B08343" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "all 0.15s",
        }}>
          {selected && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0E151D" }} />}
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#e8d5b7", fontFamily: "'Philosopher', serif" }}>{prov}</span>
        {stockBadge(prov)}
        <span style={{ fontSize: 13, color: "#5C84A0" }}>({quantity} pedido)</span>
      </div>
    );
  }

  const allocated = totalAllocated(allocation);
  const remaining = quantity - allocated;

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {providers.map((prov) => {
        const val = allocation[prov] ?? 0;
        const activo = val > 0;
        const btnStyle = (disabled: boolean): React.CSSProperties => ({
          width: 28, height: 28, borderRadius: 6,
          border: `1px solid ${activo ? "#B08343" : "#24445D"}`,
          background: disabled ? "#0E151D" : activo ? "#1a1206" : "#122F43",
          color: disabled ? "#24445D" : "#B08343",
          fontSize: 16, fontWeight: 700, lineHeight: 1,
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, transition: "all 0.15s", fontFamily: "'Philosopher', serif",
        });
        return (
          <div key={prov} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: 8,
            border: `1px solid ${activo ? "#8F672E" : "#24445D30"}`,
            background: activo ? "#1a120680" : "#0E151D50",
            transition: "all 0.2s",
            boxShadow: activo ? "0 0 10px #8F672E25" : "none",
          }}>
            {/* Indicador visual */}
            <div style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: activo ? "#B08343" : "#24445D",
              boxShadow: activo ? "0 0 6px #B08343" : "none",
              transition: "all 0.2s",
            }} />
            <span style={{
              fontSize: 13, fontFamily: "'Literata', serif", flex: 1,
              color: activo ? "#e8d5b7" : "#5C84A0",
              fontWeight: activo ? 600 : 400,
            }}>{prov}</span>
            {stockBadge(prov)}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button style={btnStyle(val <= 0)} disabled={val <= 0}
                onClick={() => {
                  // Al llegar a 0 se elimina la clave: un proveedor con qty 0
                  // en el payload hace que el backend rechace el pedido
                  const next = { ...allocation };
                  if (val - 1 <= 0) delete next[prov];
                  else next[prov] = val - 1;
                  onChange(next);
                }}>−</button>
              <span style={{
                width: 36, textAlign: "center", fontFamily: "'Philosopher', serif",
                fontSize: activo ? 20 : 15, fontWeight: 700,
                color: activo ? "#B08343" : "#24445D",
                transition: "all 0.2s",
              }}>{val}</span>
              <button style={btnStyle(val >= quantity)} disabled={val >= quantity}
                onClick={() => onChange({ ...allocation, [prov]: val + 1 })}>+</button>
            </div>
          </div>
        );
      })}
      <p style={{
        fontSize: 13, fontWeight: 700, marginTop: 4,
        color: remaining === 0 ? "#5C84A0" : remaining < 0 ? "#fca5a5" : "#B08343",
        fontFamily: "'Philosopher', serif",
      }}>
        {remaining === 0 ? "✓ Distribución completa"
          : remaining > 0 ? `Faltan ${remaining} por asignar`
          : `Excedido por ${Math.abs(remaining)}`}
      </p>
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(14, 21, 29, 0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(6px)",
        cursor: "zoom-out",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
        <img
          src={src}
          alt={alt}
          style={{
            maxWidth: "80vw", maxHeight: "80vh",
            borderRadius: 16,
            border: "2px solid #B08343",
            boxShadow: "0 0 60px #B0834340",
            objectFit: "contain",
          }}
        />
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: -14, right: -14,
            width: 30, height: 30, borderRadius: "50%",
            background: "#0E1D2B", border: "1px solid #B08343",
            color: "#B08343", fontSize: 16, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >×</button>
      </div>
    </div>
  );
}

// ─── Order Item Card ──────────────────────────────────────────────────────────

function OrderItemCard({
  item, allocation, gestionado, noFisico, ubicaciones, onAllocationChange, onToggleGestionado, onToggleNoFisico,
}: {
  item: OrderItem;
  allocation: ItemAllocation;
  gestionado: boolean;
  noFisico: boolean;
  ubicaciones: Ubicacion[];
  onAllocationChange: (variantId: string, alloc: ItemAllocation) => void;
  onToggleGestionado: (variantId: string) => void;
  onToggleNoFisico: (variantId: string) => void;
}) {
  const [lightbox, setLightbox] = useState(false);
  const { providers, quantity } = item;
  const letra = initialLetter(item.title);
  const idioma = parseIdioma(item.sku);
  // Idioma distinto del inglés (el idioma por defecto del catálogo): se resalta
  // para que quien alista lo note de inmediato. Si además tenemos el nombre
  // impreso en ese idioma, se muestra entre paréntesis junto al título.
  const esNoIngles = !!idioma && idioma.code !== "EN";
  const nombreLocal = esNoIngles ? item.printed_name?.trim() || null : null;

  // Caja física: depende del proveedor que se vaya a alistar. Se usan los
  // proveedores con cantidad asignada; si aún no se asigna nada pero solo hay
  // uno, se usa ese. La búsqueda es por (proveedor, color, CMC, letra inicial).
  const color = itemColorKey(item);
  const cmc = itemCmc(item);
  const provsAsignados = isSinProveedor(providers)
    ? []
    : Object.entries(allocation).filter(([, q]) => q > 0).map(([p]) => p);
  const provsUbicar =
    provsAsignados.length > 0
      ? provsAsignados
      : providers.length === 1 && !isSinProveedor(providers)
        ? [providers[0]]
        : [];
  const cajas = provsUbicar.map((prov) => ({
    prov,
    caja: findCaja(ubicaciones, { proveedor: prov, color, cmc, letra }),
  }));
  // Si resolvemos exactamente UNA caja, su número es el protagonista del panel.
  // En cualquier otro caso (varios proveedores, sin proveedor asignado o caja
  // sin configurar) se mantiene la letra inicial como respaldo.
  const heroCaja = cajas.length === 1 ? cajas[0].caja : null;
  const colorMeta = COLOR_META[color] ?? COLOR_META.NONE;

  const proveedorCompleto = isSinProveedor(providers)
    ? true
    : providers.length === 1
      ? (allocation[providers[0]] ?? 0) > 0
      : totalAllocated(allocation) === quantity;

  const completo = noFisico || (gestionado && proveedorCompleto);
  const esFoilMultiple = item.finishing === "Foil" && item.quantity > 1;
  const esMultiple = item.quantity > 1;

  return (
    <>
      {lightbox && <Lightbox src={item.image_url} alt={item.title} onClose={() => setLightbox(false)} />}
      <div
        onClick={() => onToggleGestionado(item.variant_id)}
        title={gestionado ? "Clic para quitar «gestionado»" : "Clic en la tarjeta para marcar «gestionado»"}
        style={{
        display: "flex", gap: 14, padding: 16, borderRadius: 12,
        cursor: "pointer",
        border: completo
          ? "2px solid #8F672E"
          : item.finishing === "Foil" && esMultiple
            ? "2px solid #FF00FF"
            : item.finishing === "Foil"
              ? "2px solid #FF00FF"
              : esMultiple
                ? "2px solid #39FF14"
                : gestionado
                  ? "1px solid #8F672E60"
                  : "1px solid #24445D50",
        background: completo
          ? "#1a1206"
          : item.finishing === "Foil"
            ? "#1a0020"
            : esMultiple
              ? "#001a06"
              : "#0E1D2B",
        boxShadow: completo
          ? "0 0 16px #8F672E25, inset 0 0 30px #6A481C10"
          : item.finishing === "Foil" && esMultiple
            ? "0 0 28px #FF00FF70, 0 0 14px #39FF1450"
            : item.finishing === "Foil"
              ? "0 0 28px #FF00FF60, inset 0 0 30px #FF00FF10"
              : esMultiple
                ? "0 0 28px #39FF1460, inset 0 0 30px #39FF1410"
                : "none",
        transition: "all 0.2s",
      }}>
      {/* Imagen */}
      <div style={{ flexShrink: 0, alignSelf: "stretch" }}>
        <div
          onClick={(e) => { e.stopPropagation(); setLightbox(true); }}
          style={{
            width: 210, height: "100%", borderRadius: 10, overflow: "hidden",
            border: "1px solid #24445D", background: "#0E151D",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-in", transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#B08343")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#24445D")}
        >
          <img
            src={item.image_url}
            alt={item.title}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='110' height='110'%3E%3Crect width='110' height='110' fill='%230E151D'/%3E%3Ctext x='50%25' y='50%25' font-size='36' text-anchor='middle' dominant-baseline='middle'%3E🃏%3C/text%3E%3C/svg%3E";
            }}
          />
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <h3 style={{
            fontFamily: "'Philosopher', serif", fontSize: 18, fontWeight: 700,
            color: "#e8d5b7", margin: 0, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {item.title}
            {nombreLocal && (
              <span style={{ color: "#5C84A0", fontWeight: 400, fontStyle: "italic" }}>
                {" "}({nombreLocal})
              </span>
            )}
          </h3>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleNoFisico(item.variant_id); }}
              style={{
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                color: noFisico ? "#fff" : "#5C84A0",
                background: noFisico ? "#7C3AED" : "#122F43",
                border: `1px solid ${noFisico ? "#A855F7" : "#24445D"}`,
                padding: "4px 12px", borderRadius: 20,
                fontFamily: "'Philosopher', serif",
                transition: "all 0.2s",
                boxShadow: noFisico ? "0 0 10px #A855F780" : "none",
              }}
            >
              {noFisico ? "👻 No físico" : "¿No físico?"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleGestionado(item.variant_id); }}
              style={{
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                color: gestionado ? "#B08343" : "#5C84A0",
                background: gestionado ? "#1a1206" : "#122F43",
                border: `1px solid ${gestionado ? "#8F672E" : "#24445D"}`,
                padding: "4px 14px", borderRadius: 20,
                fontFamily: "'Philosopher', serif",
                transition: "all 0.2s",
              }}
            >
              {gestionado ? "✓ Gestionado" : "Marcar gestionado"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{
            fontFamily: "monospace", fontSize: 13, background: "#122F43",
            color: "#5C84A0", padding: "2px 10px", borderRadius: 4,
            border: "1px solid #24445D50",
          }}>
            {item.sku}
          </span>
          {item.finishing === "Foil" ? (
            <span style={{
              fontSize: 14, fontWeight: 900,
              padding: "4px 16px", borderRadius: 20,
              background: "linear-gradient(90deg, #FF00FF, #FF69FF, #FF00FF)",
              color: "#fff",
              border: "2px solid #FF00FF",
              fontFamily: "'Philosopher', serif",
              boxShadow: "0 0 16px #FF00FF, 0 0 32px #FF00FF80",
              letterSpacing: 2,
              textShadow: "0 0 8px #fff",
            }}>
              ✨ FOIL
            </span>
          ) : (
            <span style={{
              fontSize: 13, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
              background: "#122F43", color: "#5C84A0", border: "1px solid #24445D",
              fontFamily: "'Philosopher', serif",
            }}>
              🃏 No Foil
            </span>
          )}
          {item.quantity > 1 && (
            <span style={{
              fontSize: 15, fontWeight: 900, padding: "4px 16px", borderRadius: 20,
              background: "#39FF14",
              color: "#000",
              border: "2px solid #39FF14",
              fontFamily: "'Philosopher', serif",
              boxShadow: "0 0 16px #39FF14, 0 0 32px #39FF1480",
              letterSpacing: 2,
              textShadow: "0 0 4px #fff",
            }}>
              ×{item.quantity}
            </span>
          )}
          {esNoIngles && (
            <span style={{
              fontSize: 14, fontWeight: 900, padding: "4px 14px", borderRadius: 20,
              background: "linear-gradient(90deg, #06B6D4, #22D3EE, #06B6D4)",
              color: "#04222b",
              border: "2px solid #22D3EE",
              fontFamily: "'Philosopher', serif",
              boxShadow: "0 0 16px #22D3EE, 0 0 30px #22D3EE70",
              letterSpacing: 1.5,
              textShadow: "0 0 6px #ffffff80",
            }}>
              🌐 {idioma!.label.toUpperCase()}
            </span>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", marginTop: 10 }}>
          <span style={{ fontSize: 14, color: "#5C84A0" }}>
            Cantidad: <strong style={{ color: "#e8d5b7" }}>{item.quantity}</strong>
          </span>
          <span style={{ fontSize: 14, color: "#5C84A0" }}>
            Precio: <strong style={{ color: "#B08343" }}>{formatCOP(item.price)}</strong>
          </span>
          <span style={{ fontSize: 14, color: "#5C84A0", gridColumn: "span 2" }}>
            Proveedores: <span style={{ color: "#8F672E" }}>{item.providers.join(", ")}</span>
          </span>
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          <ProviderSelector
            item={item}
            allocation={allocation}
            onChange={(alloc) => onAllocationChange(item.variant_id, alloc)}
          />
        </div>
      </div>

      {/* Ubicación física: dónde y en qué idioma buscar la carta. El inventario
          está archivado alfabéticamente por nombre canónico en inglés, así que la
          letra inicial dice el tramo. (La caja exacta llegará en una fase futura.) */}
      <div style={{
        flexShrink: 0, width: 176, alignSelf: "stretch",
        display: "flex", flexDirection: "column", gap: 10,
        padding: "14px 12px", borderRadius: 10,
        background: "#0E151D", border: "1px solid #24445D50",
      }}>
        {/* Título adaptativo: si sabemos la caja, la orden es "ir a la caja" */}
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#5C84A0",
          textTransform: "uppercase", letterSpacing: 1.5,
          fontFamily: "'Philosopher', serif", textAlign: "center",
        }}>
          {heroCaja ? "Ir a la caja" : "Dónde buscar"}
        </span>

        {heroCaja ? (
          <>
            {/* Número de caja — el identificador físico (protagonista) */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{
                minWidth: 92, borderRadius: 14, padding: "8px 12px",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                background: "#1a1206", border: "2px solid #B08343",
                boxShadow: "0 0 18px #8F672E40, inset 0 0 24px #6A481C20",
              }}>
                <span style={{
                  fontFamily: "'Nova Cut', cursive", fontSize: 46, lineHeight: 1.05,
                  color: "#B08343", textAlign: "center", wordBreak: "break-word",
                }}>
                  {heroCaja.nombre}
                </span>
              </div>
            </div>

            {/* Confirmación: la etiqueta completa de la caja (proveedor · color ·
                coste · rango), generada sola, para que coincida con la física. */}
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: 8, borderRadius: 8,
              background: "#0E151D", border: "1px solid #24445D50",
            }}>
              <span style={{
                fontSize: 11, fontWeight: 600, color: "#8F672E",
                fontFamily: "'Literata', serif", textAlign: "center",
              }}>
                {cajas[0].prov}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                  background: colorMeta.dot,
                  boxShadow: "0 0 0 1px #0E151D, 0 0 0 2px #24445D",
                }} />
                <span style={{
                  fontFamily: "'Philosopher', serif", fontSize: 12, fontWeight: 700,
                  color: "#e8d5b7", textAlign: "center",
                }}>
                  {heroCaja.cmc === 0 && heroCaja.cmcOrMas
                    ? colorMeta.label
                    : `${colorMeta.label} · Coste ${heroCaja.cmc}${heroCaja.cmcOrMas ? "+" : ""}`}
                </span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#B08343", fontFamily: "monospace" }}>
                {heroCaja.letraDesde}–{heroCaja.letraHasta}
              </span>
            </div>
          </>
        ) : (
          /* Respaldo: letra inicial (tramo alfabético) */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 66, height: 66, borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "#1a1206", border: "2px solid #8F672E",
              boxShadow: "inset 0 0 20px #6A481C20",
            }}>
              <span style={{
                fontFamily: "'Nova Cut', cursive", fontSize: 40, lineHeight: 1,
                color: "#B08343",
              }}>
                {letra}
              </span>
            </div>
            <span style={{
              fontSize: 10, color: "#5C84A0", fontFamily: "'Philosopher', serif",
              textTransform: "uppercase", letterSpacing: 1,
            }}>
              Alfabético
            </span>
          </div>
        )}

        {/* Idioma de la variante — resaltado en cian si NO es inglés */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          padding: "7px 8px", borderRadius: 8,
          background: esNoIngles ? "#06323b" : idioma ? "#122F43" : "#0E1D2B",
          border: `1px solid ${esNoIngles ? "#22D3EE" : idioma ? "#24445D" : "#24445D50"}`,
          boxShadow: esNoIngles ? "0 0 10px #22D3EE40" : "none",
        }}>
          <span style={{ fontSize: 15 }} aria-hidden>🌐</span>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: esNoIngles ? "#a9ecf5" : idioma ? "#e8d5b7" : "#5C84A0",
            fontFamily: "'Philosopher', serif",
          }}>
            {idioma ? idioma.label : "Idioma —"}
          </span>
        </div>

        {heroCaja ? (
          /* En modo caja, la inicial va pequeña: ayuda a ubicar dentro de la caja */
          <span style={{
            fontSize: 10, color: "#5C84A0", textAlign: "center",
            fontFamily: "'Philosopher', serif",
          }}>
            Inicial: <b style={{ color: "#8F672E" }}>{letra}</b>
          </span>
        ) : (
          /* Sin caja resuelta: sección de caja (elige proveedor / varios / sin configurar) */
          !isSinProveedor(providers) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#5C84A0",
                textTransform: "uppercase", letterSpacing: 1.5,
                fontFamily: "'Philosopher', serif", textAlign: "center",
              }}>
                Caja
              </span>

              {cajas.length === 0 ? (
                <span style={{ fontSize: 11, color: "#5C84A0", fontStyle: "italic", textAlign: "center" }}>
                  Elige proveedor
                </span>
              ) : (
                cajas.map(({ prov, caja }) => (
                  <div key={prov} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {cajas.length > 1 && (
                      <span style={{ fontSize: 10, color: "#8F672E", textAlign: "center", fontFamily: "'Literata', serif" }}>
                        {prov}
                      </span>
                    )}
                    {caja ? (
                      <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                        padding: "8px", borderRadius: 8,
                        background: "#1a1206", border: "1px solid #8F672E",
                      }}>
                        <span style={{
                          fontFamily: "'Philosopher', serif", fontSize: 14, fontWeight: 700,
                          color: "#B08343", textAlign: "center", lineHeight: 1.2,
                        }}>
                          {caja.nombre}
                        </span>
                        <span style={{ fontSize: 10, color: "#5C84A0", fontFamily: "monospace" }}>
                          {caja.letraDesde}–{caja.letraHasta}
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: "#5C84A0", fontStyle: "italic", textAlign: "center" }}>
                        Sin caja configurada
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )
        )}
      </div>
    </div>
    </>
  );
}

// ─── Enlace a la tirilla del pedido ─────────────────────────────────────────
// Salta a la página del bot de Tirillas con el pedido ya cargado (?order=N).
function TirillaLink({ orderName, block, isPickup }: {
  orderName: string;
  block?: boolean;
  isPickup?: boolean | null;
}) {
  const num = orderName.replace(/^#/, "");
  const etiqueta =
    isPickup === true ? "🏷️ Tirilla pickup"
    : isPickup === false ? "🏷️ Tirilla envío"
    : "🏷️ Tirilla";
  return (
    <Link
      to={`/app/bots/tirillas?order=${encodeURIComponent(num)}`}
      onClick={(e) => e.stopPropagation()}
      title="Generar e imprimir la tirilla de este pedido"
      style={{
        display: block ? "flex" : "inline-flex",
        width: block ? "100%" : undefined,
        boxSizing: "border-box",
        alignItems: "center", justifyContent: "center", gap: 6,
        padding: block ? "8px 10px" : "6px 12px",
        borderRadius: 8, textDecoration: "none", whiteSpace: "nowrap",
        background: "#122F43", border: "1px solid #5C84A066", color: "#9BC1D9",
        fontSize: 12.5, fontWeight: 700, fontFamily: "'Philosopher', serif",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#5C84A0"; e.currentTarget.style.color = "#0E151D"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "#122F43"; e.currentTarget.style.color = "#9BC1D9"; }}
    >
      {etiqueta}
    </Link>
  );
}

// ─── Order Info Band ──────────────────────────────────────────────────────────

function OrderInfoBand({ info }: { info: OrderInfo }) {
  const addr = info.address;
  const hasAddr = !!(addr && (addr.direccion1 || addr.ciudad || addr.provincia));
  const hasAny =
    info.customer_name || info.phone || info.email ||
    hasAddr || info.is_pickup || info.shipping_method ||
    (info.tracking_numbers?.length ?? 0) > 0;
  if (!hasAny) return null;

  const LABEL: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: "#5C84A0",
    textTransform: "uppercase", letterSpacing: 1.5,
    fontFamily: "'Philosopher', serif",
  };
  const STRONG: React.CSSProperties = {
    fontSize: 14, color: "#e8d5b7", fontFamily: "'Literata', serif",
  };
  const SUB: React.CSSProperties = {
    fontSize: 12, color: "#5C84A0", fontFamily: "monospace",
    wordBreak: "break-word",
  };

  return (
    // Vive dentro de la columna scrolleable del pedido (sin padding propio:
    // la columna ya da separación con su gap)
    <div>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "12px 32px",
        padding: "14px 18px", borderRadius: 10,
        background: "#0E1D2B", border: "1px solid #24445D50",
      }}>
        {/* Cliente */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 200 }}>
          <span style={LABEL}>Cliente</span>
          <span style={STRONG}>{info.customer_name ?? "—"}</span>
          {(info.phone || info.email) && (
            <span style={SUB}>{[info.phone, info.email].filter(Boolean).join("  ·  ")}</span>
          )}
        </div>

        {/* Envío / Retiro */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 240, flex: 1 }}>
          <span style={LABEL}>{info.is_pickup ? "Retiro en tienda" : "Envío"}</span>
          {info.is_pickup ? (
            <span style={STRONG}>🏬 Recoge en tienda</span>
          ) : hasAddr ? (
            <>
              <span style={STRONG}>
                {[addr!.direccion1, addr!.direccion2].filter(Boolean).join(", ") || "—"}
              </span>
              <span style={SUB}>
                {[addr!.ciudad, addr!.provincia, addr!.pais].filter(Boolean).join(", ")}
                {addr!.zip ? `  ·  ${addr!.zip}` : ""}
              </span>
            </>
          ) : (
            <span style={SUB}>Sin dirección registrada</span>
          )}
          {info.shipping_method && <span style={SUB}>🚚 {info.shipping_method}</span>}
        </div>

        {/* Tracking */}
        {(info.tracking_numbers?.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 160 }}>
            <span style={LABEL}>Guía</span>
            {info.tracking_numbers.map((t) => (
              <span key={t} style={STRONG}>📦 {t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PedidosPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<AllocationMap>({});
  const [gestionados, setGestionados] = useState<Record<string, boolean>>({});
  const [noFisicos, setNoFisicos] = useState<Record<string, boolean>>({});
  const [dryRun, setDryRun] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);

  const fetchOrder = useCallback(async (numArg?: string) => {
    const num = (numArg ?? orderNumber).replace("#", "").trim();
    if (!num) return;
    setLoading(true);
    setError(null);
    setOrder(null);
    setAllocations({});
    setGestionados({});
    setNoFisicos({});
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/pedidos?order=${num}`);
      const data = (await res.json().catch(() => null)) as (Order & { status?: string; error?: string }) | null;
      if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
      // El backend responde 200 con {status:"not_found"} cuando el pedido no existe
      if (!data || data.status === "not_found" || !Array.isArray(data.items)) {
        throw new Error(`El pedido #${num} no existe`);
      }
      setOrder(data);
      const initial: AllocationMap = {};
      for (const item of data.items) {
        if (!isSinProveedor(item.providers)) {
          if (item.providers.length === 1) {
            initial[item.variant_id] = { [item.providers[0]]: item.quantity };
          } else {
            // Multi-proveedor: si The Vault es opción, se pre-asigna a él.
            const tv = proveedorTheVault(item.providers);
            initial[item.variant_id] = tv ? { [tv]: item.quantity } : {};
          }
        } else {
          initial[item.variant_id] = { "Sin proveedor": item.quantity };
        }
      }
      setAllocations(initial);
      const initGestionados: Record<string, boolean> = {};
      const initNoFisicos: Record<string, boolean> = {};
      for (const item of data.items) {
        initGestionados[item.variant_id] = item.gestionado;
        initNoFisicos[item.variant_id] = item.no_fisico;
      }
      setGestionados(initGestionados);
      setNoFisicos(initNoFisicos);
    } catch (e: any) {
      setError(e.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const res = await fetch(`/api/pedidos?list=pending`);
      const data = (await res.json().catch(() => null)) as
        | { orders?: PendingOrder[]; error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
      setPendingOrders(Array.isArray(data?.orders) ? data!.orders! : []);
    } catch (e: any) {
      setPendingError(e.message ?? "No se pudieron cargar los pendientes");
    } finally {
      setPendingLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // Mapa de cajas físicas (configurable en /app/ubicaciones). Se carga una vez;
  // si falla, la vista sigue funcionando sin la ubicación.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ubicaciones");
        if (!res.ok) return;
        const data = await res.json();
        setUbicaciones(Array.isArray(data?.ubicaciones) ? data.ubicaciones : []);
      } catch {
        /* silencioso: la ubicación es informativa, no bloquea el flujo */
      }
    })();
  }, []);

  const handleAllocationChange = useCallback(
    (variantId: string, alloc: ItemAllocation) => {
      setAllocations((prev) => ({ ...prev, [variantId]: alloc }));
    }, []
  );

  const handleToggleGestionado = useCallback((variantId: string) => {
    setGestionados((prev) => {
      const turningOn = !prev[variantId];
      if (turningOn) setNoFisicos((n) => ({ ...n, [variantId]: false }));
      return { ...prev, [variantId]: turningOn };
    });
  }, []);

  const handleToggleNoFisico = useCallback((variantId: string) => {
    setNoFisicos((prev) => {
      const turningOn = !prev[variantId];
      if (turningOn) setGestionados((g) => ({ ...g, [variantId]: false }));
      return { ...prev, [variantId]: turningOn };
    });
  }, []);

  function validate(): string | null {
    if (!order) return "No hay pedido cargado";
    for (const item of order.items) {
      const esNoFisico = noFisicos[item.variant_id];
      const esGestionado = gestionados[item.variant_id];

      // No físico: se salta toda validación de proveedor y gestionado
      if (esNoFisico) continue;

      // Validar proveedor
      if (!isSinProveedor(item.providers)) {
        const alloc = allocations[item.variant_id] ?? {};
        if (item.providers.length === 1) {
          if (!alloc[item.providers[0]]) return `Selecciona proveedor para "${item.title}"`;
        } else {
          const total = totalAllocated(alloc);
          if (total !== item.quantity) return `"${item.title}": asigna ${item.quantity} ud. (actual: ${total})`;
        }
      }

      // Validar que esté gestionado
      if (!esGestionado) return `"${item.title}" no está marcado como gestionado`;
    }
    return null;
  }

  async function handleSubmit() {
    if (isAlistado) {
      setError(`El pedido ${order!.order_name} ya está alistado. No se permiten modificaciones.`);
      return;
    }
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);
    const body = {
      order_name: order!.order_name,
      order_id: order!.order_id,
      tags: order!.tags,
      dry_run: dryRun,
      allocations: Object.entries(allocations).map(([variant_id, providers]) => ({
        variant_id,
        providers: Object.fromEntries(Object.entries(providers).filter(([, qty]) => qty > 0)),
      })),
      gestionados: Object.entries(gestionados).filter(([, v]) => v).map(([variant_id]) => variant_id),
      no_fisicos: Object.entries(noFisicos).filter(([, v]) => v).map(([variant_id]) => variant_id),
      items: order!.items,
    };
    try {
      const res = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      // Red de seguridad: el proxy solo deja pasar con 200 cuando status
      // es "completed", salvo en su rama `default` (status no contemplado
      // explícitamente) — ahí sí puede llegar acá sin estar completo.
      if (data.status && data.status !== "completed") {
        const detail = data.message
          ?? (Array.isArray(data.errors) ? data.errors.join(" · ") : null)
          ?? `El backend respondió con estado "${data.status}"`;
        throw new Error(detail);
      }
      if (data.excel_warning) {
        setError(data.excel_warning);
      } else {
        const inv = data.inventory;
        const detalle = inv
          ? ` | Actualizados: ${inv.updated ?? 0}, Eliminados: ${inv.removed ?? 0}`
          : "";
        const ful = data.fulfillment;
        const fulMsg =
          ful?.status === "fulfilled" ? " · marcado como preparado en Shopify"
          : ful?.status === "already_fulfilled" ? " · ya estaba preparado en Shopify"
          : ful?.status === "error" ? " · ⚠️ no se pudo marcar preparado (revisar Shopify)"
          : "";
        setSuccessMsg(dryRun
          ? "✓ Dry run exitoso — sin cambios reales guardados"
          : `✓ Pedido procesado y registrado en Excel${detalle}${fulMsg}`);
      }
      // Tras un procesamiento real el pedido queda preparado: refrescamos
      // la lista para que ya no aparezca entre los pendientes.
      if (!dryRun) fetchPending();
    } catch (e: any) {
      setError(e.message ?? "Error al procesar");
    } finally {
      setSubmitting(false);
    }
  }

  const isAlistado = order?.tags?.includes("alistado") ?? false;

  const stats = order ? {
    total: order.items.length,
    gestionados: order.items.filter(i => gestionados[i.variant_id] || noFisicos[i.variant_id]).length,
    sinProveedor: order.items.filter((i) => isSinProveedor(i.providers)).length,
    totalCOP: order.items.reduce((s, i) => s + i.price * i.quantity, 0),
  } : null;

  // Volver a pendientes (reutilizado arriba y abajo).
  const handleBack = () => {
    setOrder(null); setError(null); setSuccessMsg(null);
    // Refrescar pendientes al volver: el refresh post-procesar corre apenas
    // termina el POST y Shopify puede aún no reflejar el cambio; al regresar ya
    // pasaron segundos y la foto es la real.
    fetchPending();
  };

  // Botones "Atrás" y "Confirmar/Simular" — se renderizan tanto en la cabecera
  // (arriba) como en la barra de acción (abajo) para usarlos sin scrollear.
  const backBtn = (
    <button
      onClick={handleBack}
      title="Volver a pendientes"
      style={{
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        background: "#122F43", border: "1px solid #24445D",
        color: "#B08343", fontSize: 18, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >←</button>
  );

  const submitBtn = (
    <button
      onClick={handleSubmit}
      disabled={submitting || isAlistado}
      style={{
        padding: "10px 28px",
        background: submitting || isAlistado ? "#122F43" : dryRun ? "#B08343" : "#8F672E",
        color: submitting || isAlistado ? "#5C84A0" : dryRun ? "#0E151D" : "#e8d5b7",
        border: `1px solid ${isAlistado ? "#374151" : dryRun ? "#8F672E" : "#6A481C"}`,
        borderRadius: 8,
        fontFamily: "'Philosopher', serif",
        fontWeight: 700, fontSize: 14,
        cursor: submitting || isAlistado ? "not-allowed" : "pointer",
        opacity: submitting || isAlistado ? 0.5 : 1,
        transition: "all 0.2s", whiteSpace: "nowrap",
      }}
    >
      {isAlistado ? "🔒 Pedido alistado" : submitting ? "Procesando..." : dryRun ? "▷ Simular gestión" : "✓ Confirmar y guardar"}
    </button>
  );

  return (
    <div style={{
      display: "flex", height: "100vh",
      background: "#0E151D",
      fontFamily: "'Literata', Georgia, serif",
      color: "#e8d5b7", overflow: "hidden",
    }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 272, flexShrink: 0,
        display: "flex", flexDirection: "column",
        borderRight: "1px solid #24445D50",
        background: "#0E1D2B", height: "100%",
      }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 24px 20px" }}>
          <img
            src="https://cdn.shopify.com/s/files/1/0710/0029/3568/files/Asset_11.png?v=1757432835"
            alt="The Vault"
            style={{ width: 200 }}
          />
        </div>

        <div style={{ height: 1, background: "#24445D40", margin: "0 20px" }} />

        {/* Búsqueda */}
        <div style={{ padding: "20px 20px 16px" }}>
          <p style={{
            fontSize: 10, fontWeight: 700, color: "#5C84A0",
            textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10,
            fontFamily: "'Philosopher', serif",
          }}>
            Número de pedido
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="text"
              placeholder="#1463"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchOrder()}
              style={{
                width: "100%", padding: "9px 12px",
                background: "#0E151D", border: "1px solid #24445D",
                borderRadius: 8, color: "#e8d5b7", fontSize: 14,
                outline: "none", boxSizing: "border-box",
                fontFamily: "'Literata', serif",
              }}
            />
            <button
              onClick={() => fetchOrder()}
              disabled={loading || !orderNumber.trim()}
              style={{
                width: "100%", padding: "9px 0",
                background: loading || !orderNumber.trim() ? "#122F43" : "#B08343",
                color: loading || !orderNumber.trim() ? "#5C84A0" : "#0E151D",
                border: "1px solid #8F672E",
                borderRadius: 8,
                fontFamily: "'Philosopher', serif",
                fontWeight: 700, fontSize: 13,
                cursor: loading || !orderNumber.trim() ? "not-allowed" : "pointer",
                transition: "all 0.2s",
              }}
            >
              {loading ? "Cargando..." : "Traer pedido"}
            </button>
          </div>
        </div>

        <div style={{ height: 1, background: "#24445D40", margin: "0 20px" }} />

        {/* Instructivo */}
        <div style={{ padding: "16px 20px" }}>
          <p style={{
            fontSize: 10, fontWeight: 700, color: "#5C84A0",
            textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12,
            fontFamily: "'Philosopher', serif",
          }}>
            Cómo usar
          </p>
          <ol style={{ display: "flex", flexDirection: "column", gap: 10, listStyle: "none", padding: 0, margin: 0 }}>
            {[
              "Introduce el número de pedido",
              "Pulsa 'Traer pedido' o Enter",
              "Asigna proveedor a cada ítem",
              "Confirma y exporta",
            ].map((step, i) => (
              <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#5C84A0" }}>
                <span style={{
                  flexShrink: 0, width: 18, height: 18, borderRadius: "50%",
                  background: "#122F43", border: "1px solid #24445D",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 700, color: "#B08343",
                  fontFamily: "'Philosopher', serif",
                }}>
                  {i + 1}
                </span>
                <span style={{ lineHeight: 1.5, paddingTop: 1 }}>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Configurar mapa de cajas — solo en la vista inicial (sin pedido
            cargado); al traer un pedido este acceso desaparece. */}
        {!order && (
          <>
            <div style={{ height: 1, background: "#24445D40", margin: "0 20px" }} />
            <div style={{ padding: "16px 20px" }}>
              <Link
                to="/app/ubicaciones"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  width: "100%", padding: "9px 0", boxSizing: "border-box",
                  background: "#122F43", color: "#B08343",
                  border: "1px solid #24445D", borderRadius: 8,
                  fontFamily: "'Philosopher', serif", fontWeight: 700, fontSize: 13,
                  textDecoration: "none",
                }}
              >
                📦 Configurar cajas
              </Link>
              <p style={{
                fontSize: 10, color: "#5C84A0", textAlign: "center",
                marginTop: 8, lineHeight: 1.4,
              }}>
                Define dónde se archiva cada carta (proveedor · color · coste · letra).
              </p>
            </div>
          </>
        )}

        {/* Stats */}
        {stats && (
          <>
            <div style={{ height: 1, background: "#24445D40", margin: "0 20px" }} />
            <div style={{ padding: "16px 20px" }}>
              <p style={{
                fontSize: 10, fontWeight: 700, color: "#5C84A0",
                textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12,
                fontFamily: "'Philosopher', serif",
              }}>
                Resumen {order?.order_name}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Total ítems", value: stats.total, color: "#e8d5b7" },
                  { label: "Gestionados", value: stats.gestionados, color: "#B08343" },
                  { label: "Sin proveedor", value: stats.sinProveedor, color: "#B08343" },
                ].map((s) => (
                  <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#5C84A0" }}>{s.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: "'Philosopher', serif" }}>{s.value}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: "#24445D40", margin: "2px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#5C84A0" }}>Valor total</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#B08343", fontFamily: "'Philosopher', serif" }}>
                    {formatCOP(stats.totalCOP)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <div style={{ marginTop: "auto", padding: "16px 20px", textAlign: "center" }}>
          <p style={{ fontSize: 10, color: "#24445D", fontFamily: "'Nova Cut', cursive", letterSpacing: 1.5 }}>
            THE VAULT OPS · PEDIDOS
          </p>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Top bar (solo en la vista de pendientes; el header del pedido vive
            DENTRO del scroll para que desaparezca al scrollear) */}
        {!order && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 28px",
            borderBottom: "1px solid #24445D50",
            background: "#0E1D2B", flexShrink: 0,
          }}>
            <h1 style={{
              fontFamily: "'Nova Cut', cursive", fontSize: 30,
              color: "#B08343", margin: 0, letterSpacing: 2,
            }}>
              Gestor de Pedidos
            </h1>
          </div>
        )}

        {/* Alertas */}
        {(error || successMsg) && (
          <div style={{ padding: "12px 28px 0", flexShrink: 0 }}>
            {error && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 16px", borderRadius: 8,
                background: "#2a0e0e", border: "1px solid #7f1d1d",
                color: "#fca5a5", fontSize: 13,
              }}>
                ⚠️ {error}
              </div>
            )}
            {successMsg && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 16px", borderRadius: 8,
                background: "#1a1206", border: "1px solid #8F672E",
                color: "#B08343", fontSize: 13, fontWeight: 600,
                fontFamily: "'Philosopher', serif",
              }}>
                {successMsg}
              </div>
            )}
          </div>
        )}

        {/* Lista items — el header del pedido, la info del cliente y la acción
            final viven DENTRO del scroll: no roban espacio de trabajo */}
        {order ? (
          <div className="vault-scroll" style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, margin: "0 auto", width: "100%" }}>

              {/* Header del pedido (scrollea con el contenido) */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {backBtn}
                  <div>
                    <h1 style={{
                      fontFamily: "'Nova Cut', cursive", fontSize: 30,
                      color: "#B08343", margin: 0, letterSpacing: 2,
                    }}>
                      Pedido {order.order_name}
                    </h1>
                    <p style={{ fontSize: 11, color: "#24445D", fontFamily: "monospace", marginTop: 2 }}>
                      {order.order_id}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <TirillaLink orderName={order.order_name} isPickup={order.info?.is_pickup} />
                  {order.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {order.tags.map((tag) => (
                        <span key={tag} style={{
                          fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
                          background: "#122F43", color: "#5C84A0", border: "1px solid #24445D",
                          fontFamily: "'Philosopher', serif",
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {submitBtn}
                </div>
              </div>

              {/* Datos del pedido (cliente, envío) desde la nota */}
              {order.info && <OrderInfoBand info={order.info} />}

              {/* Banner pedido alistado */}
              {isAlistado && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 18px", borderRadius: 8,
                  background: "#1a0a00", border: "2px solid #F97316",
                  color: "#FED7AA", fontSize: 13, fontWeight: 600,
                  fontFamily: "'Philosopher', serif",
                }}>
                  🔒 Este pedido ya fue <strong style={{ color: "#F97316", marginLeft: 4, marginRight: 4 }}>ALISTADO</strong> — no se permiten modificaciones ni en Shopify ni en el Excel.
                </div>
              )}

              {(() => {
                const singles: Record<string, typeof order.items> = {};
                const multiples: typeof order.items = [];
                const sinProveedor: typeof order.items = [];

                for (const item of order.items) {
                  if (isSinProveedor(item.providers)) {
                    sinProveedor.push(item);
                  } else if (item.providers.length === 1) {
                    const key = item.providers[0] ?? "Sin proveedor";
                    if (!singles[key]) singles[key] = [];
                    singles[key].push(item);
                  } else {
                    // Multi-proveedor: si The Vault es opción, va con su grupo
                    // (se prioriza); si no, al grupo "Múltiples proveedores".
                    const tv = proveedorTheVault(item.providers);
                    if (tv) {
                      if (!singles[tv]) singles[tv] = [];
                      singles[tv].push(item);
                    } else {
                      multiples.push(item);
                    }
                  }
                }

                const sortedSingles = Object.entries(singles).sort(([a], [b]) =>
                  a.localeCompare(b, "es")
                );

                const renderGroup = (label: string, items: typeof order.items, accent = false) => (
                  <div key={label}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                      <span style={{
                        fontFamily: "'Philosopher', serif", fontSize: 13, fontWeight: 700,
                        color: accent ? "#5C84A0" : "#B08343",
                        textTransform: "uppercase", letterSpacing: 1.5,
                      }}>
                        {label}
                      </span>
                      <span style={{
                        fontSize: 11, color: "#5C84A0", background: "#122F43",
                        border: "1px solid #24445D", borderRadius: 20,
                        padding: "1px 8px", fontFamily: "monospace",
                      }}>
                        {items.length} ítem{items.length !== 1 ? "s" : ""}
                      </span>
                      <div style={{ flex: 1, height: 1, background: "#24445D40" }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {groupByColor(items).map(([colorKey, colorItems]) => {
                        const meta = COLOR_META[colorKey] ?? COLOR_META.NONE;
                        return (
                          <div key={colorKey}>
                            {/* Subencabezado de color */}
                            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, paddingLeft: 2 }}>
                              <span style={{
                                width: 10, height: 10, borderRadius: "50%",
                                background: meta.dot,
                                boxShadow: "0 0 0 1px #0E151D, 0 0 0 2px #24445D",
                                flexShrink: 0,
                              }} />
                              <span style={{
                                fontFamily: "'Philosopher', serif", fontSize: 11, fontWeight: 600,
                                color: "#8F672E", textTransform: "uppercase", letterSpacing: 1,
                              }}>
                                {meta.label}
                              </span>
                              <span style={{ fontSize: 10, color: "#5C84A0", fontFamily: "monospace" }}>
                                {colorItems.length}
                              </span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {colorItems.map((item) => (
                                <OrderItemCard
                                  key={item.variant_id}
                                  item={item}
                                  allocation={allocations[item.variant_id] ?? {}}
                                  gestionado={gestionados[item.variant_id] ?? false}
                                  noFisico={noFisicos[item.variant_id] ?? false}
                                  ubicaciones={ubicaciones}
                                  onAllocationChange={handleAllocationChange}
                                  onToggleGestionado={handleToggleGestionado}
                                  onToggleNoFisico={handleToggleNoFisico}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );

                return [
                  ...sortedSingles.map(([proveedor, items]) => renderGroup(proveedor, items)),
                  ...(multiples.length > 0 ? [renderGroup("Múltiples proveedores", multiples, true)] : []),
                  ...(sinProveedor.length > 0 ? [renderGroup("Sin proveedor", sinProveedor, true)] : []),
                ];
              })()}

              {/* Acción final: modo + procesar al terminar el flujo (antes era
                  una franja fija abajo que robaba altura de pantalla) */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                padding: "14px 18px", borderRadius: 12, marginBottom: 8,
                background: "#0E1D2B", border: "1px solid #24445D50",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {backBtn}
                  <div
                    onClick={() => setDryRun(!dryRun)}
                    style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                  >
                    <div style={{
                      width: 40, height: 22, borderRadius: 99,
                      background: dryRun ? "#B08343" : "#122F43",
                      position: "relative", transition: "background 0.2s", flexShrink: 0,
                      border: `1px solid ${dryRun ? "#8F672E" : "#24445D"}`,
                    }}>
                      <div style={{
                        position: "absolute", top: 3,
                        left: dryRun ? 20 : 3,
                        width: 14, height: 14, borderRadius: "50%",
                        background: "#e8d5b7", transition: "left 0.2s",
                      }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#e8d5b7", margin: 0, fontFamily: "'Philosopher', serif" }}>
                        {dryRun ? "Modo simulación" : "Modo real"}
                      </p>
                      <p style={{ fontSize: 11, color: "#5C84A0", margin: 0 }}>
                        {dryRun ? "No se guardarán cambios" : "Se guardarán en metadatos y Excel"}
                      </p>
                    </div>
                  </div>
                </div>

                {submitBtn}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
            <img
              src="https://cdn.shopify.com/s/files/1/0710/0029/3568/files/Asset_9_e0d5e097-e5f5-4847-aad0-349d9cae599d.png?v=1759766276"
              alt="The Vault"
              className="vault-loader"
              style={{ width: 340, opacity: 1 }}
            />
            <p style={{
              fontFamily: "'Philosopher', serif", fontSize: 13,
              color: "#8F672E", letterSpacing: 3,
              textTransform: "uppercase", margin: 0,
            }}>
              Cargando pedido...
            </p>
          </div>
        ) : (
          <div className="vault-scroll" style={{ flex: 1, overflowY: "auto", padding: "28px", position: "relative" }}>

            {/* Logo de fondo (marca de agua) */}
            <img
              src="https://cdn.shopify.com/s/files/1/0710/0029/3568/files/Asset_9_e0d5e097-e5f5-4847-aad0-349d9cae599d.png?v=1759766276"
              alt=""
              aria-hidden
              style={{
                position: "absolute",
                top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                width: 340,
                opacity: 0.1,
                filter: "blur(1.5px)",
                pointerEvents: "none",
                userSelect: "none",
                zIndex: 0,
              }}
            />

            <div style={{ maxWidth: 1000, margin: "0 auto", width: "100%", position: "relative", zIndex: 1 }}>

              {/* Cabecera de la sección */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <span style={{
                  fontFamily: "'Philosopher', serif", fontSize: 13, fontWeight: 700,
                  color: "#B08343", textTransform: "uppercase", letterSpacing: 1.5,
                }}>
                  Pedidos por preparar
                </span>
                <span style={{
                  fontSize: 11, color: "#5C84A0", background: "#122F43",
                  border: "1px solid #24445D", borderRadius: 20,
                  padding: "1px 8px", fontFamily: "monospace",
                }}>
                  {pendingOrders.length}
                </span>
                <div style={{ flex: 1, height: 1, background: "#24445D40" }} />
                <button
                  onClick={() => fetchPending()}
                  disabled={pendingLoading}
                  style={{
                    fontSize: 12, fontWeight: 700,
                    color: "#5C84A0", background: "#122F43",
                    border: "1px solid #24445D", borderRadius: 20,
                    padding: "4px 12px", cursor: pendingLoading ? "not-allowed" : "pointer",
                    fontFamily: "'Philosopher', serif",
                  }}
                >
                  {pendingLoading ? "Actualizando…" : "↻ Actualizar"}
                </button>
              </div>

              {pendingError && (
                <div style={{
                  padding: "10px 16px", borderRadius: 8, marginBottom: 16,
                  background: "#2a0e0e", border: "1px solid #7f1d1d",
                  color: "#fca5a5", fontSize: 13,
                }}>
                  ⚠️ {pendingError}
                </div>
              )}

              {pendingLoading && pendingOrders.length === 0 ? (
                <p style={{ color: "#5C84A0", fontSize: 14 }}>Cargando pedidos…</p>
              ) : pendingOrders.length === 0 ? (
                <p style={{ color: "#5C84A0", fontSize: 14 }}>
                  No hay pedidos pendientes por preparar 🎉
                </p>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 14,
                }}>
                  {pendingOrders.map((p) => (
                    <div
                      key={p.order_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setOrderNumber(p.order_name); fetchOrder(p.order_name); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOrderNumber(p.order_name);
                          fetchOrder(p.order_name);
                        }
                      }}
                      style={{
                        textAlign: "left", cursor: "pointer",
                        display: "flex", flexDirection: "column", gap: 8,
                        padding: 16, borderRadius: 12,
                        border: "1px solid #24445D50", background: "#0E1D2B",
                        transition: "all 0.18s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#8F672E";
                        e.currentTarget.style.background = "#122438";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#24445D50";
                        e.currentTarget.style.background = "#0E1D2B";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                        <span style={{
                          fontFamily: "'Nova Cut', cursive", fontSize: 22,
                          color: "#B08343", letterSpacing: 1,
                        }}>
                          {p.order_name}
                        </span>
                        <span style={{ fontSize: 11, color: "#24445D", fontFamily: "monospace" }}>
                          {formatDate(p.created_at)}
                        </span>
                      </div>
                      <span style={{
                        fontSize: 13, color: "#e8d5b7",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        fontFamily: "'Literata', serif",
                      }}>
                        {p.customer_name ?? "Sin nombre"}
                      </span>
                      {p.tags.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {p.tags.map((t) => (
                            <span key={t} style={{
                              fontSize: 10, fontWeight: 700,
                              color: "#5C84A0", background: "#122F43",
                              border: "1px solid #24445D", borderRadius: 20,
                              padding: "1px 8px", fontFamily: "'Philosopher', serif",
                            }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
                        <span style={{
                          fontSize: 12, color: "#5C84A0", background: "#122F43",
                          border: "1px solid #24445D50", borderRadius: 20, padding: "2px 10px",
                          fontFamily: "monospace",
                        }}>
                          {p.items_count} íts
                        </span>
                        <span style={{
                          fontSize: 14, fontWeight: 700, color: "#B08343",
                          fontFamily: "'Philosopher', serif",
                        }}>
                          {formatCOP(p.total)}
                        </span>
                      </div>
                      <TirillaLink orderName={p.order_name} isPickup={p.is_pickup} block />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}