import { useCallback, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

// Paleta de marca
// #442E17 #0E1D2B #6A481C #122F43 #8F672E #24445D #0E151D

// ─── Tipos (espejo de la API /piratas del backend) ────────────────────────────

type BotKey = "draco" | "rohan" | "elbulk" | "topcard";
type Estado = "en_cola" | "ejecutando" | "completado" | "error" | "cancelado";

interface Progreso {
  fase: string | null;
  procesados: number;
  total: number;
  oportunidades: number;
  no_encontradas: number;
  carta_actual: string | null;
  image_url: string | null;
  porcentaje: number;
}

interface Job {
  job_id: string;
  bot: BotKey;
  notificar: boolean;
  generar_excel: boolean;
  estado: Estado;
  creado: string;
  iniciado: string | null;
  finalizado: string | null;
  error: string | null;
  progreso: Progreso;
}

interface Oportunidad {
  scryfall_id: string;
  nombre: string;
  expansion: string;
  foil: boolean;
  full_art?: boolean;
  precio_tienda: number;
  precio_scg: number;
  diferencia: number;
  porcentaje: number;
  image_url: string | null;
  url_tienda: string | null;
  url_scg: string | null;
  nivel?: string;
  bot?: BotKey;
}

interface GrupoOportunidades {
  job_id: string | null;
  fecha: string | null;
  total: number;
  oportunidades: Oportunidad[];
}

interface OportunidadesResp {
  por_bot: Record<BotKey, GrupoOportunidades>;
  combinado: { total: number; oportunidades: Oportunidad[] };
}

// ─── Metadatos de los bots ────────────────────────────────────────────────────

const BOTS: { key: BotKey; nombre: string; emoji: string; accent: string }[] = [
  { key: "draco", nombre: "Draco", emoji: "🐲", accent: "#24445D" },
  { key: "rohan", nombre: "Rohan", emoji: "📚", accent: "#6A481C" },
  { key: "elbulk", nombre: "ElBulk", emoji: "🗑️", accent: "#8F672E" },
  { key: "topcard", nombre: "TopCard", emoji: "🐘", accent: "#442E17" },
];

const BOT_META: Record<string, { nombre: string; emoji: string; accent: string }> = {
  ...Object.fromEntries(BOTS.map((b) => [b.key, b])),
  combinado: { nombre: "Combinado", emoji: "🏴‍☠️", accent: "#B08343" },
};

const FASES: Record<string, string> = {
  recolectando: "Recolectando productos y consultando Scryfall…",
  procesando: "Comparando precios contra SCG…",
};

const ESTADO_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  en_cola: { bg: "#442E1740", border: "#6A481C", text: "#fdba74" },
  ejecutando: { bg: "#122F4380", border: "#24445D", text: "#93c5fd" },
  completado: { bg: "#8F672E40", border: "#8F672E", text: "#e8d5b7" },
  error: { bg: "#2a0e0e", border: "#7f1d1d", text: "#fca5a5" },
  cancelado: { bg: "#3a2f1f", border: "#6A481C", text: "#d6b88a" },
};

const ACTIVO = (e: Estado) => e === "en_cola" || e === "ejecutando";

function cop(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$ " + Math.round(n).toLocaleString("es-CO");
}

