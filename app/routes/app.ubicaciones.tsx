import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import {
  ABC,
  COLOR_OPCIONES,
  COLOR_LABEL,
  contextoLabel,
  cajaEtiqueta,
  costeTexto,
  validarUbicaciones,
  type Ubicacion,
} from "../lib/ubicaciones";

// ─── Paleta de marca ──────────────────────────────────────────────────────────
// #442E17 #0E1D2B #6A481C #122F43 #8F672E #24445D #0E151D #B08343 #5C84A0

type Row = Ubicacion & { key: string };

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function toRows(items: Ubicacion[]): Row[] {
  return items.map((u) => ({ ...u, key: uid() }));
}

// Extrae una lista de proveedores de la respuesta (forma defensiva: la API puede
// devolver un array, {proveedores:[...]} o {data:[...]}).
function extraerProveedores(data: unknown): string[] {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.proveedores)
      ? (data as any).proveedores
      : Array.isArray((data as any)?.data)
        ? (data as any).data
        : [];
  return arr
    .map((p: any) => (typeof p === "string" ? p : p?.nombre ?? p?.proveedor ?? ""))
    .filter((s: string) => s && s.trim())
    .sort((a: string, b: string) => a.localeCompare(b, "es"));
}

// Primera letra libre (para el valor por defecto de una caja nueva) dentro de un
// conjunto de cajas ya ordenado por letraDesde.
function primeraLetraLibre(cajas: Row[]): string {
  let esperado = "A";
  const ordenadas = [...cajas].sort((a, b) =>
    (a.letraDesde || "").localeCompare(b.letraDesde || ""),
  );
  for (const c of ordenadas) {
    const d = (c.letraDesde || "").toUpperCase();
    const h = (c.letraHasta || "").toUpperCase();
    if (!/^[A-Z]$/.test(d) || !/^[A-Z]$/.test(h)) continue;
    if (d > esperado) break; // hay hueco antes
    if (h.charCodeAt(0) + 1 > esperado.charCodeAt(0)) {
      esperado = String.fromCharCode(h.charCodeAt(0) + 1);
    }
  }
  return esperado > "Z" ? "Z" : esperado;
}

// ─── Estilos reutilizables ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "#0E151D",
  border: "1px solid #24445D",
  borderRadius: 8,
  color: "#e8d5b7",
  fontSize: 14,
  outline: "none",
  fontFamily: "'Literata', serif",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#5C84A0",
  textTransform: "uppercase",
  letterSpacing: 1.2,
  fontFamily: "'Philosopher', serif",
  marginBottom: 5,
  display: "block",
};

// ─── Página ─────────────────────────────────────────────────────────────────────

