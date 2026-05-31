import { useState } from "react";

export default function ConsultaCachePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  async function searchCache() {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResults(null);
    setSearched(false);
    try {
      const response = await fetch(`/api/cache?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("Error consultando cache");
      const data = await response.json();
      setResults(data);
      setSearched(true);
    } catch (err) {
      setError("No se pudo consultar cache");
    } finally {
      setLoading(false);
    }
  }

  const isObject = results && typeof results === "object" && !Array.isArray(results);
  const cleanResults = isObject
    ? Object.fromEntries(Object.entries(results).filter(([_, v]: any) => v && typeof v === "object"))
    : {};
  const hasResults = Object.keys(cleanResults).length > 0;

  return (
    <div style={{ fontFamily: "'Literata', Georgia, serif", color: "#e8d5b7" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Philosopher', serif", fontSize: 22, fontWeight: 700, color: "#e8d5b7", margin: 0 }}>
          Consultar Cache
        </h2>
        <p style={{ fontSize: 13, color: "#8F672E", marginTop: 4 }}>
          Busca por UUID o nombre parcial de carta
        </p>
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchCache()}
          placeholder="Ej: Mountain, Black Lotus, o UUID..."
          style={{
            flex: 1,
            padding: "10px 16px",
            background: "#0E1D2B",
            border: "1px solid #24445D",
            borderRadius: 8,
            color: "#e8d5b7",
            fontSize: 14,
            fontFamily: "'Literata', serif",
            outline: "none",
          }}
        />
        <button
          onClick={searchCache}
          disabled={loading || !query.trim()}
          style={{
            padding: "10px 24px",
            background: loading ? "#442E17" : "#8F672E",
            color: "#e8d5b7",
            border: "1px solid #6A481C",
            borderRadius: 8,
            fontFamily: "'Philosopher', serif",
            fontWeight: 700,
            fontSize: 14,
            cursor: loading || !query.trim() ? "not-allowed" : "pointer",
            opacity: !query.trim() ? 0.5 : 1,
            transition: "all 0.2s",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#2a0e0e", border: "1px solid #7f1d1d", color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Sin resultados */}
      {searched && !hasResults && !loading && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <p style={{ color: "#8F672E", fontSize: 14 }}>
            No se encontraron resultados para <strong>"{query}"</strong>
          </p>
        </div>
      )}

      {/* Resultados */}
      {hasResults && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 13, color: "#8F672E", margin: 0 }}>
            <strong style={{ color: "#e8d5b7" }}>{Object.keys(cleanResults).length}</strong> resultado{Object.keys(cleanResults).length !== 1 ? "s" : ""} para "{query}"
          </p>

          {Object.entries(cleanResults).map(([uuid, finishings]: any) => (
            <div
              key={uuid}
              style={{
                background: "#0E1D2B",
                border: "1px solid #24445D40",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {/* UUID header */}
              <div style={{
                padding: "10px 16px",
                background: "#0E151D",
                borderBottom: "1px solid #24445D40",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#8F672E", textTransform: "uppercase", letterSpacing: 1 }}>UUID</span>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#b8a07a", wordBreak: "break-all" }}>{uuid}</span>
              </div>

              {/* Finishings */}
              {Object.entries(finishings || {}).map(([finishing, data]: any, i) => (
                <div
                  key={finishing}
                  style={{
                    padding: 16,
                    borderTop: i > 0 ? "1px solid #24445D30" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 10px",
                      borderRadius: 20,
                      background: finishing === "Foil" ? "#6A481C40" : "#122F4340",
                      color: finishing === "Foil" ? "#fdba74" : "#b8d4e8",
                      border: `1px solid ${finishing === "Foil" ? "#6A481C" : "#24445D"}`,
                    }}>
                      {finishing}
                    </span>
                    {data?.titulo && (
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#e8d5b7", fontFamily: "'Philosopher', serif" }}>
                        {data.titulo}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      { label: "URL SCG", value: data?.url, isLink: true },
                      { label: "Comentario", value: data?.comentario },
                      { label: "Creado", value: data?.created_at, mono: true },
                      { label: "Último uso", value: data?.ultima_vez_usado, mono: true },
                    ].map(({ label, value, isLink, mono }) => (
                      <div key={label}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#8F672E", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>
                          {label}
                        </p>
                        {isLink && value ? (
                          <a href={value} target="_blank" rel="noreferrer"
                            style={{ color: "#24445D", fontSize: 12, textDecoration: "underline", wordBreak: "break-all" }}>
                            Ver en tienda →
                          </a>
                        ) : (
                          <p style={{ fontSize: 13, color: value ? "#e8d5b7" : "#442E17", fontFamily: mono ? "monospace" : "inherit", margin: 0 }}>
                            {value || "—"}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Initial state */}
      {!searched && !loading && !error && (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🗃️</div>
          <p style={{ color: "#8F672E", fontSize: 14 }}>
            Introduce un término de búsqueda para consultar el cache
          </p>
        </div>
      )}
    </div>
  );
}