import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "react-router";

// ─── Paleta de marca ──────────────────────────────────────────────────────────
// #442E17 #0E1D2B #6A481C #122F43 #8F672E #24445D #0E151D #B08343 #5C84A0
const ACCENT = "#5C84A0";

// ─── Types ──────────────────────────────────────────────────────────────────
type Tipo = "envio" | "pickup";

interface Destinatario {
  nombre: string;
  documento: string;
  telefono: string;
  direccion: string;
  complemento: string;
  ciudad: string;
  departamento: string;
}

interface PrefillResponse {
  status: string;
  order_name?: string;
  pedido?: string;
  tipo?: Tipo;
  destinatario?: Destinatario;
  error?: string;
}

const DEST_VACIO: Destinatario = {
  nombre: "",
  documento: "",
  telefono: "",
  direccion: "",
  complemento: "",
  ciudad: "",
  departamento: "",
};

// ─── Estilos ──────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0E151D",
  color: "#e8d5b7",
  border: "1px solid #24445D66",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "'Literata', Georgia, serif",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#8F672E",
  fontFamily: "'Philosopher', serif",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 4,
  display: "block",
};

const btnPrimary: React.CSSProperties = {
  background: "#442E17",
  color: "#e8d5b7",
  border: "1px solid #6A481C",
  borderRadius: 6,
  padding: "9px 16px",
  fontFamily: "'Philosopher', serif",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  ...btnPrimary,
  background: "transparent",
  border: `1px solid ${ACCENT}66`,
  color: "#b8a07a",
};