export default function UbicacionesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [proveedores, setProveedores] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Contexto activo
  const [ctxProveedor, setCtxProveedor] = useState("");
  const [ctxColor, setCtxColor] = useState("W");
  const [ctxCmc, setCtxCmc] = useState(1);
  const [ctxCmcOrMas, setCtxCmcOrMas] = useState(false);
  // "Cualquier coste" = proveedor organizado solo por color (una caja para todo
  // el color, sin separar por coste). Internamente se guarda como coste 0 + "y
  // superiores" (que equivale a todos los costes).
  const [ctxCualquierCoste, setCtxCualquierCoste] = useState(false);

  // Valores efectivos del contexto (aplican el modo "cualquier coste").
  const efCmc = ctxCualquierCoste ? 0 : ctxCmc;
  const efCmcOrMas = ctxCualquierCoste ? true : ctxCmcOrMas;

  // ── Carga inicial ──────────────────────────────────────────────────────────
  // Se separan a propósito los dos orígenes: nuestra propia BD (rápida) carga la
  // página; la lista de proveedores viene del BACKEND y puede estar lenta o
  // colgada (p. ej. durante un cargue de inventario). Esa segunda llamada NO debe
  // bloquear la página, así que va aparte, en segundo plano y con timeout; si
  // falla, el proveedor se puede escribir a mano.
  useEffect(() => {
    // 1) Datos propios → cargan la página.
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/ubicaciones");
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
        setRows(toRows(data?.ubicaciones ?? []));
      } catch (e: any) {
        setError(e?.message ?? "No se pudo cargar la configuración");
      } finally {
        setLoading(false);
      }
    })();

    // 2) Proveedores (solo para el autocompletado) → en segundo plano, no bloquea.
    (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch("/api/inventario/proveedores", { signal: ctrl.signal });
        if (res.ok) {
          const provs = extraerProveedores(await res.json());
          setProveedores(provs);
          setCtxProveedor((prev) => prev || provs[0] || "");
        }
      } catch {
        /* backend lento/ocupado: se ignora; el proveedor se escribe a mano */
      } finally {
        clearTimeout(timer);
      }
    })();
  }, []);

  // ── Filas del contexto activo ────────────────────────────────────────────────
  const currentRows = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            r.proveedor === ctxProveedor &&
            r.color === ctxColor &&
            r.cmc === efCmc &&
            r.cmcOrMas === efCmcOrMas,
        )
        .sort((a, b) => (a.letraDesde || "").localeCompare(b.letraDesde || "")),
    [rows, ctxProveedor, ctxColor, efCmc, efCmcOrMas],
  );

  // ── Validación global (en vivo) ──────────────────────────────────────────────
  const validacion = useMemo(() => validarUbicaciones(rows), [rows]);

  const grupoActual = validacion.grupos.find(
    (g) =>
      g.proveedor === ctxProveedor &&
      g.color === ctxColor &&
      g.cmc === efCmc &&
      g.cmcOrMas === efCmcOrMas,
  );

  // ── Mutaciones ───────────────────────────────────────────────────────────────
  const marcarSucio = useCallback(() => {
    setSuccessMsg(null);
    setError(null);
  }, []);

  const addBox = useCallback(() => {
    if (!ctxProveedor) {
      setError("Elige o escribe un proveedor primero.");
      return;
    }
    marcarSucio();
    const desde = primeraLetraLibre(currentRows);
    setRows((prev) => [
      ...prev,
      {
        key: uid(),
        proveedor: ctxProveedor,
        color: ctxColor,
        cmc: efCmc,
        cmcOrMas: efCmcOrMas,
        letraDesde: desde,
        letraHasta: "Z",
        nombre: "",
      },
    ]);
  }, [ctxProveedor, ctxColor, efCmc, efCmcOrMas, currentRows, marcarSucio]);

  const updateRow = useCallback(
    (key: string, patch: Partial<Row>) => {
      marcarSucio();
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    },
    [marcarSucio],
  );

  const deleteRow = useCallback(
    (key: string) => {
      marcarSucio();
      setRows((prev) => prev.filter((r) => r.key !== key));
    },
    [marcarSucio],
  );

  // ── Guardar ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!validacion.ok) {
      setError("Corrige los contextos marcados en rojo antes de guardar.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const payload: Ubicacion[] = rows.map(({ key, id, ...u }) => u);
      const res = await fetch("/api/ubicaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ubicaciones: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
      setRows(toRows(data.ubicaciones ?? []));
      setSuccessMsg("✓ Mapa de cajas guardado");
    } catch (e: any) {
      setError(e?.message ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }, [rows, validacion.ok]);

  // Contextos configurados (para el resumen de la derecha)
  const contextos = validacion.grupos;
  const contextosIncompletos = contextos.filter((g) => !g.ok).length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0E151D",
        fontFamily: "'Literata', Georgia, serif",
        color: "#e8d5b7",
        padding: "24px 28px",
      }}
    >
      <div style={{ maxWidth: 1060, margin: "0 auto" }}>
        {/* Encabezado */}
        <div style={{ marginBottom: 8 }}>
          <Link
            to="/app/pedidos"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#5C84A0",
              textDecoration: "none",
              fontFamily: "'Philosopher', serif",
              marginBottom: 8,
            }}
          >
            ← Volver a Pedidos
          </Link>
          <h1
            style={{
              fontFamily: "'Nova Cut', cursive",
              fontSize: 30,
              color: "#B08343",
              margin: 0,
              letterSpacing: 2,
            }}
          >
            Mapa de cajas
          </h1>
          <p style={{ fontSize: 13, color: "#5C84A0", marginTop: 6, maxWidth: 720 }}>
            Define dónde está archivada cada carta. Elige un{" "}
            <strong style={{ color: "#8F672E" }}>proveedor · color · coste</strong>{" "}
            y reparte las letras en cajas. En cada caja escribe{" "}
            <strong style={{ color: "#8F672E" }}>solo el número</strong>; la
            descripción (proveedor · color · coste · rango) se arma sola. La vista
            de pedidos mostrará la caja de cada carta automáticamente.
          </p>
        </div>

        {/* Alertas */}
        {(error || successMsg) && (
          <div style={{ margin: "12px 0" }}>
            {error && (
              <div
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  background: "#2a0e0e",
                  border: "1px solid #7f1d1d",
                  color: "#fca5a5",
                  fontSize: 13,
                }}
              >
                ⚠️ {error}
              </div>
            )}
            {successMsg && (
              <div
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  background: "#1a1206",
                  border: "1px solid #8F672E",
                  color: "#B08343",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'Philosopher', serif",
                }}
              >
                {successMsg}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <p style={{ color: "#5C84A0", fontSize: 14, marginTop: 24 }}>
            Cargando configuración…
          </p>
        ) : (
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* ── Editor de contexto ── */}
            <div style={{ flex: "1 1 560px", minWidth: 0 }}>
              {/* Selectores de contexto */}
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  flexWrap: "wrap",
                  alignItems: "flex-end",
                  padding: "16px 18px",
                  borderRadius: 12,
                  background: "#0E1D2B",
                  border: "1px solid #24445D50",
                }}
              >
                <div style={{ flex: "1 1 180px" }}>
                  <label style={labelStyle}>Proveedor</label>
                  <input
                    list="proveedores-list"
                    value={ctxProveedor}
                    onChange={(e) => setCtxProveedor(e.target.value)}
                    placeholder="The Vault"
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                  />
                  <datalist id="proveedores-list">
                    {proveedores.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>

                <div style={{ flex: "0 1 150px" }}>
                  <label style={labelStyle}>Color</label>
                  <select
                    value={ctxColor}
                    onChange={(e) => setCtxColor(e.target.value)}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                  >
                    {COLOR_OPCIONES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: "0 0 84px", opacity: ctxCualquierCoste ? 0.4 : 1 }}>
                  <label style={labelStyle}>Coste (CMC)</label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={ctxCmc}
                    disabled={ctxCualquierCoste}
                    onChange={(e) => setCtxCmc(Math.max(0, parseInt(e.target.value || "0", 10)))}
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                  />
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#5C84A0",
                    cursor: ctxCualquierCoste ? "not-allowed" : "pointer",
                    paddingBottom: 8,
                    fontFamily: "'Philosopher', serif",
                    opacity: ctxCualquierCoste ? 0.4 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={ctxCmcOrMas}
                    disabled={ctxCualquierCoste}
                    onChange={(e) => setCtxCmcOrMas(e.target.checked)}
                  />
                  y superiores ({ctxCmc}+)
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: ctxCualquierCoste ? "#a9ecf5" : "#5C84A0",
                    cursor: "pointer",
                    paddingBottom: 8,
                    fontFamily: "'Philosopher', serif",
                  }}
                  title="Para proveedores organizados solo por color: una caja cubre todo el color, sin separar por coste."
                >
                  <input
                    type="checkbox"
                    checked={ctxCualquierCoste}
                    onChange={(e) => setCtxCualquierCoste(e.target.checked)}
                  />
                  Cualquier coste (solo por color)
                </label>
              </div>

              {/* Cajas del contexto */}
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Philosopher', serif",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#B08343",
                      textTransform: "uppercase",
                      letterSpacing: 1.2,
                    }}
                  >
                    Cajas de {ctxProveedor || "—"} · {COLOR_LABEL[ctxColor]} ·{" "}
                    {costeTexto(efCmc, efCmcOrMas)}
                  </span>
                  <div style={{ flex: 1, height: 1, background: "#24445D40" }} />
                  {/* Estado de cobertura del contexto */}
                  {currentRows.length > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 10px",
                        borderRadius: 20,
                        fontFamily: "'Philosopher', serif",
                        background: grupoActual?.ok ? "#0a1f0a" : "#2a0e0e",
                        color: grupoActual?.ok ? "#39FF14" : "#fca5a5",
                        border: `1px solid ${grupoActual?.ok ? "#39FF1460" : "#7f1d1d"}`,
                      }}
                    >
                      {grupoActual?.ok ? "✓ Cubre A–Z" : grupoActual?.mensaje ?? "Incompleto"}
                    </span>
                  )}
                </div>

                {currentRows.length === 0 ? (
                  <p style={{ color: "#5C84A0", fontSize: 13, fontStyle: "italic" }}>
                    Este contexto aún no tiene cajas. Añade la primera →
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {currentRows.map((r) => (
                      <div
                        key={r.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 10,
                          background: "#0E1D2B",
                          border: "1px solid #24445D50",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontSize: 12, color: "#5C84A0", fontFamily: "'Philosopher', serif" }}>Letras</span>
                        <select
                          value={r.letraDesde}
                          onChange={(e) => updateRow(r.key, { letraDesde: e.target.value })}
                          style={{ ...inputStyle, padding: "6px 8px" }}
                        >
                          {ABC.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <span style={{ color: "#5C84A0" }}>–</span>
                        <select
                          value={r.letraHasta}
                          onChange={(e) => updateRow(r.key, { letraHasta: e.target.value })}
                          style={{ ...inputStyle, padding: "6px 8px" }}
                        >
                          {ABC.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>

                        <span style={{ fontSize: 12, color: "#5C84A0", fontFamily: "'Philosopher', serif", marginLeft: 6 }}>Nº caja</span>
                        <input
                          value={r.nombre}
                          onChange={(e) => updateRow(r.key, { nombre: e.target.value })}
                          placeholder="ej. 2"
                          style={{
                            ...inputStyle,
                            flex: "0 1 90px",
                            minWidth: 70,
                            borderColor: r.nombre.trim() ? "#24445D" : "#7f1d1d",
                          }}
                        />

                        <button
                          onClick={() => deleteRow(r.key)}
                          title="Eliminar caja"
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            flexShrink: 0,
                            background: "#122F43",
                            border: "1px solid #24445D",
                            color: "#fca5a5",
                            fontSize: 15,
                            cursor: "pointer",
                          }}
                        >
                          🗑
                        </button>

                        {/* Etiqueta auto-generada: lo que representa la caja. No se
                            teclea; sale de proveedor·color·coste·rango. */}
                        <span style={{
                          flexBasis: "100%",
                          fontSize: 11,
                          color: "#5C84A0",
                          fontFamily: "'Literata', serif",
                          marginTop: 2,
                        }}>
                          {r.nombre.trim() ? `📦 ${r.nombre.trim()} · ` : ""}{cajaEtiqueta(r)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={addBox}
                  style={{
                    marginTop: 12,
                    padding: "8px 16px",
                    background: "#122F43",
                    color: "#B08343",
                    border: "1px dashed #8F672E",
                    borderRadius: 8,
                    fontFamily: "'Philosopher', serif",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  + Añadir caja
                </button>
              </div>
            </div>

            {/* ── Resumen de contextos ── */}
            <aside
              style={{
                flex: "0 1 300px",
                minWidth: 260,
                padding: "16px 18px",
                borderRadius: 12,
                background: "#0E1D2B",
                border: "1px solid #24445D50",
                position: "sticky",
                top: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Philosopher', serif",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#5C84A0",
                    textTransform: "uppercase",
                    letterSpacing: 1.2,
                  }}
                >
                  Contextos configurados
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#5C84A0",
                    background: "#122F43",
                    border: "1px solid #24445D",
                    borderRadius: 20,
                    padding: "1px 8px",
                    fontFamily: "monospace",
                  }}
                >
                  {contextos.length}
                </span>
              </div>

              {contextos.length === 0 ? (
                <p style={{ fontSize: 12, color: "#5C84A0", fontStyle: "italic" }}>
                  Todavía no hay cajas. Empieza eligiendo un contexto y añadiendo
                  cajas.
                </p>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 380, overflowY: "auto" }}
                >
                  {contextos.map((g) => {
                    const esCualquierCoste = g.cmc === 0 && g.cmcOrMas;
                    const activo =
                      g.proveedor === ctxProveedor &&
                      g.color === ctxColor &&
                      g.cmc === efCmc &&
                      g.cmcOrMas === efCmcOrMas;
                    return (
                      <button
                        key={`${g.proveedor}|${g.color}|${g.cmc}|${g.cmcOrMas}`}
                        onClick={() => {
                          setCtxProveedor(g.proveedor);
                          setCtxColor(g.color);
                          setCtxCualquierCoste(esCualquierCoste);
                          if (!esCualquierCoste) {
                            setCtxCmc(g.cmc);
                            setCtxCmcOrMas(g.cmcOrMas);
                          }
                        }}
                        style={{
                          textAlign: "left",
                          cursor: "pointer",
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: activo ? "#122438" : "#0E151D",
                          border: `1px solid ${activo ? "#8F672E" : "#24445D50"}`,
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: "#e8d5b7",
                            fontFamily: "'Literata', serif",
                          }}
                        >
                          {contextoLabel(g)}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: g.ok ? "#39FF14" : "#fca5a5",
                            fontFamily: "'Philosopher', serif",
                          }}
                        >
                          {g.ok ? "✓ Cubre A–Z" : `⚠️ ${g.mensaje}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Errores de fila (campos vacíos) */}
              {validacion.errores.length > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "#2a0e0e",
                    border: "1px solid #7f1d1d",
                  }}
                >
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#fca5a5",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      margin: "0 0 4px",
                      fontFamily: "'Philosopher', serif",
                    }}
                  >
                    Por corregir
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {validacion.errores.slice(0, 6).map((e, i) => (
                      <li key={i} style={{ fontSize: 11, color: "#fca5a5" }}>
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ height: 1, background: "#24445D40", margin: "14px 0" }} />

              <button
                onClick={handleSave}
                disabled={saving || !validacion.ok}
                style={{
                  width: "100%",
                  padding: "10px 0",
                  background: saving || !validacion.ok ? "#122F43" : "#8F672E",
                  color: saving || !validacion.ok ? "#5C84A0" : "#e8d5b7",
                  border: `1px solid ${!validacion.ok ? "#374151" : "#6A481C"}`,
                  borderRadius: 8,
                  fontFamily: "'Philosopher', serif",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: saving || !validacion.ok ? "not-allowed" : "pointer",
                }}
              >
                {saving
                  ? "Guardando…"
                  : !validacion.ok
                    ? contextosIncompletos > 0
                      ? `${contextosIncompletos} contexto(s) por completar`
                      : "Corrige los errores"
                    : "💾 Guardar mapa de cajas"}
              </button>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
