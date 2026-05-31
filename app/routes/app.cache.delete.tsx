import { useState } from "react";

const FINISHINGS = ["Foil", "Non-Foil"];

export default function DeleteCachePage() {
  const [uuid, setUuid] = useState("");
  const [finishing, setFinishing] = useState("Foil");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"deleted" | "error" | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function handleDelete() {
    if (!uuid || !finishing) {
      setStatus("error");
      setMessage("UUID y finishing son requeridos");
      return;
    }
    if (!confirmed) {
      setStatus("error");
      setMessage("Debes confirmar que deseas eliminar esta entrada");
      return;
    }

    setLoading(true);
    setMessage("");
    setStatus(null);

    try {
      const response = await fetch("/api/cache/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, finishing }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Error eliminando cache");

      setStatus("deleted");
      setMessage("Cache eliminado correctamente");
      setUuid("");
      setConfirmed(false);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage("Error al eliminar cache");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    background: "#0E151D",
    border: "1px solid #24445D",
    borderRadius: 8,
    color: "#e8d5b7",
    fontSize: 14,
    fontFamily: "'Literata', Georgia, serif",
    outline: "none",
    boxSizing: "border-box" as const,
  };

  const labelStyle = {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: "#8F672E",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 6,
    fontFamily: "'Philosopher', serif",
  };

  return (
    <div style={{
      fontFamily: "'Literata', Georgia, serif",
      color: "#e8d5b7",
      maxWidth: 680,
      margin: "0 auto",
    }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Philosopher', serif", fontSize: 22, fontWeight: 700, color: "#e8d5b7", margin: 0 }}>
          Eliminar Cache
        </h2>
        <p style={{ fontSize: 13, color: "#8F672E", marginTop: 4 }}>
          Elimina una entrada del cache por UUID y finishing
        </p>
      </div>

      {/* Feedback */}
      {message && (
        <div style={{
          padding: "12px 16px",
          borderRadius: 8,
          marginBottom: 24,
          fontSize: 13,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: status === "deleted" ? "#0a2a1a" : "#2a0e0e",
          border: `1px solid ${status === "deleted" ? "#166534" : "#7f1d1d"}`,
          color: status === "deleted" ? "#86efac" : "#fca5a5",
        }}>
          {status === "deleted" ? "🗑️" : "⚠️"} {message}
        </div>
      )}

      {/* Formulario */}
      <div style={{
        background: "#0E1D2B",
        border: "1px solid #7f1d1d40",
        borderRadius: 12,
        padding: 28,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* UUID */}
          <div>
            <label style={labelStyle}>UUID <span style={{ color: "#fca5a5" }}>*</span></label>
            <input
              value={uuid}
              onChange={(e) => { setUuid(e.target.value); setConfirmed(false); }}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13 }}
            />
          </div>

          {/* Finishing */}
          <div>
            <label style={labelStyle}>Finishing <span style={{ color: "#fca5a5" }}>*</span></label>
            <div style={{ display: "flex", gap: 8 }}>
              {FINISHINGS.map((f) => (
                <button
                  key={f}
                  onClick={() => { setFinishing(f); setConfirmed(false); }}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 8,
                    border: `1px solid ${finishing === f ? "#8F672E" : "#24445D"}`,
                    background: finishing === f ? "#442E17" : "#0E151D",
                    color: finishing === f ? "#e8d5b7" : "#8F672E",
                    fontFamily: "'Philosopher', serif",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {f === "Foil" ? "✨ Foil" : "◻ Non-Foil"}
                </button>
              ))}
            </div>
          </div>

          {/* Separador */}
          <div style={{ height: 1, background: "#7f1d1d40" }} />

          {/* Confirmación */}
          <div style={{
            background: "#1a0a0a",
            border: "1px solid #7f1d1d60",
            borderRadius: 8,
            padding: "14px 16px",
          }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                style={{ marginTop: 2, accentColor: "#8F672E", width: 15, height: 15, cursor: "pointer" }}
              />
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#fca5a5", margin: 0 }}>
                  Confirmo que deseo eliminar esta entrada
                </p>
                <p style={{ fontSize: 12, color: "#8F672E", margin: "3px 0 0" }}>
                  Esta acción no se puede deshacer. El UUID y finishing seleccionados serán eliminados permanentemente del cache.
                </p>
              </div>
            </label>
          </div>

          {/* Botón */}
          <button
            onClick={handleDelete}
            disabled={loading || !confirmed || !uuid.trim()}
            style={{
              width: "100%",
              padding: "12px 0",
              background: loading || !confirmed || !uuid.trim() ? "#1a0a0a" : "#7f1d1d",
              color: loading || !confirmed || !uuid.trim() ? "#442E17" : "#fca5a5",
              border: "1px solid #7f1d1d",
              borderRadius: 8,
              fontFamily: "'Philosopher', serif",
              fontWeight: 700,
              fontSize: 15,
              cursor: loading || !confirmed || !uuid.trim() ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              letterSpacing: 0.5,
            }}
          >
            {loading ? "Eliminando..." : "🗑️ Eliminar del Cache"}
          </button>

          <p style={{ fontSize: 11, color: "#442E17", textAlign: "center", margin: 0 }}>
            El botón se activa solo cuando el UUID está ingresado y la acción es confirmada
          </p>
        </div>
      </div>
    </div>
  );
}