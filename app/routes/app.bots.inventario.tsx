import { useEffect, useRef, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

// Paleta de marca
// #442E17 #0E1D2B #6A481C #122F43 #8F672E #24445D #0E151D

// ─── Tipos (espejo de la API /inventory del backend) ──────────────────────────

interface Job {
  job_id: string;
  archivo: string;
  proveedor: string;
  estado: "en_cola" | "ejecutando" | "completado" | "error" | "cancelado";
  fase: string | null;
  total: number;
  procesadas: number;
  exitosas: number;
  fallidas: number;
  porcentaje?: number;
  eta_segundos?: number | null;
  carta_actual: string | null;
  creado: string;
  iniciado: string | null;
  finalizado: string | null;
  error: string | null;
}

interface Registro {
  title: string;
  sku: string;
  finish: string;
  collector_number: string;
  quantity: number | string;
  reason?: string;
}

interface JobResult extends Job {
  resumen?: {
    total: number;
    exitosas: number;
    fallidas: number;
    detalle_exitosas: Registro[];
    detalle_fallidas: Registro[];
  } | null;
}

interface Validacion {
  valido: boolean;
  archivo?: string;
  filas?: number;
  columnas?: string[];
  preview?: Record<string, string>[];
  error?: string;
}

// Job del depurador (validación contra la tienda antes de cargar)
interface DepResumen {
  total_copias: number;
  total_retirar: number;
  valor_retirar: number;
  cartas_afectadas: number;
  contra_tienda?: boolean;
  cartas_en_tienda?: number;
}
interface DepJob {
  job_id: string;
  archivo: string;
  umbral?: number;
  conservar?: number;
  estado: "en_cola" | "ejecutando" | "completado" | "error" | "cancelado" | "interrumpido";
  fase?: string | null;
  error: string | null;
  resumen?: DepResumen | null;
}

const DEP_TERMINADO = ["completado", "error", "cancelado", "interrumpido"];
const DEP_FASES: Record<string, string> = {
  escaneando_tienda: "Escaneando el inventario de la tienda (~1 min)…",
  depurando: "Comparando y generando el reporte…",
};

// ─── Helpers de presentación ──────────────────────────────────────────────────

const FASES: Record<string, string> = {
  leyendo_csv: "Leyendo CSV…",
  cargando_cache: "Cargando cache de la tienda (~1 min)…",
  procesando: "Procesando cartas…",
  finalizado: "Finalizado",
};

const ESTADO_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  en_cola: { bg: "#442E1740", border: "#6A481C", text: "#fdba74" },
  ejecutando: { bg: "#122F4380", border: "#24445D", text: "#93c5fd" },
  completado: { bg: "#8F672E40", border: "#8F672E", text: "#e8d5b7" },
  error: { bg: "#2a0e0e", border: "#7f1d1d", text: "#fca5a5" },
  cancelado: { bg: "#3a2f1f", border: "#6A481C", text: "#d6b88a" },
};

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

// ─── Página ───────────────────────────────────────────────────────────────────

