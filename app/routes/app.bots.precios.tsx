import { useEffect, useState, useCallback, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

// Paleta de marca
// #442E17 #0E1D2B #6A481C #122F43 #8F672E #24445D #0E151D

// ─── Tipos (espejo de la API /precios del backend) ────────────────────────────

type Alcance = "all_products" | "collection_products" | "specific_product" | "all_zero_price";

interface CartaDetalle {
  titulo: string;
  set_name: string | null;
  image_url: string | null;
  precio_anterior: number | null;
  precio_nuevo: number | null;
  estado: string | null;
}

interface CartaPreview {
  titulo: string;
  set_name: string | null;
  image_url: string | null;
  precio_anterior: number | null;
}

interface Job {
  job_id: string;
  alcance: Alcance;
  filtro: string[] | string | null;
  aplicar: boolean;
  notificar: boolean;
  estado: "en_cola" | "ejecutando" | "completado" | "error" | "cancelado";
  fase: string | null;
  total: number;
  procesadas: number;
  actualizadas: number;
  sin_cambio: number;
  no_encontradas: number;
  porcentaje?: number;
  eta_segundos?: number | null;
  carta_actual: string | null;
  carta_actual_detalle?: CartaDetalle | null;
  proximas?: CartaPreview[];
  creado: string;
  iniciado: string | null;
  finalizado: string | null;
  error: string | null;
}

interface JobResult extends Job {
  resumen?: {
    alcance: string;
    total: number;
    procesadas: number;
    actualizadas: number;
    sin_cambio: number;
    no_encontradas: number;
    total_diferencia: number;
  } | null;
}

// ─── Helpers de presentación ──────────────────────────────────────────────────

const ALCANCES: { value: Alcance; label: string }[] = [
  { value: "all_products", label: "Toda la tienda" },
  { value: "collection_products", label: "Una colección" },
  { value: "specific_product", label: "Un producto específico" },
  { value: "all_zero_price", label: "Solo cartas con precio en $0" },
];

const FASES: Record<string, string> = {
  cargando_cache: "Cargando cache de precios…",
  consultando_shopify: "Trayendo cartas desde Shopify (3 minutos aprox)…",
  procesando: "Comparando precios contra SCG…",
  guardando_cache: "Guardando cache…",
  finalizado: "Finalizado",
};

const ESTADO_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  en_cola: { bg: "#442E1740", border: "#6A481C", text: "#fdba74" },
  ejecutando: { bg: "#122F4380", border: "#24445D", text: "#93c5fd" },
  completado: { bg: "#8F672E40", border: "#8F672E", text: "#e8d5b7" },
  error: { bg: "#2a0e0e", border: "#7f1d1d", text: "#fca5a5" },
  cancelado: { bg: "#3a2f1f", border: "#6A481C", text: "#d6b88a" },
};

const ALCANCE_LABEL: Record<string, string> = Object.fromEntries(
  ALCANCES.map((a) => [a.value, a.label]),
);

function formatearEta(segundos: number | null | undefined): string {
  if (segundos == null) return "calculando…";
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  const partes: string[] = [];
  if (h) partes.push(`${h}h`);
  if (h || m) partes.push(`${m}m`);
  partes.push(`${s}s`);
  return `≈ ${partes.join(" ")}`;
}

function formatearFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatearCOP(valor: number): string {
  const signo = valor < 0 ? "-" : "+";
  return `${signo} $ ${Math.round(Math.abs(valor)).toLocaleString("es-CO")}`;
}

function normalizarProductId(input: string): string {
  const valor = input.trim();
  if (!valor) return valor;
  if (valor.startsWith("gid://shopify/Product/")) return valor;

  // Acepta también la URL del admin (.../products/123) o el número pelado
  const match = valor.match(/(\d+)\s*$/);
  if (match) return `gid://shopify/Product/${match[1]}`;

  return valor;
}