function formatearFecha(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function fmtSeg(s: number): string {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// ETA aproximado: usa la duración de la última corrida COMPLETADA del mismo bot
// como referencia (los bots no conocen su total de antemano, así que un ETA
// "X de Y" exacto no es fiable). Cuenta regresiva en vivo.
function estimarEta(jobs: Job[], corriendo: Job | undefined, nowMs: number) {
  if (!corriendo?.iniciado) return null;
  const ultima = jobs.find(
    (j) => j.bot === corriendo.bot && j.estado === "completado" && j.iniciado && j.finalizado,
  );
  if (!ultima?.iniciado || !ultima?.finalizado) return null;
  const dur = (new Date(ultima.finalizado).getTime() - new Date(ultima.iniciado).getTime()) / 1000;
  const elapsed = (nowMs - new Date(corriendo.iniciado).getTime()) / 1000;
  return { dur, elapsed, restante: dur - elapsed };
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function PiratasPage() {
  const [tab, setTab] = useState<"lanzar" | "oportunidades">("lanzar");

  return (
    <div style={{ fontFamily: "'Literata', Georgia, serif", color: "#e8d5b7" }}>
      <style>{`
        .pir-card-on { cursor: pointer; }
        .pir-card-on:hover { transform: translateY(-3px); box-shadow: 0 10px 24px #00000055; border-color: var(--accent); }
        @keyframes pir-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes pir-stripes { 0% { background-position: 0 0; } 100% { background-position: 28px 0; } }
        @keyframes pir-sweep { 0% { left: -35%; } 100% { left: 105%; } }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: "'Philosopher', serif", fontSize: 22, fontWeight: 700, color: "#e8d5b7", margin: 0 }}>
          🏴‍☠️ Bots Pirata
        </h2>
        <p style={{ fontSize: 13, color: "#8F672E", marginTop: 4 }}>
          Cazan cartas más baratas que SCG en 4 tiendas y listan las mejores oportunidades de compra
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        {([["lanzar", "⚡ Lanzar bots"], ["oportunidades", "💎 Oportunidades"]] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              border: `1px solid ${tab === t ? "#8F672E" : "#24445D"}`,
              background: tab === t ? "#442E1740" : "#0E151D",
              color: tab === t ? "#e8d5b7" : "#b8a07a",
              fontFamily: "'Philosopher', serif",
              fontWeight: 700,
              fontSize: 13.5,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "lanzar" ? <LauncherTab /> : <OportunidadesTab />}
    </div>
  );
}

// ─── Tab: Lanzar ────────────────────────────────────────────────────────────

function LauncherTab() {
  const [seleccionado, setSeleccionado] = useState<BotKey | null>(null);
  const [notificar, setNotificar] = useState(true);   // ON por defecto, pero desactivable
  const [lanzando, setLanzando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracked, setTracked] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [cancelando, setCancelando] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(Date.now());

  const cargarJobs = useCallback(async () => {
    try {
      const r = await fetch("/api/piratas/jobs");
      if (r.ok) setJobs(await r.json());
    } catch {
      /* no crítico */
    }
  }, []);

  useEffect(() => {
    cargarJobs();
  }, [cargarJobs]);

  // Polling mientras haya algún job tracked activo
  const hayActivo = jobs.some((j) => tracked.includes(j.job_id) && ACTIVO(j.estado));
  useEffect(() => {
    if (tracked.length === 0) return;
    const timer = setInterval(cargarJobs, 3000);
    return () => clearInterval(timer);
  }, [tracked, hayActivo, cargarJobs]);

  // Tick de 1s para la cuenta regresiva del ETA mientras hay algo corriendo
  useEffect(() => {
    if (!hayActivo) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hayActivo]);

  async function lanzar(bot: BotKey) {
    setLanzando(true);
    setError(null);
    try {
      const r = await fetch("/api/piratas/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot, notificar }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? data.error ?? `HTTP ${r.status}`);
      setTracked((prev) => [data.job_id, ...prev]);
      cargarJobs();
    } catch (e: any) {
      setError(e.message ?? "Error lanzando el bot");
    } finally {
      setLanzando(false);
    }
  }

  async function lanzarTodos() {
    setLanzando(true);
    setError(null);
    try {
      const r = await fetch("/api/piratas/scan-todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificar }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail ?? data.error ?? `HTTP ${r.status}`);
      const ids = (data as Job[]).map((j) => j.job_id);
      setTracked((prev) => [...ids, ...prev]);
      cargarJobs();
    } catch (e: any) {
      setError(e.message ?? "Error lanzando los bots");
    } finally {
      setLanzando(false);
    }
  }

  async function cancelar(jobId: string) {
    setCancelando((c) => ({ ...c, [jobId]: true }));
    try {
      await fetch(`/api/piratas/jobs/${jobId}/cancelar`, { method: "POST" });
      cargarJobs();
    } catch {
      setCancelando((c) => ({ ...c, [jobId]: false }));
    }
  }

  const trackedJobs = jobs.filter((j) => tracked.includes(j.job_id));
  const corriendo = trackedJobs.find((j) => j.estado === "ejecutando")
    ?? trackedJobs.find((j) => j.estado === "en_cola");
  const eta = estimarEta(jobs, corriendo, now);

  return (
    <>
      {error && (
        <div style={errorBox}>⚠️ {error}</div>
      )}

      {/* Lanzador */}
      <div style={panel}>
        <p style={tituloSeccion}>Elige un bot y confírmalo abajo, o córrelos todos</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {BOTS.map((b) => {
            const sel = seleccionado === b.key;
            return (
              <button
                key={b.key}
                onClick={() => setSeleccionado(b.key)}
                className="pir-card-on"
                style={{
                  "--accent": b.accent,
                  background: sel ? "#122F4380" : "#0E151D",
                  border: `1px solid ${sel ? b.accent : b.accent + "55"}`,
                  borderTop: `3px solid ${b.accent}`,
                  borderRadius: 10,
                  padding: "16px 14px",
                  color: "#e8d5b7",
                  cursor: "pointer",
                  fontFamily: "'Philosopher', serif",
                  transition: "all 0.15s",
                  textAlign: "center",
                  boxShadow: sel ? `0 0 0 2px ${b.accent}` : "none",
                } as React.CSSProperties}
              >
                <div style={{ fontSize: 26 }}>{b.emoji}</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{b.nombre}</div>
                {sel && <div style={{ fontSize: 10.5, color: "#93c5fd", marginTop: 4, fontWeight: 700 }}>✓ seleccionado</div>}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 18 }}>
          <ToggleRow
            checked={notificar}
            onChange={setNotificar}
            titulo="Notificar por Telegram"
            sub={notificar ? "Envía oportunidades y resumen al canal" : "Sin notificaciones (solo en el panel)"}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginTop: 16 }}>
          <button
            onClick={() => seleccionado && lanzar(seleccionado)}
            disabled={lanzando || !seleccionado}
            style={{ ...botonPrimario, opacity: (lanzando || !seleccionado) ? 0.5 : 1, cursor: (lanzando || !seleccionado) ? "not-allowed" : "pointer" }}
          >
            {lanzando ? "Lanzando…" : seleccionado ? `▶ Lanzar ${BOT_META[seleccionado]?.nombre}` : "Selecciona un bot"}
          </button>
          <button onClick={lanzarTodos} disabled={lanzando} style={{ ...botonSecundario, opacity: lanzando ? 0.5 : 1, cursor: lanzando ? "wait" : "pointer" }}>
            {lanzando ? "Encolando…" : "🏴‍☠️ Correr los 4"}
          </button>
        </div>
      </div>

      {/* Job en curso */}
      {corriendo && (
        <div style={{ ...panel, marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#e8d5b7", fontFamily: "'Philosopher', serif" }}>
                {BOT_META[corriendo.bot]?.emoji} {BOT_META[corriendo.bot]?.nombre}
              </span>
              {corriendo.estado === "ejecutando" && (
                <div style={{ fontSize: 12, color: "#8F672E", marginTop: 2 }}>
                  {eta
                    ? eta.restante > 0
                      ? `≈ ${fmtSeg(eta.restante)} restante · última corrida ${fmtSeg(eta.dur)}`
                      : `tomando un poco más de lo usual (última: ${fmtSeg(eta.dur)})`
                    : "estimando… (sin corrida previa de referencia)"}
                </div>
              )}
            </div>
            <button
              onClick={() => cancelar(corriendo.job_id)}
              disabled={cancelando[corriendo.job_id]}
              style={{ ...botonCancelar, opacity: cancelando[corriendo.job_id] ? 0.6 : 1, cursor: cancelando[corriendo.job_id] ? "default" : "pointer" }}
            >
              {cancelando[corriendo.job_id] ? "Cancelando…" : "⏹ Cancelar"}
            </button>
          </div>
          <ProgresoBar job={corriendo} />
        </div>
      )}

      {/* Chips de los tracked */}
      {trackedJobs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {trackedJobs.map((j) => (
            <span key={j.job_id} style={{
              fontSize: 12, padding: "4px 12px", borderRadius: 20,
              background: ESTADO_COLOR[j.estado]?.bg, border: `1px solid ${ESTADO_COLOR[j.estado]?.border}`,
              color: ESTADO_COLOR[j.estado]?.text, fontFamily: "'Philosopher', serif", fontWeight: 700,
            }}>
              {BOT_META[j.bot]?.emoji} {BOT_META[j.bot]?.nombre}: {j.estado.replace("_", " ")}
              {j.estado === "completado" && j.progreso?.oportunidades ? ` · ${j.progreso.oportunidades} 💎` : ""}
            </span>
          ))}
        </div>
      )}

      {/* Historial */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ ...tituloSeccion, margin: 0 }}>Historial de corridas</h3>
          <button onClick={cargarJobs} style={{ ...botonSecundario, padding: "5px 14px", fontSize: 12 }}>↻ Actualizar</button>
        </div>
        <div style={{ border: "1px solid #24445D40", borderRadius: 10, overflow: "hidden", background: "#0E151D" }}>
          {jobs.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 90, color: "#8F672E", fontSize: 13 }}>
              Aún no hay corridas registradas
            </div>
          )}
          <ScrollArea className="h-[320px]">
            {jobs.map((h, i) => (
              <div key={h.job_id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: "10px 16px", borderBottom: "1px solid #24445D30",
                background: i % 2 === 0 ? "#0E151D" : "#0E1D2B", fontSize: 12.5, flexWrap: "wrap",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ color: "#8F672E", fontSize: 11.5, minWidth: 95 }}>{formatearFecha(h.creado)}</span>
                  <span style={{ color: "#e8d5b7", fontWeight: 700 }}>{BOT_META[h.bot]?.emoji} {BOT_META[h.bot]?.nombre}</span>
                  {h.progreso?.total ? (
                    <span style={{ color: "#b8a07a" }}>{h.progreso.procesados}/{h.progreso.total} · <span style={{ color: "#e8d5b7" }}>{h.progreso.oportunidades} 💎</span></span>
                  ) : null}
                </div>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
                  padding: "2px 10px", borderRadius: 20,
                  background: ESTADO_COLOR[h.estado]?.bg, border: `1px solid ${ESTADO_COLOR[h.estado]?.border}`,
                  color: ESTADO_COLOR[h.estado]?.text,
                }}>
                  {h.estado.replace("_", " ")}
                </span>
              </div>
            ))}
          </ScrollArea>
        </div>
      </div>
    </>
  );
}

function ProgresoBar({ job }: { job: Job }) {
  const p = job.progreso;
  const pct = p?.porcentaje ?? 0;
  const enCola = job.estado === "en_cola";
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
        <span style={{ color: "#e8d5b7", display: "flex", alignItems: "center" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: "#8F672E", marginRight: 8, animation: "pir-pulse 1.2s ease-in-out infinite" }} />
          {enCola ? "En cola — esperando turno…" : (FASES[p?.fase ?? ""] ?? p?.fase ?? "…")}
        </span>
        {p?.total ? <span style={{ color: "#8F672E", fontWeight: 700 }}>{p.oportunidades} 💎</span> : null}
      </div>
      <div style={{ position: "relative", width: "100%", height: 8, background: "#0E151D", borderRadius: 99, overflow: "hidden", border: "1px solid #24445D40" }}>
        {pct === 0 ? (
          <div style={{ position: "absolute", top: 0, bottom: 0, width: "32%", background: "linear-gradient(90deg, transparent, #8F672E, transparent)", animation: "pir-sweep 1.4s ease-in-out infinite" }} />
        ) : (
          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, transition: "width 0.6s", backgroundImage: "repeating-linear-gradient(45deg, #8F672E 0, #8F672E 10px, #6A481C 10px, #6A481C 20px)", animation: "pir-stripes 0.9s linear infinite" }} />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12.5 }}>
        <span style={{ color: "#b8a07a" }}>
          {p?.total ? <>{p.procesados}/{p.total} · <b style={{ color: "#e8d5b7" }}>{pct}%</b></> : "preparando…"}
          {p?.carta_actual && <span style={{ marginLeft: 10, fontFamily: "monospace", color: "#93c5fd" }}>🃏 {p.carta_actual}</span>}
        </span>
        {p?.no_encontradas ? <span style={{ color: "#fca5a5" }}>✗ {p.no_encontradas}</span> : null}
      </div>
    </>
  );
}

// ─── Tab: Oportunidades ───────────────────────────────────────────────────────

function OportunidadesTab() {
  const [data, setData] = useState<OportunidadesResp | null>(null);
  const [seleccion, setSeleccion] = useState<string>("combinado");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch("/api/piratas/oportunidades");
      if (r.ok) setData(await r.json());
    } catch {
      /* no crítico */
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const grupos: { key: string; total: number; ops: Oportunidad[]; mejor: number }[] = [];
  if (data) {
    grupos.push({
      key: "combinado",
      total: data.combinado.total,
      ops: data.combinado.oportunidades,
      mejor: data.combinado.oportunidades[0]?.diferencia ?? 0,
    });
    for (const b of BOTS) {
      const g = data.por_bot[b.key];
      grupos.push({
        key: b.key,
        total: g?.total ?? 0,
        ops: g?.oportunidades ?? [],
        mejor: g?.oportunidades?.[0]?.diferencia ?? 0,
      });
    }
  }

  const grupoSel = grupos.find((g) => g.key === seleccion);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <p style={{ ...tituloSeccion, margin: 0 }}>Elige sobre qué bot ver las oportunidades</p>
        <button onClick={cargar} style={{ ...botonSecundario, padding: "5px 14px", fontSize: 12 }}>↻ Actualizar</button>
      </div>

      {/* Tarjetas selectoras */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 22 }}>
        {grupos.map((g) => {
          const meta = BOT_META[g.key];
          const activa = seleccion === g.key;
          return (
            <div
              key={g.key}
              onClick={() => setSeleccion(g.key)}
              className="pir-card-on"
              style={{
                "--accent": meta.accent,
                background: activa ? "#122F4380" : "#0E151D",
                border: `1px solid ${activa ? meta.accent : meta.accent + "40"}`,
                borderTop: `3px solid ${meta.accent}`,
                borderRadius: 10,
                padding: "14px 14px",
                transition: "all 0.15s",
              } as React.CSSProperties}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 22 }}>{meta.emoji}</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#e8d5b7", fontFamily: "'Philosopher', serif" }}>{g.total}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: activa ? "#fff" : "#e8d5b7", marginTop: 6, fontFamily: "'Philosopher', serif" }}>{meta.nombre}</div>
              <div style={{ fontSize: 11.5, color: "#8F672E", marginTop: 2 }}>
                {g.mejor > 0 ? `mejor +${cop(g.mejor)}` : "sin oportunidades"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lista de oportunidades del grupo seleccionado */}
      {cargando && !data ? (
        <div style={{ ...panel, textAlign: "center", color: "#8F672E" }}>Cargando oportunidades…</div>
      ) : !grupoSel || grupoSel.ops.length === 0 ? (
        <div style={{ ...panel, textAlign: "center", color: "#8F672E" }}>
          No hay oportunidades para {BOT_META[seleccion]?.nombre}. Corre el bot desde la pestaña “Lanzar”.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {grupoSel.ops.map((o, i) => (
            <OportunidadRow key={`${o.scryfall_id}-${o.bot ?? seleccion}-${i}`} o={o} mostrarBot={seleccion === "combinado"} />
          ))}
        </div>
      )}
    </>
  );
}

function OportunidadRow({ o, mostrarBot }: { o: Oportunidad; mostrarBot: boolean }) {
  const meta = o.bot ? BOT_META[o.bot] : null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      background: "#0E1D2B", border: "1px solid #24445D40", borderRadius: 10,
      padding: "10px 14px", flexWrap: "wrap",
    }}>
      <img
        src={o.image_url || LOGO_FALLBACK}
        alt=""
        loading="lazy"
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = LOGO_FALLBACK; }}
        style={{ width: 46, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid #24445D", flexShrink: 0 }}
      />
      <div style={{ flex: "1 1 180px", minWidth: 160 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: "#e8d5b7", fontFamily: "'Philosopher', serif" }}>
          {o.nombre} {o.foil && <span style={{ fontSize: 11, color: "#B08343" }}>✦ foil</span>}
        </div>
        <div style={{ fontSize: 11.5, color: "#8F672E" }}>
          {o.expansion}
          {mostrarBot && meta && <span style={{ marginLeft: 8, color: "#93c5fd" }}>{meta.emoji} {meta.nombre}</span>}
        </div>
      </div>
      <div style={{ textAlign: "right", fontSize: 12.5, color: "#b8a07a", flexShrink: 0 }}>
        <div>tienda <b style={{ color: "#e8d5b7" }}>{cop(o.precio_tienda)}</b></div>
        <div>SCG <b style={{ color: "#e8d5b7" }}>{cop(o.precio_scg)}</b></div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 110 }}>
        <div style={{ fontSize: 19, fontWeight: 900, color: "#39FF14", textShadow: "0 0 7px #39FF1490", fontFamily: "'Philosopher', serif" }}>
          +{cop(o.diferencia)}
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#39FF14" }}>+{Math.round(o.porcentaje)}%</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        {o.url_tienda && (
          <a href={o.url_tienda} target="_blank" rel="noreferrer" style={linkBtn}>Tienda ↗</a>
        )}
        {o.url_scg && (
          <a href={o.url_scg} target="_blank" rel="noreferrer" style={{ ...linkBtn, background: "#122F43" }}>SCG ↗</a>
        )}
      </div>
    </div>
  );
}

// ─── Estilos compartidos ──────────────────────────────────────────────────────

const LOGO_FALLBACK = "https://cdn.shopify.com/s/files/1/0710/0029/3568/files/TheVault.jpg?v=1757364051";

const panel: React.CSSProperties = {
  background: "#0E1D2B",
  border: "1px solid #24445D40",
  borderRadius: 10,
  padding: "20px 18px",
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
  padding: "8px 16px",
  background: "#2a0e0e",
  color: "#fca5a5",
  border: "1px solid #7f1d1d",
  borderRadius: 8,
  fontFamily: "'Philosopher', serif",
  fontWeight: 700,
  fontSize: 13,
  transition: "all 0.2s",
};

const linkBtn: React.CSSProperties = {
  padding: "5px 12px",
  background: "#8F672E",
  color: "#e8d5b7",
  border: "1px solid #6A481C",
  borderRadius: 6,
  fontFamily: "'Philosopher', serif",
  fontWeight: 700,
  fontSize: 11.5,
  textDecoration: "none",
  textAlign: "center",
  whiteSpace: "nowrap",
};

const errorBox: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 8,
  background: "#2a0e0e",
  border: "1px solid #7f1d1d",
  color: "#fca5a5",
  fontSize: 13,
  marginBottom: 16,
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
        <div style={{ position: "absolute", top: 3, left: checked ? 20 : 3, width: 14, height: 14, borderRadius: "50%", background: "#e8d5b7", transition: "left 0.2s" }} />
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#e8d5b7", margin: 0, fontFamily: "'Philosopher', serif" }}>{titulo}</p>
        <p style={{ fontSize: 11, color: "#5C84A0", margin: 0 }}>{sub}</p>
      </div>
    </div>
  );
}