export default function InventarioPage() {
  const [file, setFile] = useState<File | null>(null);
  const [proveedor, setProveedor] = useState("");
  const [validacion, setValidacion] = useState<Validacion | null>(null);
  const [validando, setValidando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [resultado, setResultado] = useState<JobResult | null>(null);
  const [historial, setHistorial] = useState<Job[]>([]);
  const [proveedoresExistentes, setProveedoresExistentes] = useState<string[]>([]);
  const [actualizandoProv, setActualizandoProv] = useState(false);
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  const [filtroProv, setFiltroProv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cancelSolicitado, setCancelSolicitado] = useState(false);
  const [reintentando, setReintentando] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [depurarPrimero, setDepurarPrimero] = useState(false);
  const [depUmbral, setDepUmbral] = useState("0.90");
  const [depConservar, setDepConservar] = useState("4");
  const [depJob, setDepJob] = useState<DepJob | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const depIframeRef = useRef<HTMLIFrameElement>(null);

  const cargarHistorial = useCallback(async () => {
    try {
      const r = await fetch("/api/inventario/jobs");
      if (r.ok) setHistorial(await r.json());
    } catch {
      /* el historial no es crítico */
    }
  }, []);

  const cargarProveedores = useCallback(async (refresh = false) => {
    if (refresh) setActualizandoProv(true);
    try {
      const r = await fetch(`/api/inventario/proveedores${refresh ? "?refresh=1" : ""}`);
      if (r.ok) {
        const data = await r.json();
        setProveedoresExistentes(data.proveedores ?? []);
      }
    } catch {
      /* sin lista los chips no aparecen, pero nada se bloquea */
    } finally {
      setActualizandoProv(false);
    }
  }, []);

  useEffect(() => {
    cargarHistorial();
    cargarProveedores();
  }, [cargarHistorial, cargarProveedores]);

  // Cerrar el dropdown de proveedores al hacer clic fuera
  useEffect(() => {
    if (!dropdownAbierto) return;
    function onClickFuera(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownAbierto(false);
      }
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, [dropdownAbierto]);

  // Polling del job activo cada 3s hasta que termine
  useEffect(() => {
    if (!job || job.estado === "completado" || job.estado === "error" || job.estado === "cancelado") return;

    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/inventario/jobs/${job.job_id}`);
        if (!r.ok) return;
        const j: Job = await r.json();
        setJob(j);

        if (j.estado === "completado" || j.estado === "error" || j.estado === "cancelado") {
          const rr = await fetch(`/api/inventario/jobs/${j.job_id}?result=1`);
          if (rr.ok) setResultado(await rr.json());
          cargarHistorial();
        }
      } catch {
        /* reintenta en el siguiente tick */
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [job?.job_id, job?.estado, cargarHistorial]);

  // Polling del job del depurador (fase previa vs tienda) hasta que termine
  useEffect(() => {
    if (!depJob || DEP_TERMINADO.includes(depJob.estado)) return;
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/depurador/jobs/${depJob.job_id}`);
        if (!r.ok) return;
        const j: DepJob = await r.json();
        if (DEP_TERMINADO.includes(j.estado)) {
          const rr = await fetch(`/api/depurador/jobs/${j.job_id}?result=1`);
          setDepJob(rr.ok ? await rr.json() : j);
        } else {
          setDepJob(j);
        }
      } catch {
        /* reintenta en el siguiente tick */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [depJob?.job_id, depJob?.estado]);

  function seleccionarArchivo(f: File) {
    setFile(f);
    setValidacion(null);
    setError(null);
  }

  async function validar() {
    if (!file) return;
    setValidando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/inventario/validate", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setValidacion(data);
    } catch (e: any) {
      setError(e.message ?? "Error validando el CSV");
    } finally {
      setValidando(false);
    }
  }

  // Depurar contra la tienda antes de cargar: crea un job del depurador
  // (contra_tienda) y muestra su reporte para revisar/ajustar y confirmar.
  async function iniciarDepuracion() {
    if (!file || !proveedor.trim()) return;
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("contra_tienda", "true");
      fd.append("umbral", depUmbral.trim() || "0.90");
      fd.append("conservar", depConservar.trim() || "4");
      const r = await fetch("/api/depurador/upload", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? data.detail ?? `HTTP ${r.status}`);
      setDepJob(data);
    } catch (e: any) {
      setError(e.message ?? "Error iniciando la depuración");
    } finally {
      setSubiendo(false);
    }
  }

  // Toma el CSV ya filtrado del reporte (mismo-origen) y lo carga como siempre
  async function confirmarYCargar() {
    if (!depJob || confirmando) return;
    setConfirmando(true);
    setError(null);
    try {
      const win = depIframeRef.current?.contentWindow as any;
      if (!win || typeof win.csvSugerido !== "function") {
        throw new Error("No se pudo leer el reporte; recárgalo e intenta de nuevo.");
      }
      const { csv } = win.csvSugerido();
      const filtrado = new File([csv], file?.name ?? "inventario.csv", { type: "text/csv" });
      const fd = new FormData();
      fd.append("file", filtrado);
      fd.append("proveedor", proveedor.trim());
      const r = await fetch("/api/inventario/upload", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? data.detail ?? `HTTP ${r.status}`);
      setDepJob(null);
      setResultado(null);
      setJob(data);        // entra al flujo normal de cargue
      cargarHistorial();
    } catch (e: any) {
      setError(e.message ?? "Error cargando el CSV filtrado");
    } finally {
      setConfirmando(false);
    }
  }

  async function iniciarCargue() {
    if (!file || !proveedor.trim()) return;
    if (depurarPrimero) return iniciarDepuracion();
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("proveedor", proveedor.trim());
      const r = await fetch("/api/inventario/upload", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? data.detail ?? `HTTP ${r.status}`);
      setResultado(null);
      setJob(data);
      cargarHistorial();
    } catch (e: any) {
      setError(e.message ?? "Error iniciando el cargue");
    } finally {
      setSubiendo(false);
    }
  }

  async function cancelarCargue() {
    if (!job) return;
    setCancelSolicitado(true);
    try {
      const r = await fetch(`/api/inventario/jobs/${job.job_id}/cancelar`, { method: "POST" });
      if (r.ok) setJob(await r.json());
      else setCancelSolicitado(false); // falló: permitir reintentar
    } catch {
      setCancelSolicitado(false);
    }
  }

  async function reintentarFallidas() {
    if (!job || reintentando) return;
    setReintentando(true);
    setError(null);
    try {
      const r = await fetch(`/api/inventario/jobs/${job.job_id}/reintentar`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? data.error ?? `HTTP ${r.status}`);
      // El backend devuelve el job nuevo: se sigue igual que un cargue normal
      setResultado(null);
      setCancelSolicitado(false);
      setJob(data);
      cargarHistorial();
    } catch (e: any) {
      setError(e.message ?? "Error creando el reintento");
    } finally {
      setReintentando(false);
    }
  }

  async function verJob(j: Job) {
    setError(null);
    setResultado(null);
    setCancelSolicitado(false);
    setJob(j);
    if (j.estado === "completado" || j.estado === "error" || j.estado === "cancelado") {
      try {
        const r = await fetch(`/api/inventario/jobs/${j.job_id}?result=1`);
        if (r.ok) setResultado(await r.json());
      } catch {
        /* se muestra sin detalle */
      }
    }
  }

  function nuevoCargue() {
    setJob(null);
    setResultado(null);
    setFile(null);
    setValidacion(null);
    setError(null);
    setCancelSolicitado(false);
    setDepJob(null);
  }

  function cancelarDepuracion() {
    setDepJob(null);
    setError(null);
  }

  const puedeIniciar = !!file && validacion?.valido === true && !!proveedor.trim() && !subiendo;
  // Proveedores reales de la tienda (barcodes de Shopify) + los del historial
  // de cargues (por si hay uno recién usado que aún no se re-escanea).
  // Reutilizar el nombre exacto evita duplicados por sintaxis.
  const proveedoresConocidos = Array.from(
    new Set([
      ...proveedoresExistentes,
      ...historial.map((h) => h.proveedor).filter(Boolean),
    ]),
  ).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  const proveedoresFiltrados = filtroProv.trim()
    ? proveedoresConocidos.filter((p) =>
        p.toLowerCase().includes(filtroProv.trim().toLowerCase()),
      )
    : proveedoresConocidos;
  const pct = job?.porcentaje ?? (job && job.total ? Math.round((job.procesadas * 100) / job.total) : 0);
  const resumen = resultado?.resumen;

  return (
    <div style={{ fontFamily: "'Literata', Georgia, serif", color: "#e8d5b7" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontFamily: "'Philosopher', serif", fontSize: 22, fontWeight: 700, color: "#e8d5b7", margin: 0 }}>
            Cargue de Inventario
          </h2>
          <p style={{ fontSize: 13, color: "#8F672E", marginTop: 4 }}>
            CSV del proveedor → Scryfall → Shopify, con seguimiento en vivo
          </p>
        </div>
        {(job || depJob) && (
          <button onClick={nuevoCargue} style={botonSecundario}>
            ＋ Nuevo cargue
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

      {/* ── Panel de subida (cuando no hay job ni depuración activa) ── */}
      {!job && !depJob && (
        <div style={panel}>
          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) seleccionarArchivo(f);
            }}
            style={{
              border: `2px dashed ${dragOver ? "#8F672E" : "#6A481C80"}`,
              borderRadius: 10,
              padding: "36px 20px",
              textAlign: "center",
              cursor: "pointer",
              background: dragOver ? "#442E1730" : "#0E151D",
              transition: "all 0.15s",
              marginBottom: 18,
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) seleccionarArchivo(f);
                e.target.value = "";
              }}
            />
            <div style={{ fontSize: 38, marginBottom: 8 }}>📦</div>
            {file ? (
              <p style={{ margin: 0, fontSize: 14 }}>
                <span style={{
                  fontFamily: "monospace", background: "#442E1740", border: "1px solid #6A481C",
                  borderRadius: 20, padding: "4px 14px", color: "#e8d5b7", fontSize: 13,
                }}>
                  {file.name}
                </span>
                <span style={{ display: "block", marginTop: 8, fontSize: 12, color: "#8F672E" }}>
                  Haz clic para cambiar el archivo
                </span>
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 13.5, color: "#8F672E" }}>
                Arrastra el CSV del proveedor aquí, o haz clic para buscarlo
              </p>
            )}
          </div>

          {/* Proveedor + acciones */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              list="proveedores-conocidos"
              placeholder="Nombre del proveedor *"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              style={{
                flex: "1 1 220px",
                padding: "10px 14px",
                background: "#0E151D",
                border: "1px solid #24445D",
                borderRadius: 8,
                color: "#e8d5b7",
                fontSize: 14,
                fontFamily: "'Literata', Georgia, serif",
                outline: "none",
              }}
            />
            <datalist id="proveedores-conocidos">
              {proveedoresConocidos.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <button onClick={validar} disabled={!file || validando} style={{
              ...botonSecundario,
              opacity: !file || validando ? 0.5 : 1,
              cursor: !file || validando ? "not-allowed" : "pointer",
            }}>
              {validando ? "Validando…" : "🔍 Validar CSV"}
            </button>
            <button onClick={iniciarCargue} disabled={!puedeIniciar} style={{
              ...botonPrimario,
              opacity: puedeIniciar ? 1 : 0.5,
              cursor: puedeIniciar ? "pointer" : "not-allowed",
            }}>
              {subiendo ? "Subiendo…" : (depurarPrimero ? "🧹 Depurar y cargar" : "⚡ Iniciar cargue")}
            </button>
          </div>

          {/* Check: depurar contra la tienda antes de cargar */}
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 10, marginTop: 14,
            padding: "12px 14px", borderRadius: 8, cursor: "pointer",
            background: depurarPrimero ? "#442E1730" : "#0E151D",
            border: `1px solid ${depurarPrimero ? "#8F672E" : "#24445D40"}`,
          }}>
            <input
              type="checkbox"
              checked={depurarPrimero}
              onChange={(e) => setDepurarPrimero(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, accentColor: "#8F672E", cursor: "pointer" }}
            />
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>
              <b style={{ color: "#e8d5b7" }}>Depurar contra el inventario de la tienda antes de cargar</b>
              <span style={{ display: "block", color: "#8F672E", fontSize: 12, marginTop: 2 }}>
                Compara este CSV con lo que ya hay en la tienda y sugiere retirar las copias
                sobrantes para no acumular repetidas. Abre el reporte para revisar y confirmar.
                Agrega ~1 min por el escaneo de la tienda.
              </span>
            </span>
          </label>

          {/* Parámetros del cupo (se deciden ANTES de generar el reporte) */}
          {depurarPrimero && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, paddingLeft: 4 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, color: "#8F672E", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Conservar por carta (total)
                <input type="number" step="1" min="1" value={depConservar} onChange={(e) => setDepConservar(e.target.value)}
                  style={{ width: 110, padding: "9px 12px", background: "#0E151D", border: "1px solid #24445D", borderRadius: 8, color: "#e8d5b7", fontSize: 14, fontFamily: "'Literata', Georgia, serif", outline: "none" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, color: "#8F672E", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Umbral USD (≤ se depura)
                <input type="number" step="0.01" min="0" value={depUmbral} onChange={(e) => setDepUmbral(e.target.value)}
                  style={{ width: 110, padding: "9px 12px", background: "#0E151D", border: "1px solid #24445D", borderRadius: 8, color: "#e8d5b7", fontSize: 14, fontFamily: "'Literata', Georgia, serif", outline: "none" }} />
              </label>
            </div>
          )}

          {/* Proveedores existentes (Shopify): desplegable con buscador */}
          <div ref={dropdownRef} style={{ position: "relative", marginTop: 12, maxWidth: 360 }}>
            <button
              onClick={() => { setDropdownAbierto((v) => !v); setFiltroProv(""); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                width: "100%", padding: "8px 14px", borderRadius: 8,
                background: "#0E151D", border: "1px solid #24445D",
                color: "#b8a07a", fontSize: 13, cursor: "pointer",
                fontFamily: "'Literata', Georgia, serif", transition: "all 0.15s",
              }}
            >
              <span>
                📋 Elegir de los existentes
                {proveedoresConocidos.length > 0 && (
                  <span style={{ color: "#8F672E", fontWeight: 700 }}> ({proveedoresConocidos.length})</span>
                )}
              </span>
              <span style={{ color: "#8F672E", transform: dropdownAbierto ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
            </button>

            {dropdownAbierto && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 20,
                background: "#0E1D2B", border: "1px solid #6A481C", borderRadius: 10,
                boxShadow: "0 8px 24px #00000060", overflow: "hidden",
              }}>
                <div style={{ padding: 8, borderBottom: "1px solid #24445D40" }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Buscar proveedor…"
                    value={filtroProv}
                    onChange={(e) => setFiltroProv(e.target.value)}
                    style={{
                      width: "100%", padding: "8px 12px", boxSizing: "border-box",
                      background: "#0E151D", border: "1px solid #24445D", borderRadius: 6,
                      color: "#e8d5b7", fontSize: 13, fontFamily: "'Literata', Georgia, serif", outline: "none",
                    }}
                  />
                </div>
                <ScrollArea className="h-[240px]">
                  {proveedoresFiltrados.map((p) => (
                    <button
                      key={p}
                      onClick={() => { setProveedor(p); setDropdownAbierto(false); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "8px 14px", border: "none", borderBottom: "1px solid #24445D20",
                        background: proveedor === p ? "#442E17" : "transparent",
                        color: proveedor === p ? "#e8d5b7" : "#b8a07a",
                        fontSize: 13, cursor: "pointer", fontFamily: "'Literata', Georgia, serif",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => { if (proveedor !== p) e.currentTarget.style.background = "#122F43"; }}
                      onMouseLeave={(e) => { if (proveedor !== p) e.currentTarget.style.background = "transparent"; }}
                    >
                      {p}
                    </button>
                  ))}
                  {proveedoresFiltrados.length === 0 && (
                    <div style={{ padding: "16px 14px", fontSize: 12.5, color: "#5C84A0", textAlign: "center" }}>
                      {proveedoresConocidos.length === 0 ? "Cargando lista…" : "Sin coincidencias"}
                    </div>
                  )}
                </ScrollArea>
                <button
                  onClick={() => cargarProveedores(true)}
                  disabled={actualizandoProv}
                  title="Re-escanear proveedores desde Shopify (~1 min)"
                  style={{
                    display: "block", width: "100%", padding: "8px 14px",
                    borderTop: "1px solid #24445D40", border: "none",
                    background: "#122F43", color: "#8F672E", fontSize: 12,
                    cursor: actualizandoProv ? "wait" : "pointer",
                    fontFamily: "'Literata', Georgia, serif",
                  }}
                >
                  {actualizandoProv ? "escaneando tienda…" : "↻ re-escanear desde Shopify"}
                </button>
              </div>
            )}
          </div>

          {/* Resultado de validación */}
          {validacion && validacion.valido && (
            <div style={{ marginTop: 18 }}>
              <div style={{
                padding: "10px 16px", borderRadius: 8, background: "#8F672E20",
                border: "1px solid #8F672E", fontSize: 13, marginBottom: 12,
              }}>
                ✓ CSV válido — <b>{validacion.filas}</b> filas · columnas: {validacion.columnas?.join(", ")}
              </div>
              {!!validacion.preview?.length && (
                <div style={{ border: "1px solid #24445D40", borderRadius: 10, overflow: "hidden", background: "#0E151D" }}>
                  {validacion.preview.map((row, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 16px",
                      borderBottom: "1px solid #24445D30",
                      background: i % 2 === 0 ? "#0E151D" : "#0E1D2B",
                      fontSize: 12.5,
                    }}>
                      <span style={{ color: "#e8d5b7" }}>{row["Name"]}</span>
                      <span style={{ color: "#b8a07a", fontFamily: "monospace" }}>
                        {row["Set code"]} · {row["Foil"] || "normal"} · x{row["Quantity"]}
                      </span>
                    </div>
                  ))}
                  {(validacion.filas ?? 0) > validacion.preview.length && (
                    <div style={{ padding: "8px 16px", fontSize: 11.5, color: "#8F672E" }}>
                      … y {(validacion.filas ?? 0) - validacion.preview.length} filas más
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {validacion && !validacion.valido && (
            <div style={{
              marginTop: 18, padding: "12px 16px", borderRadius: 8, background: "#2a0e0e",
              border: "1px solid #7f1d1d", color: "#fca5a5", fontSize: 13,
            }}>
              ✗ CSV inválido: {validacion.error}
            </div>
          )}
        </div>
      )}

      {/* ── Panel de depuración vs tienda (revisar antes de cargar) ── */}
      {depJob && (
        <div style={panel}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <div>
              <span style={{ fontFamily: "monospace", fontSize: 13, color: "#b8a07a" }}>{depJob.archivo}</span>
              <span style={{ fontSize: 12, color: "#8F672E", marginLeft: 10 }}>
                proveedor: {proveedor}
                {depJob.conservar != null && ` · cupo ${depJob.conservar} por carta (vs tienda)`}
              </span>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
              padding: "3px 12px", borderRadius: 20,
              background: ESTADO_COLOR[depJob.estado]?.bg ?? "#122F4380",
              border: `1px solid ${ESTADO_COLOR[depJob.estado]?.border ?? "#24445D"}`,
              color: ESTADO_COLOR[depJob.estado]?.text ?? "#93c5fd",
            }}>
              depurando · {depJob.estado.replace("_", " ")}
            </span>
          </div>

          {/* En curso */}
          {(depJob.estado === "ejecutando" || depJob.estado === "en_cola") && (
            <>
              <style>{`@keyframes tv-sweep { 0% { left: -35%; } 100% { left: 105%; } } @keyframes tv-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }`}</style>
              <div style={{ display: "flex", alignItems: "center", fontSize: 13, marginBottom: 8, color: "#e8d5b7" }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: "#8F672E", marginRight: 8, animation: "tv-pulse 1.2s ease-in-out infinite" }} />
                {depJob.estado === "en_cola" ? "En cola — esperando turno…" : (DEP_FASES[depJob.fase ?? ""] ?? "Procesando…")}
              </div>
              <div style={{ position: "relative", width: "100%", height: 8, background: "#0E151D", borderRadius: 99, overflow: "hidden", border: "1px solid #24445D40" }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, width: "32%", background: "linear-gradient(90deg, transparent, #8F672E, transparent)", animation: "tv-sweep 1.4s ease-in-out infinite" }} />
              </div>
            </>
          )}

          {/* Error / interrumpido */}
          {(depJob.estado === "error" || depJob.estado === "interrumpido") && (
            <div style={{ padding: "12px 16px", borderRadius: 8, background: "#2a0e0e", border: "1px solid #7f1d1d", color: "#fca5a5", fontSize: 13, whiteSpace: "pre-wrap" }}>
              ⚠️ La depuración terminó con error: {depJob.error ?? depJob.estado}
            </div>
          )}

          {/* Completado: reporte + confirmar */}
          {depJob.estado === "completado" && depJob.resumen && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "Sugerido retirar", value: `${depJob.resumen.total_retirar} copias`, accent: "#8F672E" },
                  { label: "Del CSV", value: `${depJob.resumen.total_copias} copias`, accent: "#24445D" },
                  { label: "Ya en tienda", value: `${depJob.resumen.cartas_en_tienda ?? 0} cartas`, accent: "#6A481C" },
                  { label: "Cartas afectadas", value: depJob.resumen.cartas_afectadas, accent: "#442E17" },
                ].map((kpi) => (
                  <div key={kpi.label} style={{ background: "#0E151D", border: `1px solid ${kpi.accent}40`, borderTop: `3px solid ${kpi.accent}`, borderRadius: 10, padding: "14px 14px" }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "#8F672E", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>{kpi.label}</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: "#e8d5b7", margin: "4px 0 0", fontFamily: "'Philosopher', serif" }}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: "#8F672E" }}>
                  Revisa y ajusta en el reporte (cantidades por carta). Al confirmar se carga el CSV ya filtrado.
                </span>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={cancelarDepuracion} style={botonSecundario}>Cancelar</button>
                  <button onClick={confirmarYCargar} disabled={confirmando} style={{ ...botonPrimario, opacity: confirmando ? 0.6 : 1, cursor: confirmando ? "wait" : "pointer" }}>
                    {confirmando ? "Cargando…" : "✓ Confirmar y cargar a la tienda"}
                  </button>
                </div>
              </div>

              <div style={{ border: "1px solid #24445D40", borderRadius: 10, overflow: "hidden", background: "#0E151D" }}>
                <iframe
                  ref={depIframeRef}
                  key={depJob.job_id}
                  src={`/api/depurador/jobs/${depJob.job_id}/reporte`}
                  title="Reporte de depuración vs tienda"
                  style={{ width: "100%", height: "78vh", border: "none", display: "block", background: "#0E1D2B" }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Panel de progreso / resultado ── */}
      {job && (
        <div style={panel}>
          {/* Cabecera del job */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <div>
              <span style={{ fontFamily: "monospace", fontSize: 13, color: "#b8a07a" }}>{job.archivo}</span>
              <span style={{ fontSize: 12, color: "#8F672E", marginLeft: 10 }}>proveedor: {job.proveedor}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {(job.estado === "ejecutando" || job.estado === "en_cola") && (
                <button
                  onClick={cancelarCargue}
                  disabled={cancelSolicitado}
                  style={{
                    ...botonCancelar,
                    opacity: cancelSolicitado ? 0.6 : 1,
                    cursor: cancelSolicitado ? "default" : "pointer",
                  }}
                >
                  {cancelSolicitado ? "Deteniendo…" : "⏹ Detener"}
                </button>
              )}
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
                padding: "3px 12px", borderRadius: 20,
                background: ESTADO_COLOR[job.estado]?.bg, border: `1px solid ${ESTADO_COLOR[job.estado]?.border}`,
                color: ESTADO_COLOR[job.estado]?.text,
              }}>
                {job.estado.replace("_", " ")}
              </span>
            </div>
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
                  /* Sin % medible aún (cache/en cola): destello que recorre la barra */
                  <div style={{
                    position: "absolute", top: 0, bottom: 0, width: "32%",
                    background: "linear-gradient(90deg, transparent, #8F672E, transparent)",
                    animation: "tv-sweep 1.4s ease-in-out infinite",
                  }} />
                ) : (
                  /* Avanzando: franjas diagonales en movimiento */
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
                  <span style={{ color: "#e8d5b7" }}>✓ {job.exitosas}</span>
                  <span style={{ color: job.fallidas > 0 ? "#fca5a5" : "#8F672E", marginLeft: 12 }}>✗ {job.fallidas}</span>
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
              ⚠️ El cargue terminó con error: {job.error ?? "desconocido"}
            </div>
          )}

          {/* Resumen final (completado o detenido) */}
          {(job.estado === "completado" || job.estado === "cancelado") && (
            <>
              {job.estado === "cancelado" && (
                <div style={{
                  padding: "10px 16px", borderRadius: 8, background: "#3a2f1f",
                  border: "1px solid #6A481C", color: "#d6b88a", fontSize: 13, marginBottom: 16,
                }}>
                  ⏹ Cargue detenido — se procesaron {job.procesadas} de {job.total} cartas (lo cargado quedó guardado en Shopify).
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Total", value: job.total, accent: "#24445D" },
                  { label: "Exitosas", value: job.exitosas, accent: "#8F672E" },
                  { label: "Fallidas", value: job.fallidas, accent: job.fallidas > 0 ? "#7f1d1d" : "#442E17" },
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

              {/* Fallidas con razón */}
              {!!resumen?.detalle_fallidas?.length && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <h3 style={{ ...tituloSeccion, margin: 0 }}>Cartas fallidas</h3>
                    <button
                      onClick={reintentarFallidas}
                      disabled={reintentando}
                      title="Vuelve a cargar solo las cartas fallidas como un cargue nuevo"
                      style={{
                        ...botonSecundario, padding: "5px 14px", fontSize: 12,
                        opacity: reintentando ? 0.6 : 1,
                        cursor: reintentando ? "wait" : "pointer",
                      }}
                    >
                      {reintentando
                        ? "Creando reintento…"
                        : `🔁 Reintentar todas (${resumen.detalle_fallidas.length})`}
                    </button>
                  </div>
                  <div style={{ border: "1px solid #7f1d1d60", borderRadius: 10, overflow: "hidden", background: "#0E151D" }}>
                    <ScrollArea className="h-[220px]">
                      {resumen.detalle_fallidas.map((r, i) => (
                        <div key={i} style={{
                          padding: "10px 16px", borderBottom: "1px solid #24445D30",
                          background: i % 2 === 0 ? "#0E151D" : "#0E1D2B", fontSize: 12.5,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: "#e8d5b7" }}>{r.title}</span>
                            <span style={{ fontFamily: "monospace", color: "#b8a07a" }}>{r.finish} · x{r.quantity}</span>
                          </div>
                          <span style={{ fontSize: 11.5, color: "#fca5a5" }}>{r.reason}</span>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                </div>
              )}

              {/* Exitosas */}
              {!!resumen?.detalle_exitosas?.length && (
                <div>
                  <h3 style={tituloSeccion}>Cartas cargadas</h3>
                  <div style={{ border: "1px solid #24445D40", borderRadius: 10, overflow: "hidden", background: "#0E151D" }}>
                    <ScrollArea className="h-[220px]">
                      {resumen.detalle_exitosas.map((r, i) => (
                        <div key={i} style={{
                          display: "flex", justifyContent: "space-between", padding: "10px 16px",
                          borderBottom: "1px solid #24445D30",
                          background: i % 2 === 0 ? "#0E151D" : "#0E1D2B", fontSize: 12.5,
                        }}>
                          <span style={{ color: "#e8d5b7" }}>{r.title}</span>
                          <span style={{ fontFamily: "monospace", color: "#b8a07a" }}>{r.sku} · {r.finish} · x{r.quantity}</span>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Historial ── */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ ...tituloSeccion, margin: 0 }}>Historial de cargues</h3>
          <button onClick={cargarHistorial} style={{ ...botonSecundario, padding: "5px 14px", fontSize: 12 }}>
            ↻ Actualizar
          </button>
        </div>
        <div style={{ border: "1px solid #24445D40", borderRadius: 10, overflow: "hidden", background: "#0E151D" }}>
          {historial.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 90, color: "#8F672E", fontSize: 13 }}>
              Aún no hay cargues registrados
            </div>
          )}
          {historial.map((h, i) => (
            <div key={h.job_id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: "10px 16px", borderBottom: "1px solid #24445D30",
              background: i % 2 === 0 ? "#0E151D" : "#0E1D2B", fontSize: 12.5, flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ color: "#8F672E", fontSize: 11.5, minWidth: 95 }}>{formatearFecha(h.creado)}</span>
                <span style={{ fontFamily: "monospace", color: "#e8d5b7" }}>{h.archivo}</span>
                <span style={{ color: "#b8a07a" }}>{h.proveedor}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: "#b8a07a" }}>
                  {h.total} cartas · <span style={{ color: "#e8d5b7" }}>✓ {h.exitosas}</span>
                  {" · "}
                  <span style={{ color: h.fallidas > 0 ? "#fca5a5" : "#8F672E" }}>✗ {h.fallidas}</span>
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