function formatearFiltro(j: Pick<Job, "alcance" | "filtro">): string {
  if (j.alcance === "collection_products" && Array.isArray(j.filtro)) return j.filtro.join(", ");
  if (j.alcance === "specific_product" && typeof j.filtro === "string") return j.filtro;
  return "—";
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function PreciosPage() {
  const [alcance, setAlcance] = useState<Alcance>("all_products");
  const [coleccionTexto, setColeccionTexto] = useState("");
  const [productId, setProductId] = useState("");
  const [aplicar, setAplicar] = useState(true);
  const [notificar, setNotificar] = useState(true);
  const [lanzando, setLanzando] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [resultado, setResultado] = useState<JobResult | null>(null);
  const [historial, setHistorial] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cancelSolicitado, setCancelSolicitado] = useState(false);
  // Estela de cartas ya procesadas, acumulada en el cliente desde el polling
  // (el backend solo expone la carta actual + las próximas).
  const [trail, setTrail] = useState<CartaDetalle[]>([]);

  const cargarHistorial = useCallback(async () => {
    try {
      const r = await fetch("/api/precios/jobs");
      if (r.ok) setHistorial(await r.json());
    } catch {
      /* el historial no es crítico */
    }
  }, []);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  // Polling del job activo cada 3s hasta que termine
  useEffect(() => {
    if (!job || job.estado === "completado" || job.estado === "error" || job.estado === "cancelado") return;

    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/precios/jobs/${job.job_id}`);
        if (!r.ok) return;
        const j: Job = await r.json();
        setJob(j);

        // Acumular la carta actual en la estela (si cambió respecto a la última)
        const det = j.carta_actual_detalle;
        if (det && det.titulo) {
          setTrail((prev) => {
            if (prev.length && prev[prev.length - 1].titulo === det.titulo) return prev;
            return [...prev, det].slice(-4);
          });
        }

        if (j.estado === "completado" || j.estado === "error" || j.estado === "cancelado") {
          const rr = await fetch(`/api/precios/jobs/${j.job_id}?result=1`);
          if (rr.ok) setResultado(await rr.json());
          cargarHistorial();
        }
      } catch {
        /* reintenta en el siguiente tick */
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [job?.job_id, job?.estado, cargarHistorial]);

  async function iniciarEscaneo() {
    setLanzando(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { alcance, aplicar, notificar };
      if (alcance === "collection_products") {
        payload.coleccion = coleccionTexto.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (alcance === "specific_product") {
        payload.product_id = normalizarProductId(productId);
      }

      const r = await fetch("/api/precios/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? data.error ?? `HTTP ${r.status}`);
      setResultado(null);
      setTrail([]);
      setCancelSolicitado(false);
      setJob(data);
      cargarHistorial();
    } catch (e: any) {
      setError(e.message ?? "Error iniciando el escaneo");
    } finally {
      setLanzando(false);
    }
  }

  async function cancelarEscaneo() {
    if (!job) return;
    setCancelSolicitado(true);
    try {
      const r = await fetch(`/api/precios/jobs/${job.job_id}/cancelar`, { method: "POST" });
      if (r.ok) setJob(await r.json());
      else setCancelSolicitado(false); // falló: permitir reintentar
    } catch {
      setCancelSolicitado(false);
    }
  }

  async function verJob(j: Job) {
    setError(null);
    setResultado(null);
    setTrail([]);
    setCancelSolicitado(false);
    setJob(j);
    if (j.estado === "completado" || j.estado === "error" || j.estado === "cancelado") {
      try {
        const r = await fetch(`/api/precios/jobs/${j.job_id}?result=1`);
        if (r.ok) setResultado(await r.json());
      } catch {
        /* se muestra sin detalle */
      }
    }
  }

  function nuevoEscaneo() {
    setJob(null);
    setResultado(null);
    setError(null);
    setTrail([]);
    setCancelSolicitado(false);
  }

  const puedeIniciar =
    !lanzando &&
    (alcance !== "collection_products" || coleccionTexto.trim().length > 0) &&
    (alcance !== "specific_product" || productId.trim().length > 0);

  const pct = job?.porcentaje ?? (job && job.total ? Math.round((job.procesadas * 100) / job.total) : 0);
  const resumen = resultado?.resumen;

  return (
    <div style={{ fontFamily: "'Literata', Georgia, serif", color: "#e8d5b7" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontFamily: "'Philosopher', serif", fontSize: 22, fontWeight: 700, color: "#e8d5b7", margin: 0 }}>
            Actualizador de Precios
          </h2>
          <p style={{ fontSize: 13, color: "#8F672E", marginTop: 4 }}>
            Compara contra SCG y actualiza Shopify, con seguimiento en vivo
          </p>
        </div>
        {job && (
          <div style={{ display: "flex", gap: 10 }}>
            {(job.estado === "ejecutando" || job.estado === "en_cola") && (
              <button
                onClick={cancelarEscaneo}
                disabled={cancelSolicitado}
                style={{ ...botonCancelar, opacity: cancelSolicitado ? 0.6 : 1, cursor: cancelSolicitado ? "default" : "pointer" }}
              >
                {cancelSolicitado ? "Cancelando…" : "⏹ Cancelar"}
              </button>
            )}
            <button onClick={nuevoEscaneo} style={botonSecundario}>
              ＋ Nuevo escaneo
            </button>
          </div>
        )}
      </div>

      {/* Error global */}
      {error && (
        <div style={{
          padding: "12px 16px", borderRadius: 8, background: "#2a0e0e",
          border: "1px solid #7f1d1d", color: "#fca5a5", fontSize: 13, marginBottom: 20,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Panel de configuración (cuando no hay job activo) ── */}
      {!job && (
        <div style={panel}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            {ALCANCES.map((a) => (
              <button
                key={a.value}
                onClick={() => setAlcance(a.value)}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: `1px solid ${alcance === a.value ? "#8F672E" : "#24445D"}`,
                  background: alcance === a.value ? "#442E1740" : "#0E151D",
                  color: alcance === a.value ? "#e8d5b7" : "#b8a07a",
                  fontSize: 13,
                  fontFamily: "'Literata', Georgia, serif",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {a.label}
              </button>
            ))}
          </div>

          {alcance === "collection_products" && (
            <input
              type="text"
              placeholder="Nombres de colección, separados por coma (ej: Fallout, Edge of Eternities)"
              value={coleccionTexto}
              onChange={(e) => setColeccionTexto(e.target.value)}
              style={inputStyle}
            />
          )}

          {alcance === "specific_product" && (
            <input
              type="text"
              placeholder="Pega el ID, la URL del admin o el gid://shopify/Product/... — cualquiera sirve"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              style={inputStyle}
            />
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
            <ToggleRow
              checked={aplicar}
              onChange={setAplicar}
              titulo="Aplicar directo a Shopify"
              sub={aplicar ? "Actualiza los precios en la tienda" : "Dry-run: solo calcula y muestra diferencias"}
            />
            <ToggleRow
              checked={notificar}
              onChange={setNotificar}
              titulo="Notificar por Telegram"
              sub={notificar ? "Envía el resumen y los cambios al canal" : "Sin notificaciones"}
            />
          </div>

          <div style={{ marginTop: 20 }}>
            <button onClick={iniciarEscaneo} disabled={!puedeIniciar} style={{
              ...botonPrimario,
              opacity: puedeIniciar ? 1 : 0.5,
              cursor: puedeIniciar ? "pointer" : "not-allowed",
            }}>
              {lanzando ? "Iniciando…" : "⚡ Iniciar escaneo"}
            </button>
          </div>
        </div>
      )}

      {/* ── Panel de progreso / resultado ── */}
      {job && (
        <div style={panel}>
          {/* Cabecera del job */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <div>
              <span style={{ fontFamily: "monospace", fontSize: 13, color: "#b8a07a" }}>{ALCANCE_LABEL[job.alcance] ?? job.alcance}</span>
              {formatearFiltro(job) !== "—" && (
                <span style={{ fontSize: 12, color: "#8F672E", marginLeft: 10 }}>· {formatearFiltro(job)}</span>
              )}
              {!job.aplicar && (
                <span style={{ fontSize: 11, color: "#fdba74", marginLeft: 10 }}>(dry-run, sin aplicar)</span>
              )}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
              padding: "3px 12px", borderRadius: 20,
              background: ESTADO_COLOR[job.estado]?.bg, border: `1px solid ${ESTADO_COLOR[job.estado]?.border}`,
              color: ESTADO_COLOR[job.estado]?.text,
            }}>
              {job.estado.replace("_", " ")}
            </span>
          </div>

          {/* Progreso en vivo */}
          {(job.estado === "ejecutando" || job.estado === "en_cola") && (
            <>
              <style>{`
                @keyframes tv-sweep { 0% { left: -35%; } 100% { left: 105%; } }
                @keyframes tv-stripes { 0% { background-position: 0 0; } 100% { background-position: 28px 0; } }
                @keyframes tv-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
              `}</style>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: "#e8d5b7", display: "flex", alignItems: "center" }}>
                  <span style={{
                    display: "inline-block", width: 8, height: 8, borderRadius: 99,
                    background: "#8F672E", marginRight: 8,
                    animation: "tv-pulse 1.2s ease-in-out infinite",
                  }} />
                  {job.estado === "en_cola" ? "En cola — esperando turno…" : (FASES[job.fase ?? ""] ?? job.fase ?? "…")}
                </span>
                <span style={{ color: "#8F672E", fontWeight: 700 }}>{formatearEta(job.eta_segundos)}</span>
              </div>

              {/* Carrusel de cartas: pasadas · actual · próximas */}
              {job.carta_actual_detalle && (
                <Carrusel
                  trail={trail}
                  actual={job.carta_actual_detalle}
                  proximas={job.proximas ?? []}
                />
              )}

              <div style={{ position: "relative", width: "100%", height: 8, background: "#0E151D", borderRadius: 99, overflow: "hidden", border: "1px solid #24445D40" }}>
                {pct === 0 ? (
                  <div style={{
                    position: "absolute", top: 0, bottom: 0, width: "32%",
                    background: "linear-gradient(90deg, transparent, #8F672E, transparent)",
                    animation: "tv-sweep 1.4s ease-in-out infinite",
                  }} />
                ) : (
                  <div style={{
                    width: `${pct}%`, height: "100%", borderRadius: 99, transition: "width 0.6s",
                    backgroundImage: "repeating-linear-gradient(45deg, #8F672E 0, #8F672E 10px, #6A481C 10px, #6A481C 20px)",
                    animation: "tv-stripes 0.9s linear infinite",
                  }} />
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12.5 }}>
                <span style={{ color: "#b8a07a" }}>
                  {job.procesadas}/{job.total} cartas · <b style={{ color: "#e8d5b7" }}>{pct}%</b>
                  {job.carta_actual && (
                    <span style={{ marginLeft: 10, fontFamily: "monospace", color: "#93c5fd" }}>🃏 {job.carta_actual}</span>
                  )}
                </span>
                <span>
                  <span style={{ color: "#e8d5b7" }}>↑ {job.actualizadas}</span>
                  <span style={{ color: "#8F672E", marginLeft: 12 }}>= {job.sin_cambio}</span>
                  <span style={{ color: job.no_encontradas > 0 ? "#fca5a5" : "#8F672E", marginLeft: 12 }}>✗ {job.no_encontradas}</span>
                </span>
              </div>
            </>
          )}

          {/* Error del job */}
          {job.estado === "error" && (
            <div style={{
              padding: "12px 16px", borderRadius: 8, background: "#2a0e0e",
              border: "1px solid #7f1d1d", color: "#fca5a5", fontSize: 13,
            }}>
              ⚠️ El escaneo terminó con error: {job.error ?? "desconocido"}
            </div>
          )}

          {/* Resumen final (completado o cancelado) */}
          {(job.estado === "completado" || job.estado === "cancelado") && (
            <>
              {job.estado === "cancelado" && (
                <div style={{
                  padding: "10px 16px", borderRadius: 8, background: "#3a2f1f",
                  border: "1px solid #6A481C", color: "#d6b88a", fontSize: 13, marginBottom: 16,
                }}>
                  ⏹ Escaneo cancelado — se procesaron {job.procesadas} de {job.total} cartas (lo avanzado quedó guardado).
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Total", value: job.total, accent: "#24445D" },
                  { label: "Actualizadas", value: job.actualizadas, accent: "#8F672E" },
                  { label: "Sin cambio", value: job.sin_cambio, accent: "#442E17" },
                  { label: "No encontradas", value: job.no_encontradas, accent: job.no_encontradas > 0 ? "#7f1d1d" : "#442E17" },
                ].map((kpi) => (
                  <div key={kpi.label} style={{
                    background: "#0E151D", border: `1px solid ${kpi.accent}40`, borderTop: `3px solid ${kpi.accent}`,
                    borderRadius: 10, padding: "14px 14px",
                  }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "#8F672E", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>
                      {kpi.label}
                    </p>
                    <p style={{ fontSize: 26, fontWeight: 800, color: "#e8d5b7", margin: "4px 0 0", fontFamily: "'Philosopher', serif" }}>
                      {kpi.value}
                    </p>
                  </div>
                ))}
              </div>

              {resumen && (
                <div style={{
                  padding: "10px 16px", borderRadius: 8, background: "#8F672E20",
                  border: "1px solid #8F672E", fontSize: 14, marginBottom: 4,
                }}>
                  💰 Diferencia total: <b>{formatearCOP(resumen.total_diferencia)}</b>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Historial ── */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ ...tituloSeccion, margin: 0 }}>Historial de escaneos</h3>
          <button onClick={cargarHistorial} style={{ ...botonSecundario, padding: "5px 14px", fontSize: 12 }}>
            ↻ Actualizar
          </button>
        </div>
        <div style={{ border: "1px solid #24445D40", borderRadius: 10, overflow: "hidden", background: "#0E151D" }}>
          {historial.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 90, color: "#8F672E", fontSize: 13 }}>
              Aún no hay escaneos registrados
            </div>
          )}
          <ScrollArea className="h-[360px]">
            {historial.map((h, i) => (
              <div key={h.job_id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: "10px 16px", borderBottom: "1px solid #24445D30",
                background: i % 2 === 0 ? "#0E151D" : "#0E1D2B", fontSize: 12.5, flexWrap: "wrap",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ color: "#8F672E", fontSize: 11.5, minWidth: 95 }}>{formatearFecha(h.creado)}</span>
                  <span style={{ fontFamily: "monospace", color: "#e8d5b7" }}>{ALCANCE_LABEL[h.alcance] ?? h.alcance}</span>
                  {formatearFiltro(h) !== "—" && <span style={{ color: "#b8a07a" }}>{formatearFiltro(h)}</span>}
                  {!h.aplicar && <span style={{ color: "#fdba74", fontSize: 11 }}>(dry-run)</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: "#b8a07a" }}>
                    {h.total} cartas · <span style={{ color: "#e8d5b7" }}>↑ {h.actualizadas}</span>
                    {" · "}
                    <span style={{ color: h.no_encontradas > 0 ? "#fca5a5" : "#8F672E" }}>✗ {h.no_encontradas}</span>
                  </span>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
                    padding: "2px 10px", borderRadius: 20,
                    background: ESTADO_COLOR[h.estado]?.bg, border: `1px solid ${ESTADO_COLOR[h.estado]?.border}`,
                    color: ESTADO_COLOR[h.estado]?.text,
                  }}>
                    {h.estado.replace("_", " ")}
                  </span>
                  <button onClick={() => verJob(h)} style={{ ...botonSecundario, padding: "4px 12px", fontSize: 11.5 }}>
                    {h.estado === "ejecutando" || h.estado === "en_cola" ? "Seguir" : "Ver"}
                  </button>
                </div>
              </div>
            ))}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// ─── Carrusel de cartas procesadas ─────────────────────────────────────────────

const LOGO_FALLBACK =
  "https://cdn.shopify.com/s/files/1/0710/0029/3568/files/TheVault.jpg?v=1757364051";

const MAIN_W = 220;       // ancho de la carta principal (≈ tamaño del portal de pedidos)
const MAIN_H = 307;       // alto de la imagen (ratio carta ≈ 0.716)
const BELT_W = 116;       // ancho de las cartas de la cinta de fondo
const BELT_H = 162;

const nombreStyle: React.CSSProperties = {
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

function CartaImg({ url, w, h, radius = 8, gris }: { url: string | null; w: number; h: number; radius?: number; gris?: boolean }) {
  return (
    <img
      src={url || LOGO_FALLBACK}
      alt=""
      loading="lazy"
      onError={(e) => { (e.currentTarget as HTMLImageElement).src = LOGO_FALLBACK; }}
      style={{
        width: w, height: h, objectFit: "cover", borderRadius: radius,
        border: "1px solid #24445D", display: "block",
        filter: gris ? "grayscale(0.7)" : "none",
      }}
    />
  );
}

function cop(n: number | null): string {
  if (n == null) return "—";
  return "$ " + Math.round(n).toLocaleString("es-CO");
}

function precioInfo(c: CartaDetalle) {
  const ant = c.precio_anterior, nu = c.precio_nuevo;
  if (c.estado === "no_encontrada") return { tipo: "no", color: "#fca5a5", glow: "none", arrow: "✗", label: "no encontrada" };
  if (ant == null || nu == null || nu === ant) return { tipo: "igual", color: "#8F672E", glow: "none", arrow: "=", label: "sin cambio" };
  const sube = nu > ant;
  const color = sube ? "#39FF14" : "#FF3B3B";
  const glow = sube
    ? "0 0 7px #39FF14, 0 0 18px #39FF1490, 0 0 32px #39FF1450"
    : "0 0 7px #FF3B3B, 0 0 18px #FF3B3B90, 0 0 32px #FF3B3B50";
  return { tipo: sube ? "sube" : "baja", color, glow, arrow: sube ? "▲" : "▼", label: "" };
}

// Tarjeta principal con disolvencia (crossfade + blur) al cambiar de carta
function MainCard({ card }: { card: CartaDetalle }) {
  const [layers, setLayers] = useState<{ id: number; card: CartaDetalle }[]>([{ id: 0, card }]);
  const prevTitulo = useRef(card.titulo);
  const counter = useRef(0);

  useEffect(() => {
    if (card.titulo === prevTitulo.current) return;
    prevTitulo.current = card.titulo;
    counter.current += 1;
    const id = counter.current;
    setLayers((prev) => [prev[prev.length - 1], { id, card }]);
    const t = setTimeout(() => setLayers((prev) => prev.filter((l) => l.id === id)), 720);
    return () => clearTimeout(t);
  }, [card]);

  return (
    <div style={{ position: "relative", width: MAIN_W, height: MAIN_H + 86 }}>
      {layers.map((l, idx) => {
        const incoming = idx === layers.length - 1;
        const pi = precioInfo(l.card);
        const delta = (l.card.precio_nuevo ?? 0) - (l.card.precio_anterior ?? 0);
        const pct = l.card.precio_anterior ? (delta / l.card.precio_anterior) * 100 : 0;
        return (
          <div key={l.id} style={{
            position: "absolute", inset: 0, textAlign: "center",
            animation: `${incoming ? "tv-card-in" : "tv-card-out"} 0.72s ease forwards`,
          }}>
            <CartaImg url={l.card.image_url} w={MAIN_W} h={MAIN_H} radius={12} />
            <div style={{ ...nombreStyle, fontSize: 18, fontWeight: 700, color: "#e8d5b7", fontFamily: "'Philosopher', serif", marginTop: 8 }}>
              {l.card.titulo}
            </div>
            <div style={{ ...nombreStyle, fontSize: 12, color: "#8F672E" }}>{l.card.set_name}</div>

            {pi.tipo === "sube" || pi.tipo === "baja" ? (
              <div style={{ marginTop: 4 }}>
                <span style={{ fontSize: 12, color: "#5C84A0", textDecoration: "line-through" }}>{cop(l.card.precio_anterior)}</span>
                <div style={{ fontSize: 25, fontWeight: 900, color: pi.color, textShadow: pi.glow, fontFamily: "'Philosopher', serif", letterSpacing: 1, lineHeight: 1.15 }}>
                  {pi.arrow} {cop(l.card.precio_nuevo)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: pi.color, textShadow: pi.glow }}>
                  {delta > 0 ? "+" : "−"}{cop(Math.abs(delta))} · {delta > 0 ? "+" : "−"}{Math.abs(pct).toFixed(1)}%
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: pi.color }}>
                {pi.arrow} {pi.label}
                {pi.tipo === "igual" && l.card.precio_nuevo != null ? ` · ${cop(l.card.precio_nuevo)}` : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Cinta infinita de fondo con las demás cartas
function Belt({ cards }: { cards: { image_url: string | null; titulo: string }[] }) {
  if (cards.length === 0) return null;
  const loop = [...cards, ...cards]; // duplicado para loop sin costura
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", overflow: "hidden", opacity: 0.3 }}>
      <div style={{ display: "flex", gap: 18, animation: "tv-belt 30s linear infinite", filter: "blur(1.5px)", paddingLeft: 18 }}>
        {loop.map((c, i) => (
          <div key={i} style={{ flexShrink: 0, width: BELT_W, textAlign: "center" }}>
            <CartaImg url={c.image_url} w={BELT_W} h={BELT_H} radius={8} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Carrusel({
  trail, actual, proximas,
}: { trail: CartaDetalle[]; actual: CartaDetalle; proximas: CartaPreview[] }) {
  // La estela incluye la actual (se agrega en cada poll); la quitamos del fondo.
  const pasadas = trail.filter((c) => c.titulo !== actual.titulo).slice(-5);
  const beltCards = [
    ...pasadas.map((c) => ({ image_url: c.image_url, titulo: c.titulo })),
    ...proximas.map((c) => ({ image_url: c.image_url, titulo: c.titulo })),
  ];

  return (
    <div style={{ margin: "6px 0 20px" }}>
      <style>{`
        @keyframes tv-card-in { from { opacity: 0; filter: blur(14px); transform: scale(1.04); } to { opacity: 1; filter: blur(0); transform: scale(1); } }
        @keyframes tv-card-out { from { opacity: 1; filter: blur(0); } to { opacity: 0; filter: blur(14px); } }
        @keyframes tv-belt { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>
      <div style={{
        position: "relative", height: MAIN_H + 96, overflow: "hidden",
        borderRadius: 12, background: "#0E151D", border: "1px solid #24445D40",
      }}>
        <Belt cards={beltCards} />
        {/* Carta principal centrada, con halo oscuro que separa de la cinta */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            padding: "8px 30px", borderRadius: 16,
            background: "#0E151Dcc",
            boxShadow: "0 0 50px 30px #0E151D",
          }}>
            <MainCard card={actual} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Estilos compartidos ──────────────────────────────────────────────────────

const panel: React.CSSProperties = {
  background: "#0E1D2B",
  border: "1px solid #24445D40",
  borderRadius: 10,
  padding: "22px 20px",
};

const tituloSeccion: React.CSSProperties = {
  fontFamily: "'Philosopher', serif",
  fontSize: 13,
  fontWeight: 700,
  color: "#8F672E",
  textTransform: "uppercase",
  letterSpacing: 1.5,
  marginBottom: 12,
};

const botonPrimario: React.CSSProperties = {
  padding: "10px 22px",
  background: "#8F672E",
  color: "#e8d5b7",
  border: "1px solid #6A481C",
  borderRadius: 8,
  fontFamily: "'Philosopher', serif",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  transition: "all 0.2s",
};

const botonSecundario: React.CSSProperties = {
  padding: "10px 18px",
  background: "#122F43",
  color: "#e8d5b7",
  border: "1px solid #24445D",
  borderRadius: 8,
  fontFamily: "'Philosopher', serif",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  transition: "all 0.2s",
};

const botonCancelar: React.CSSProperties = {
  padding: "10px 18px",
  background: "#2a0e0e",
  color: "#fca5a5",
  border: "1px solid #7f1d1d",
  borderRadius: 8,
  fontFamily: "'Philosopher', serif",
  fontWeight: 700,
  fontSize: 13,
  transition: "all 0.2s",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  background: "#0E151D",
  border: "1px solid #24445D",
  borderRadius: 8,
  color: "#e8d5b7",
  fontSize: 14,
  fontFamily: "'Literata', Georgia, serif",
  outline: "none",
  boxSizing: "border-box",
};

function ToggleRow({
  checked, onChange, titulo, sub,
}: { checked: boolean; onChange: (v: boolean) => void; titulo: string; sub: string }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(!checked); } }}
      style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", outline: "none" }}
    >
      <div style={{
        width: 40, height: 22, borderRadius: 99,
        background: checked ? "#B08343" : "#122F43",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
        border: `1px solid ${checked ? "#8F672E" : "#24445D"}`,
      }}>
        <div style={{
          position: "absolute", top: 3, left: checked ? 20 : 3,
          width: 14, height: 14, borderRadius: "50%",
          background: "#e8d5b7", transition: "left 0.2s",
        }} />
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#e8d5b7", margin: 0, fontFamily: "'Philosopher', serif" }}>{titulo}</p>
        <p style={{ fontSize: 11, color: "#5C84A0", margin: 0 }}>{sub}</p>
      </div>
    </div>
  );
}
