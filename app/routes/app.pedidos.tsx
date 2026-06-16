import { useState, useCallback, useEffect } from "react";

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
  quantity: number;
  sku: string;
  providers: string[];
  proveedores_cantidades: Record<string, ProveedorInfo>;
  price: number;
  gestionado: boolean;
  no_fisico: boolean;
}

interface Order {
  status: string;
  order_name: string;
  order_id: string;
  tags: string[];
  items: OrderItem[];
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

function isSinProveedor(providers: string[]) {
  return providers.length === 1 && providers[0] === "Sin proveedor";
}

function totalAllocated(alloc: ItemAllocation) {
  return Object.values(alloc).reduce((s, v) => s + v, 0);
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
  item, allocation, gestionado, noFisico, onAllocationChange, onToggleGestionado, onToggleNoFisico,
}: {
  item: OrderItem;
  allocation: ItemAllocation;
  gestionado: boolean;
  noFisico: boolean;
  onAllocationChange: (variantId: string, alloc: ItemAllocation) => void;
  onToggleGestionado: (variantId: string) => void;
  onToggleNoFisico: (variantId: string) => void;
}) {
  const [lightbox, setLightbox] = useState(false);
  const { providers, quantity } = item;
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
      <div style={{
        display: "flex", gap: 14, padding: 16, borderRadius: 12,
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
          onClick={() => setLightbox(true)}
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
          </h3>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => onToggleNoFisico(item.variant_id)}
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
              onClick={() => onToggleGestionado(item.variant_id)}
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

        <ProviderSelector
          item={item}
          allocation={allocation}
          onChange={(alloc) => onAllocationChange(item.variant_id, alloc)}
        />
      </div>
    </div>
    </>
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

  const fetchOrder = useCallback(async () => {
    const num = orderNumber.replace("#", "").trim();
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
            initial[item.variant_id] = {};
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
      if (data.excel_warning) {
        setError(data.excel_warning);
      } else {
        const inv = data.inventory;
        const detalle = inv
          ? ` | Actualizados: ${inv.updated ?? 0}, Eliminados: ${inv.removed ?? 0}`
          : "";
        setSuccessMsg(dryRun
          ? "✓ Dry run exitoso — sin cambios reales guardados"
          : `✓ Pedido procesado y registrado en Excel${detalle}`);
      }
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
              onClick={fetchOrder}
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

        {/* Top bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 28px",
          borderBottom: "1px solid #24445D50",
          background: "#0E1D2B", flexShrink: 0,
        }}>
          <div>
            <h1 style={{
              fontFamily: "'Nova Cut', cursive", fontSize: 30,
              color: "#B08343", margin: 0, letterSpacing: 2,
            }}>
              {order ? `Pedido ${order.order_name}` : "Gestor de Pedidos"}
            </h1>
            {order && (
              <p style={{ fontSize: 11, color: "#24445D", fontFamily: "monospace", marginTop: 2 }}>
                {order.order_id}
              </p>
            )}
          </div>
          {order && order.tags.length > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
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
        </div>

        {/* Banner pedido alistado */}
        {isAlistado && (
          <div style={{
            padding: "12px 28px 0", flexShrink: 0,
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 18px", borderRadius: 8,
              background: "#1a0a00", border: "2px solid #F97316",
              color: "#FED7AA", fontSize: 13, fontWeight: 600,
              fontFamily: "'Philosopher', serif",
            }}>
              🔒 Este pedido ya fue <strong style={{ color: "#F97316", marginLeft: 4, marginRight: 4 }}>ALISTADO</strong> — no se permiten modificaciones ni en Shopify ni en el Excel.
            </div>
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

        {/* Lista items */}
        {order ? (
          <div className="vault-scroll" style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, margin: "0 auto", width: "100%" }}>
              {(() => {
                const singles: Record<string, typeof order.items> = {};
                const multiples: typeof order.items = [];
                const sinProveedor: typeof order.items = [];

                for (const item of order.items) {
                  if (isSinProveedor(item.providers)) {
                    sinProveedor.push(item);
                  } else if (item.providers.length > 1) {
                    multiples.push(item);
                  } else {
                    const key = item.providers[0] ?? "Sin proveedor";
                    if (!singles[key]) singles[key] = [];
                    singles[key].push(item);
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
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {items.map((item) => (
                        <OrderItemCard
                          key={item.variant_id}
                          item={item}
                          allocation={allocations[item.variant_id] ?? {}}
                          gestionado={gestionados[item.variant_id] ?? false}
                          noFisico={noFisicos[item.variant_id] ?? false}
                          onAllocationChange={handleAllocationChange}
                          onToggleGestionado={handleToggleGestionado}
                          onToggleNoFisico={handleToggleNoFisico}
                        />
                      ))}
                    </div>
                  </div>
                );

                return [
                  ...sortedSingles.map(([proveedor, items]) => renderGroup(proveedor, items)),
                  ...(multiples.length > 0 ? [renderGroup("Múltiples proveedores", multiples, true)] : []),
                  ...(sinProveedor.length > 0 ? [renderGroup("Sin proveedor", sinProveedor, true)] : []),
                ];
              })()}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
            <img
              src="https://cdn.shopify.com/s/files/1/0710/0029/3568/files/Asset_9_e0d5e097-e5f5-4847-aad0-349d9cae599d.png?v=1759766276"
              alt="The Vault"
              className={loading ? "vault-loader" : undefined}
              style={{ width: 340, opacity: loading ? 1 : 0.85, transition: "opacity 0.3s" }}
            />
            {loading && (
              <p style={{
                fontFamily: "'Philosopher', serif", fontSize: 13,
                color: "#8F672E", letterSpacing: 3,
                textTransform: "uppercase", margin: 0,
              }}>
                Cargando pedido...
              </p>
            )}
          </div>
        )}

        {/* Footer acción */}
        {order && (
          <div style={{
            flexShrink: 0, padding: "14px 28px",
            borderTop: "1px solid #24445D50",
            background: "#0E1D2B",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          }}>
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
          </div>
        )}
      </main>
    </div>
  );
}