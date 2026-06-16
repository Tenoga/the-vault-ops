import { useState } from "react";

const FINISHINGS = ["Foil", "Non-Foil"];

export default function RegistroCachePage() {
  const [uuid, setUuid] = useState("");
  const [finishing, setFinishing] = useState("Foil");
  const [titulo, setTitulo] = useState("");
  const [url, setUrl] = useState("");
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [cacheStatus, setCacheStatus] = useState<"created" | "updated" | "error" | null>(null);

  async function handleSubmit() {
    if (!uuid || !finishing || !url || !titulo) {
      setCacheStatus("error");
      setMessage("Faltan campos requeridos: UUID, Título y URL son obligatorios");
      return;
    }

    setLoading(true);
    setMessage("");
    setCacheStatus(null);

    try {
      const response = await fetch("/api/cache/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, finishing, url, titulo, comentario }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Error registrando");

      if (data.created) {
        setCacheStatus("created");
        setMessage("Cache creado correctamente");
      } else if (data.updated) {
        setCacheStatus("updated");
        setMessage("Cache actualizado correctamente");
      } else {
        setCacheStatus("updated");
        setMessage("Operación completada");
      }

      setUuid("");
      setUrl("");
      setTitulo("");
      setComentario("");
    } catch (err) {
      console.error(err);
      setCacheStatus("error");
      setMessage("Error al registrar cache");
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
    transition: "border-color 0.2s",
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
          Registrar / Actualizar Cache
        </h2>
        <p style={{ fontSize: 13, color: "#8F672E", marginTop: 4 }}>
          Crea una nueva entrada o actualiza una existente por UUID y finishing
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
          background: cacheStatus === "error" ? "#2a0e0e" : "#1a1206",
          border: `1px solid ${cacheStatus === "error" ? "#7f1d1d" : "#8F672E"}`,
          color: cacheStatus === "error" ? "#fca5a5" : "#B08343",
          fontFamily: "'Philosopher', serif",
        }}>
          {cacheStatus === "created" ? "🆕 " : cacheStatus === "updated" ? "✓ " : cacheStatus === "error" ? "⚠️ " : ""}
          {message}
        </div>
      )}

      {/* Formulario */}
      <div style={{
        background: "#0E1D2B",
        border: "1px solid #24445D40",
        borderRadius: 12,
        padding: 28
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* UUID */}
          <div>
            <label style={labelStyle}>UUID <span style={{ color: "#fca5a5" }}>*</span></label>
            <input
              value={uuid}
              onChange={(e) => setUuid(e.target.value)}
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
                  onClick={() => setFinishing(f)}
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
                  {f === "Foil" ? "✨ Foil" : "🃏 Non-Foil"}
                </button>
              ))}
            </div>
          </div>

          {/* Título */}
          <div>
            <label style={labelStyle}>Título <span style={{ color: "#fca5a5" }}>*</span></label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Nombre de la carta"
              style={inputStyle}
            />
          </div>

          {/* URL */}
          <div>
            <label style={labelStyle}>URL SCG <span style={{ color: "#fca5a5" }}>*</span></label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              style={inputStyle}
            />
          </div>

          {/* Comentario */}
          <div>
            <label style={labelStyle}>Comentario <span style={{ color: "#442E17" }}>(opcional)</span></label>
            <input
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Notas adicionales..."
              style={inputStyle}
            />
          </div>

          {/* Separador */}
          <div style={{ height: 1, background: "#24445D40" }} />

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 0",
              background: loading ? "#442E17" : "#8F672E",
              color: "#e8d5b7",
              border: "1px solid #6A481C",
              borderRadius: 8,
              fontFamily: "'Philosopher', serif",
              fontWeight: 700,
              fontSize: 15,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "all 0.2s",
              letterSpacing: 0.5,
            }}
          >
            {loading ? "Registrando..." : "Registrar en Cache"}
          </button>

          <p style={{ fontSize: 11, color: "#442E17", textAlign: "center", margin: 0 }}>
            Los campos marcados con <span style={{ color: "#fca5a5" }}>*</span> son obligatorios
          </p>
        </div>
      </div>
    </div>
  );
}