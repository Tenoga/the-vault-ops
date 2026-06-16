import { useEffect, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

// Paleta de marca
// #442E17 #0E1D2B #6A481C #122F43 #8F672E #24445D #0E151D

// ─── Tipos (espejo de la API /precios del backend) ────────────────────────────

type Alcance = "all_products" | "collection_products" | "specific_product" | "all_zero_price";

interface Job {
  job_id: string;
  alcance: Alcance;
  filtro: string[] | string | null;
  aplicar: boolean;
  notificar: boolean;
  estado: "en_cola" | "ejecutando" | "completado" | "error";
  fase: string | null;
  total: number;
  procesadas: number;
  actualizadas: number;
  sin_cambio: number;
  no_encontradas: number;
  porcentaje?: number;
  eta_segundos?: number | null;
  carta_actual: string | null;
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
  consultando_shopify: "Trayendo cartas desde Shopify (puede tardar varios minutos)…",
  procesando: "Comparando precios contra SCG…",
  guardando_cache: "Guardando cache…",
  finalizado: "Finalizado",
};

const ESTADO_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  en_cola: { bg: "#442E1740", border: "#6A481C", text: "#fdba74" },
  ejecutando: { bg: "#122F4380", border: "#24445D", text: "#93c5fd" },
  completado: { bg: "#8F672E40", border: "#8F672E", text: "#e8d5b7" },
  error: { bg: "#2a0e0e", border: "#7f1d1d", text: "#fca5a5" },
};

const ALCANCE_LABEL: Record<string, string> = Object.fromEntries(
  ALCANCES.map((a) => [a.value, a.label]),
);

function formatearEta(segundos: number | null | undefined): string {
  if (segundos == null) return "calculando…";
  if (segundos < 60) return `≈ ${segundos}s`;
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `≈ ${m}m ${s}s`;
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
  const [notificar, setNotificar] = useState(false);
  const [lanzando, setLanzando] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [resultado, setResultado] = useState<JobResult | null>(null);
  const [historial, setHistorial] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    if (!job || job.estado === "completado" || job.estado === "error") return;

    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/precios/jobs/${job.job_id}`);
        if (!r.ok) return;
        const j: Job = await r.json();
        setJob(j);

        if (j.estado === "completado" || j.estado === "error") {
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
        payload.product_id = productId.trim();
      }

      const r = await fetch("/api/precios/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? data.error ?? `HTTP ${r.status}`);
      setResultado(null);
      setJob(data);
      cargarHistorial();
    } catch (e: any) {
      setError(e.message ?? "Error iniciando el escaneo");
    } finally {
      setLanzando(false);
    }
  }

  async function verJob(j: Job) {
    setError(null);
    setResultado(null);
    setJob(j);
    if (j.estado === "completado" || j.estado === "error") {
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
          <button onClick={nuevoEscaneo} style={botonSecundario}>
            ＋ Nuevo escaneo
          </button>
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
              placeholder="gid://shopify/Product/..."
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              style={inputStyle}
            />
          )}

          <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
            <label style={checkboxLabel}>
              <input type="checkbox" checked={aplicar} onChange={(e) => setAplicar(e.target.checked)} />
              Aplicar directo a Shopify (si no, solo calcula y muestra diferencias)
            </label>
            <label style={checkboxLabel}>
              <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} />
              Notificar por Telegram
            </label>
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

          {/* Resumen final */}
          {job.estado === "completado" && (
            <>
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

const checkboxLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "#b8a07a",
  cursor: "pointer",
};