// ─── Campo (label + input) ────────────────────────────────────────────────────
function Field({
  label,
  value,
  onChange,
  hint,
  highlight,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  highlight?: boolean;
  placeholder?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>
        {label}
        {hint ? (
          <span style={{ color: ACCENT, fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 6 }}>
            {hint}
          </span>
        ) : null}
      </label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputStyle,
          border: highlight && !value ? `1px solid ${ACCENT}` : inputStyle.border,
          boxShadow: highlight && !value ? `0 0 0 2px ${ACCENT}22` : undefined,
        }}
      />
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function TirillasBot() {
  const [pedidoInput, setPedidoInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);

  const [tipo, setTipo] = useState<Tipo>("envio");
  const [pedido, setPedido] = useState("");
  const [dest, setDest] = useState<Destinatario>(DEST_VACIO);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const setCampo = useCallback(
    (k: keyof Destinatario, v: string) => setDest((d) => ({ ...d, [k]: v })),
    [],
  );

  // Libera el object URL anterior al cambiar/desmontar.
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  // ── Cargar pedido ──────────────────────────────────────────────────────────
  const cargar = useCallback(async (numArg?: string) => {
    const num = (numArg ?? pedidoInput).trim().replace(/^#/, "");
    if (!num) return;

    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tirillas?order=${encodeURIComponent(num)}`);
      const data = (await res.json().catch(() => null)) as PrefillResponse | null;

      if (!data || data.status === "not_found") {
        setError(`Pedido #${num} no encontrado.`);
        setCargado(false);
        return;
      }
      if (data.error) {
        setError(data.error);
        setCargado(false);
        return;
      }

      setTipo(data.tipo ?? "envio");
      setPedido(data.pedido ?? num);
      setDest({ ...DEST_VACIO, ...(data.destinatario ?? {}) });
      setCargado(true);
      setPdfUrl(null);
    } catch (e) {
      setError("Error de red cargando el pedido.");
      setCargado(false);
    } finally {
      setCargando(false);
    }
  }, [pedidoInput]);

  // Auto-cargar si llega ?order=N (desde el botón "Tirilla" en Pedidos).
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const o = searchParams.get("order");
    if (o) {
      setPedidoInput(o);
      cargar(o);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Generar vista previa ───────────────────────────────────────────────────
  const generar = useCallback(async () => {
    setGenerando(true);
    setError(null);
    try {
      const body =
        tipo === "pickup"
          ? { tipo, pedido, nombre: dest.nombre }
          : { tipo, pedido, destinatario: dest };

      const res = await fetch("/api/tirillas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || !ct.includes("application/pdf")) {
        const msg = ct.includes("application/json")
          ? ((await res.json().catch(() => null))?.error ?? "Error generando la tirilla.")
          : "Error generando la tirilla.";
        setError(msg);
        return;
      }

      const blob = await res.blob();
      // La URL anterior se libera en el cleanup del useEffect al cambiar pdfUrl.
      setPdfUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError("Error de red generando la tirilla.");
    } finally {
      setGenerando(false);
    }
  }, [tipo, pedido, dest]);

  const imprimir = useCallback(() => {
    iframeRef.current?.contentWindow?.focus();
    iframeRef.current?.contentWindow?.print();
  }, []);

  const descargar = useCallback(() => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = `tirilla_${tipo}_${pedido}.pdf`;
    a.click();
  }, [pdfUrl, tipo, pedido]);

  return (
    <div style={{ fontFamily: "'Literata', Georgia, serif", color: "#e8d5b7" }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: "'Philosopher', serif", fontSize: 22, fontWeight: 700, color: "#e8d5b7", margin: 0 }}>
          🏷️ Tirillas de Envío
        </h2>
        <p style={{ fontSize: 13, color: "#8F672E", marginTop: 4 }}>
          Escribe el número de pedido, revisa los datos y genera la etiqueta lista para imprimir.
        </p>
      </div>

      {/* Buscador */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18, maxWidth: 460 }}>
        <input
          value={pedidoInput}
          onChange={(e) => setPedidoInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && cargar()}
          placeholder="N° de pedido (ej. 1720)"
          style={{ ...inputStyle, fontSize: 15, padding: "10px 12px" }}
        />
        <button onClick={() => cargar()} disabled={cargando} style={{ ...btnPrimary, whiteSpace: "nowrap", opacity: cargando ? 0.6 : 1 }}>
          {cargando ? "Cargando…" : "Cargar"}
        </button>
      </div>

      {error && (
        <div style={{
          background: "#3a1a1a", border: "1px solid #7a3b3b", color: "#e8b7b7",
          borderRadius: 6, padding: "10px 14px", fontSize: 13, marginBottom: 16, maxWidth: 900,
        }}>
          {error}
        </div>
      )}

      {cargado && (
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Columna formulario */}
          <div style={{
            flex: "1 1 340px", minWidth: 320, maxWidth: 460,
            background: "#0E1D2B", border: `1px solid ${ACCENT}40`,
            borderTop: `3px solid ${ACCENT}`, borderRadius: 10, padding: 18,
          }}>
            {/* Toggle tipo */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {(["envio", "pickup"] as Tipo[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTipo(t); setPdfUrl(null); }}
                  style={{
                    ...btnGhost,
                    flex: 1,
                    background: tipo === t ? ACCENT : "transparent",
                    color: tipo === t ? "#0E151D" : "#b8a07a",
                    borderColor: tipo === t ? ACCENT : `${ACCENT}66`,
                    fontWeight: 700,
                  }}
                >
                  {t === "envio" ? "📦 Envío" : "🏬 Pickup"}
                </button>
              ))}
            </div>

            <Field label="N° de pedido" value={pedido} onChange={setPedido} />

            {tipo === "pickup" ? (
              <Field label="Nombre" value={dest.nombre} onChange={(v) => setCampo("nombre", v)} />
            ) : (
              <>
                <Field label="Nombre" value={dest.nombre} onChange={(v) => setCampo("nombre", v)} />
                <Field
                  label="Documento"
                  value={dest.documento}
                  onChange={(v) => setCampo("documento", v)}
                  hint="✍️ escríbelo (no viene del pedido)"
                  highlight
                  placeholder="C.C. 1234567890"
                />
                <Field label="Teléfono" value={dest.telefono} onChange={(v) => setCampo("telefono", v)} />
                <Field label="Dirección" value={dest.direccion} onChange={(v) => setCampo("direccion", v)} placeholder="Carrera 00 # 00-00" />
                <Field label="Interior / Apto / Conjunto" value={dest.complemento} onChange={(v) => setCampo("complemento", v)} />
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <Field label="Ciudad" value={dest.ciudad} onChange={(v) => setCampo("ciudad", v)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Field label="Departamento" value={dest.departamento} onChange={(v) => setCampo("departamento", v)} />
                  </div>
                </div>
              </>
            )}

            <button onClick={generar} disabled={generando} style={{ ...btnPrimary, width: "100%", marginTop: 6, opacity: generando ? 0.6 : 1 }}>
              {generando ? "Generando…" : pdfUrl ? "Actualizar vista previa" : "Generar vista previa"}
            </button>
          </div>

          {/* Columna vista previa */}
          <div style={{ flex: "2 1 380px", minWidth: 320 }}>
            <div style={{
              background: "#0E1D2B", border: `1px solid ${ACCENT}40`,
              borderRadius: 10, padding: 14, minHeight: 420,
              display: "flex", flexDirection: "column",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontFamily: "'Philosopher', serif", fontWeight: 700, fontSize: 14, color: "#e8d5b7" }}>
                  Vista previa
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={descargar} disabled={!pdfUrl} style={{ ...btnGhost, opacity: pdfUrl ? 1 : 0.4 }}>
                    ⬇ Descargar
                  </button>
                  <button onClick={imprimir} disabled={!pdfUrl} style={{ ...btnPrimary, opacity: pdfUrl ? 1 : 0.4 }}>
                    🖨 Imprimir
                  </button>
                </div>
              </div>

              {pdfUrl ? (
                <iframe
                  ref={iframeRef}
                  src={pdfUrl}
                  title="Tirilla"
                  style={{ width: "100%", height: 560, border: "1px solid #24445D40", borderRadius: 6, background: "#fff" }}
                />
              ) : (
                <div style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#8F672E", fontSize: 13, textAlign: "center", padding: 40,
                }}>
                  Genera la vista previa para ver la tirilla aquí.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
