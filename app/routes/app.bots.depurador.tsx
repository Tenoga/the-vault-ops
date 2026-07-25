import { useEffect, useRef, useState, useCallback } from "react";

// Paleta de marca
// #442E17 #0E1D2B #6A481C #122F43 #8F672E #24445D #0E151D

// ─── Tipos (espejo de la API /depurador del backend) ──────────────────────────

interface Resumen {
  total_copias: number;
  total_retirar: number;
  valor_retirar: number;
  cartas_afectadas: number;
  copias_por_fuente: { scg: number; scryfall: number; csv: number };
  sin_precio: number;
  no_encontradas_scryfall: number;
  salidas: { reporte: string; retirar: string; depurado: string };
}

interface Job {
  job_id: string;
  archivo: string;
  umbral: number;
  conservar: number;
  cmc: number | null;
  letras: string | null;
  color: string | null;
  estado:
    | "en_cola"
    | "ejecutando"
    | "completado"
    | "error"
    | "cancelado"
    | "interrumpido";
  creado: string;
  iniciado: string | null;
  finalizado: string | null;
  error: string | null;
  resumen?: Resumen | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ESTADO_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  en_cola: { bg: "#442E1740", border: "#6A481C", text: "#fdba74" },
  ejecutando: { bg: "#122F4380", border: "#24445D", text: "#93c5fd" },
  completado: { bg: "#8F672E40", border: "#8F672E", text: "#e8d5b7" },
  error: { bg: "#2a0e0e", border: "#7f1d1d", text: "#fca5a5" },
  cancelado: { bg: "#3a2f1f", border: "#6A481C", text: "#d6b88a" },
  interrumpido: { bg: "#3a2f1f", border: "#6A481C", text: "#d6b88a" },
};

const TERMINADO = ["completado", "error", "cancelado", "interrumpido"];

function formatearFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function DepuradorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [umbral, setUmbral] = useState("0.90");
  const [conservar, setConservar] = useState("4");
  const [cmc, setCmc] = useState("");
  const [letras, setLetras] = useState("");
  const [color, setColor] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [historial, setHistorial] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cancelSolicitado, setCancelSolicitado] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [maximizado, setMaximizado] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const cargarHistorial = useCallback(async () => {
    try {
      const r = await fetch("/api/depurador/jobs");
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
    if (!job || TERMINADO.includes(job.estado)) return;

    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/depurador/jobs/${job.job_id}`);
        if (!r.ok) return;
        const j: Job = await r.json();

        if (TERMINADO.includes(j.estado)) {
          const rr = await fetch(`/api/depurador/jobs/${j.job_id}?result=1`);
          setJob(rr.ok ? await rr.json() : j);
          cargarHistorial();
        } else {
          setJob(j);
        }
      } catch {
        /* reintenta en el siguiente tick */
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [job?.job_id, job?.estado, cargarHistorial]);

  function seleccionarArchivo(f: File) {
    setFile(f);
    setError(null);
  }

  async function iniciarDepuracion() {
    if (!file) return;
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("umbral", umbral.trim() || "0.90");
      fd.append("conservar", conservar.trim() || "4");
      if (cmc.trim()) fd.append("cmc", cmc.trim());
      if (letras.trim()) fd.append("letras", letras.trim());
      if (color.trim()) fd.append("color", color.trim());
      const r = await fetch("/api/depurador/upload", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? data.detail ?? `HTTP ${r.status}`);
      setJob(data);
      setHistorialAbierto(false);
      cargarHistorial();
    } catch (e: any) {
      setError(e.message ?? "Error iniciando la depuración");
    } finally {
      setSubiendo(false);
    }
  }

  async function cancelar() {
    if (!job) return;
    setCancelSolicitado(true);
    try {
      const r = await fetch(`/api/depurador/jobs/${job.job_id}/cancelar`, { method: "POST" });
      if (r.ok) setJob(await r.json());
      else setCancelSolicitado(false);
    } catch {
      setCancelSolicitado(false);
    }
  }

  async function verJob(j: Job) {
    setError(null);
    setCancelSolicitado(false);
    setHistorialAbierto(false);
    if (TERMINADO.includes(j.estado)) {
      try {
        const r = await fetch(`/api/depurador/jobs/${j.job_id}?result=1`);
        setJob(r.ok ? await r.json() : j);
      } catch {
        setJob(j);
      }
    } else {
      setJob(j);
    }
  }

  function nuevaDepuracion() {
    setJob(null);
    setFile(null);
    setError(null);
    setCancelSolicitado(false);
    setMaximizado(false);
    setHistorialAbierto(true);
  }

  const puedeIniciar = !!file && !subiendo;
  const resumen = job?.resumen ?? null;
  const reporteUrl = job ? `/api/depurador/jobs/${job.job_id}/reporte` : "";

  return (
    <div style={{ fontFamily: "'Literata', Georgia, serif", color: "#e8d5b7" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontFamily: "'Philosopher', serif", fontSize: 22, fontWeight: 700, color: "#e8d5b7", margin: 0 }}>
            Depurador de Inventario
          </h2>
          <p style={{ fontSize: 13, color: "#8F672E", marginTop: 4 }}>
            CSV de ManaBox → detecta copias baratas repetidas para sacar, con reporte visual
          </p>
        </div>
        {job && (
          <button onClick={nuevaDepuracion} style={botonSecundario}>
            ＋ Nueva depuración
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

      {/* ── Panel de subida (cuando no hay job activo) ── */}
      {!job && (
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
              borderRadius: 10, padding: "36px 20px", textAlign: "center", cursor: "pointer",
              background: dragOver ? "#442E1730" : "#0E151D", transition: "all 0.15s", marginBottom: 18,
            }}
          >
            <input
              ref={inputRef} type="file" accept=".csv" style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) seleccionarArchivo(f);
                e.target.value = "";
              }}
            />
            <div style={{ fontSize: 38, marginBottom: 8 }}>🃏</div>
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
                Arrastra el CSV exportado de ManaBox aquí, o haz clic para buscarlo
              </p>
            )}
          </div>

          {/* Parámetros */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
            <label style={campoLabel}>
              Umbral USD (≤ se depura)
              <input type="number" step="0.01" min="0" value={umbral} onChange={(e) => setUmbral(e.target.value)} style={campoInput} />
            </label>
            <label style={campoLabel}>
              Conservar por carta
              <input type="number" step="1" min="1" value={conservar} onChange={(e) => setConservar(e.target.value)} style={campoInput} />
            </label>
            <label style={campoLabel}>
              CMC esperado (opcional)
              <input type="number" step="0.5" min="0" placeholder="—" value={cmc} onChange={(e) => setCmc(e.target.value)} style={campoInput} />
            </label>
            <label style={campoLabel}>
              Rango de letras (opcional)
              <input type="text" maxLength={7} placeholder="P-Z" value={letras} onChange={(e) => setLetras(e.target.value)} style={campoInput} />
            </label>
            <label style={campoLabel}>
              Color esperado (opcional)
              <select value={color} onChange={(e) => setColor(e.target.value)} style={campoInput}>
                <option value="">— cualquiera —</option>
                <option value="Blanco">Blanco</option>
                <option value="Azul">Azul</option>
                <option value="Negro">Negro</option>
                <option value="Rojo">Rojo</option>
                <option value="Verde">Verde</option>
                <option value="Multicolor">Multicolor</option>
                <option value="Incoloro">Incoloro</option>
                <option value="Tierra">Tierra</option>
              </select>
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 12, color: "#8F672E", maxWidth: 460, lineHeight: 1.5 }}>
              Consulta precios en SCG (Scryfall de respaldo). La primera corrida del día puede tardar
              unos minutos mientras barre el inventario de SCG.
            </p>
            <button onClick={iniciarDepuracion} disabled={!puedeIniciar} style={{
              ...botonPrimario, opacity: puedeIniciar ? 1 : 0.5, cursor: puedeIniciar ? "pointer" : "not-allowed",
            }}>
              {subiendo ? "Subiendo…" : "⚡ Depurar"}
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
              <span style={{ fontFamily: "monospace", fontSize: 13, color: "#b8a07a" }}>{job.archivo}</span>
              <span style={{ fontSize: 12, color: "#8F672E", marginLeft: 10 }}>
                ≤ ${Number(job.umbral).toFixed(2)} · conservar {job.conservar}
                {job.cmc != null && ` · CMC ${job.cmc}`}
                {job.letras && ` · ${job.letras}`}
                {job.color && ` · ${job.color}`}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {(job.estado === "ejecutando" || job.estado === "en_cola") && (
                <button onClick={cancelar} disabled={cancelSolicitado} style={{
                  ...botonCancelar, opacity: cancelSolicitado ? 0.6 : 1,
                  cursor: cancelSolicitado ? "default" : "pointer",
                }}>
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

          {/* Progreso en vivo (indeterminado — el depurador no reporta % fino) */}
          {(job.estado === "ejecutando" || job.estado === "en_cola") && (
            <>
              <style>{`
                @keyframes tv-sweep { 0% { left: -35%; } 100% { left: 105%; } }
                @keyframes tv-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
              `}</style>
              <div style={{ display: "flex", alignItems: "center", fontSize: 13, marginBottom: 8, color: "#e8d5b7" }}>
                <span style={{
                  display: "inline-block", width: 8, height: 8, borderRadius: 99,
                  background: "#8F672E", marginRight: 8, animation: "tv-pulse 1.2s ease-in-out infinite",
                }} />
                {job.estado === "en_cola"
                  ? "En cola — esperando turno…"
                  : "Consultando precios (SCG / Scryfall) y generando el reporte…"}
              </div>
              <div style={{ position: "relative", width: "100%", height: 8, background: "#0E151D", borderRadius: 99, overflow: "hidden", border: "1px solid #24445D40" }}>
                <div style={{
                  position: "absolute", top: 0, bottom: 0, width: "32%",
                  background: "linear-gradient(90deg, transparent, #8F672E, transparent)",
                  animation: "tv-sweep 1.4s ease-in-out infinite",
                }} />
              </div>
            </>
          )}

          {/* Error del job */}
          {job.estado === "error" && (
            <div style={{
              padding: "12px 16px", borderRadius: 8, background: "#2a0e0e",
              border: "1px solid #7f1d1d", color: "#fca5a5", fontSize: 13, whiteSpace: "pre-wrap",
            }}>
              ⚠️ La depuración terminó con error: {job.error ?? "desconocido"}
            </div>
          )}

          {job.estado === "interrumpido" && (
            <div style={{
              padding: "12px 16px", borderRadius: 8, background: "#3a2f1f",
              border: "1px solid #6A481C", color: "#d6b88a", fontSize: 13,
            }}>
              El proceso quedó interrumpido (probablemente por un reinicio del servidor). Vuelve a intentarlo.
            </div>
          )}

          {/* Resultado (completado) */}
          {job.estado === "completado" && resumen && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
                {[
                  { label: "A retirar", value: `${resumen.total_retirar} copias`, accent: "#8F672E" },
                  { label: "Del lote", value: `${resumen.total_copias} copias`, accent: "#24445D" },
                  { label: "Valor retirado", value: `~$${resumen.valor_retirar.toFixed(2)}`, accent: "#6A481C" },
                  { label: "Cartas afectadas", value: resumen.cartas_afectadas, accent: "#442E17" },
                ].map((kpi) => (
                  <div key={kpi.label} style={{
                    background: "#0E151D", border: `1px solid ${kpi.accent}40`, borderTop: `3px solid ${kpi.accent}`,
                    borderRadius: 10, padding: "14px 14px",
                  }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "#8F672E", textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>
                      {kpi.label}
                    </p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: "#e8d5b7", margin: "4px 0 0", fontFamily: "'Philosopher', serif" }}>
                      {kpi.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Descargas + abrir en pestaña */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
                <a href={`/api/depurador/jobs/${job.job_id}/archivo/retirar`} style={enlaceBoton}>⬇ Lista de retiro (CSV)</a>
                <a href={`/api/depurador/jobs/${job.job_id}/archivo/depurado`} style={enlaceBoton}>⬇ Inventario depurado (CSV)</a>
                <a href={reporteUrl} target="_blank" rel="noreferrer" style={{ ...enlaceBoton, background: "#8F672E", color: "#0E151D" }}>
                  ↗ Abrir reporte en pestaña
                </a>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "#8F672E" }}>
                Fuente de precios: SCG {resumen.copias_por_fuente.scg} · Scryfall {resumen.copias_por_fuente.scryfall} · CSV {resumen.copias_por_fuente.csv} copias.
                {" "}Dentro del reporte puedes marcar lo que sacas, ajustar cantidades y exportar el CSV para cargar a la página.
              </p>

              {/* Reporte interactivo incrustado (con modo pantalla completa) */}
              <div style={maximizado
                ? { position: "fixed", inset: 0, zIndex: 1000, background: "#0E151D", display: "flex", flexDirection: "column" }
                : { border: "1px solid #24445D40", borderRadius: 10, overflow: "hidden", background: "#0E151D" }
              }>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                  padding: "6px 12px", background: "#0E1D2B", borderBottom: "1px solid #24445D40",
                }}>
                  <span style={{ fontSize: 12, color: "#8F672E" }}>
                    Reporte interactivo — marca lo que sacas, ajusta cantidades y exporta
                  </span>
                  <button
                    onClick={() => setMaximizado((m) => !m)}
                    style={{ ...botonSecundario, padding: "4px 14px", fontSize: 12 }}
                  >
                    {maximizado ? "⤡ Reducir" : "⛶ Pantalla completa"}
                  </button>
                </div>
                <iframe
                  key={job.job_id}
                  src={reporteUrl}
                  title="Reporte de depuración"
                  style={{
                    width: "100%",
                    height: maximizado ? "calc(100vh - 40px)" : "85vh",
                    border: "none", display: "block", background: "#0E1D2B",
                    flex: maximizado ? 1 : undefined,
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Historial (colapsable, para no estorbar mientras trabajas) ── */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button
            onClick={() => setHistorialAbierto((v) => !v)}
            style={{
              ...tituloSeccion, margin: 0, background: "none", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8, padding: 0,
            }}
          >
            <span style={{ transform: historialAbierto ? "rotate(90deg)" : "none", transition: "transform 0.2s", display: "inline-block", color: "#8F672E" }}>▸</span>
            Historial de depuraciones
            {historial.length > 0 && <span style={{ color: "#6A481C" }}>({historial.length})</span>}
          </button>
          {historialAbierto && (
            <button onClick={cargarHistorial} style={{ ...botonSecundario, padding: "5px 14px", fontSize: 12 }}>
              ↻ Actualizar
            </button>
          )}
        </div>
        {historialAbierto && (
        <div style={{ border: "1px solid #24445D40", borderRadius: 10, overflow: "hidden", background: "#0E151D" }}>
          {historial.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 90, color: "#8F672E", fontSize: 13 }}>
              Aún no hay depuraciones registradas
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
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {h.resumen && (
                  <span style={{ color: "#b8a07a" }}>
                    <span style={{ color: "#e8d5b7" }}>{h.resumen.total_retirar}</span> a retirar de {h.resumen.total_copias}
                  </span>
                )}
                <span style={{
                  fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
                  padding: "2px 10px", borderRadius: 20,
                  background: ESTADO_COLOR[h.estado]?.bg, border: `1px solid ${ESTADO_COLOR[h.estado]?.border}`,
                  color: ESTADO_COLOR[h.estado]?.text,
                }}>
                  {h.estado.replace("_", " ")}
                </span>
                <button onClick={() => verJob(h)} style={{ ...botonSecundario, padding: "4px 12px", fontSize: 11.5 }}>
                  {TERMINADO.includes(h.estado) ? "Ver" : "Seguir"}
                </button>
              </div>
            </div>
          ))}
        </div>
        )}
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

const campoLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 11.5,
  color: "#8F672E",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const campoInput: React.CSSProperties = {
  padding: "9px 12px",
  background: "#0E151D",
  border: "1px solid #24445D",
  borderRadius: 8,
  color: "#e8d5b7",
  fontSize: 14,
  fontFamily: "'Literata', Georgia, serif",
  outline: "none",
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

const enlaceBoton: React.CSSProperties = {
  padding: "9px 16px",
  background: "#122F43",
  color: "#e8d5b7",
  border: "1px solid #24445D",
  borderRadius: 8,
  fontFamily: "'Philosopher', serif",
  fontWeight: 700,
  fontSize: 13,
  textDecoration: "none",
  display: "inline-block",
};
