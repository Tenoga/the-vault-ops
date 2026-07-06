import { useEffect, useState } from "react";

type Pendiente = {
  uuid: string;
  finishing: string;
  titulo: string;
  comentario?: string;
  origen?: string | null;
  urls_intentadas: string[];
  ultima_vez_usado?: string;
};

const LOGO_FALLBACK = "https://cdn.shopify.com/s/files/1/0710/0029/3568/files/TheVault.jpg?v=1757364051";

const ORIGEN_META: Record<string, { nombre: string; emoji: string; accent: string }> = {
  botPrecios: { nombre: "The Vault", emoji: "⚜️", accent: "#e8d5b7" },
  BotPirataDraco: { nombre: "Draco", emoji: "🐲", accent: "#FF8A5C" },
  BotPirataRohan: { nombre: "Rohan", emoji: "📚", accent: "#93c5fd" },
  BotPirataTopCard: { nombre: "TopCard", emoji: "🐘", accent: "#B08343" },
  BotPirataElBulk: { nombre: "ElBulk", emoji: "🗑️", accent: "#9CA3AF" },
};

const SIN_ORIGEN = { nombre: "Sin origen", emoji: "❔", accent: "#5C84A0" };

function metaOrigen(origen?: string | null) {
  return (origen && ORIGEN_META[origen]) || SIN_ORIGEN;
}

// Imagen desde el CDN de Scryfall (patrón estable /normal/front/a/b/uuid.jpg).
// No pega a la API, solo al CDN; lazy para no cargar 1000+ de golpe.
function imagenDe(uuid: string) {
  return `https://cards.scryfall.io/normal/front/${uuid[0]}/${uuid[1]}/${uuid}.jpg`;
}

const PAGE = 60;

export default function PendientesCachePage() {
  const [items, setItems] = useState<Pendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("");
  const [origenSel, setOrigenSel] = useState<string>("todos");
  const [visibles, setVisibles] = useState(PAGE);
  const [mensaje, setMensaje] = useState("");

  const keyDe = (p: Pendiente) => `${p.uuid}|${p.finishing}`;

  async function cargar() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/cache/no-encontradas");
      if (!res.ok) throw new Error("Error cargando pendientes");
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      console.error(e);
      setError("No se pudo cargar la lista de pendientes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function quitarDeLista(k: string) {
    setItems((arr) => arr.filter((x) => keyDe(x) !== k));
  }

  // Conteo por origen (para los chips)
  const conteos: Record<string, number> = {};
  for (const p of items) {
    const og = p.origen && ORIGEN_META[p.origen] ? p.origen : "sin";
    conteos[og] = (conteos[og] || 0) + 1;
  }

  const filtrados = items.filter((p) => {
    if (origenSel !== "todos") {
      const og = p.origen && ORIGEN_META[p.origen] ? p.origen : "sin";
      if (og !== origenSel) return false;
    }
    if (filtro && !(p.titulo || "").toLowerCase().includes(filtro.toLowerCase())) return false;
    return true;
  });

  const chipsOrigen: { key: string; label: string; accent: string; n: number }[] = [
    { key: "todos", label: "🃏 Todos", accent: "#B08343", n: items.length },
    ...Object.entries(ORIGEN_META)
      .filter(([k]) => conteos[k])
      .map(([k, m]) => ({ key: k, label: `${m.emoji} ${m.nombre}`, accent: m.accent, n: conteos[k] })),
    ...(conteos["sin"] ? [{ key: "sin", label: `${SIN_ORIGEN.emoji} Sin origen`, accent: SIN_ORIGEN.accent, n: conteos["sin"] }] : []),
  ];

  return (
    <div style={{ fontFamily: "'Literata', Georgia, serif", color: "#e8d5b7" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: "'Philosopher', serif", fontSize: 22, fontWeight: 700, margin: 0 }}>
          Pendientes · No encontradas en SCG
        </h2>
        <p style={{ fontSize: 13, color: "#8F672E", marginTop: 4 }}>
          Cartas que los bots no lograron matchear. Busca la carta en SCG, pega la URL del
          producto y regístrala: entra al cache manual y sale de esta lista.
        </p>
      </div>

      {/* Feedback */}
      {mensaje && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13,
          fontWeight: 600, fontFamily: "'Philosopher', serif",
          background: mensaje.startsWith("⚠️") ? "#2a0e0e" : "#1a1206",
          border: `1px solid ${mensaje.startsWith("⚠️") ? "#7f1d1d" : "#8F672E"}`,
          color: mensaje.startsWith("⚠️") ? "#fca5a5" : "#B08343",
        }}>
          {mensaje}
        </div>
      )}

      {/* Chips de origen */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {chipsOrigen.map((c) => {
          const activo = origenSel === c.key;
          return (
            <button
              key={c.key}
              onClick={() => { setOrigenSel(c.key); setVisibles(PAGE); }}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 700,
                fontFamily: "'Philosopher', serif", cursor: "pointer", transition: "all 0.15s",
                background: activo ? "#442E17" : "#0E1D2B",
                border: `1px solid ${activo ? c.accent : "#24445D"}`,
                color: activo ? "#e8d5b7" : c.accent,
              }}
            >
              {c.label} <span style={{ opacity: 0.8 }}>({c.n})</span>
            </button>
          );
        })}
      </div>

      {/* Filtro + recargar */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <input
          value={filtro}
          onChange={(e) => { setFiltro(e.target.value); setVisibles(PAGE); }}
          placeholder="Filtrar por nombre..."
          style={{
            flex: 1, padding: "8px 12px", background: "#0E151D",
            border: "1px solid #24445D", borderRadius: 8, color: "#e8d5b7",
            fontSize: 13, fontFamily: "'Literata', Georgia, serif", outline: "none",
          }}
        />
        <button
          onClick={cargar}
          disabled={loading}
          style={{
            padding: "8px 16px", background: "#0E1D2B", color: "#8F672E",
            border: "1px solid #24445D", borderRadius: 8, cursor: "pointer",
            fontFamily: "'Philosopher', serif", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
          }}
        >
          {loading ? "Cargando..." : "↻ Recargar"}
        </button>
      </div>

      {error && <p style={{ color: "#fca5a5", fontSize: 13 }}>{error}</p>}
      {!loading && !error && filtrados.length === 0 && (
        <p style={{ color: "#8F672E", fontSize: 14, textAlign: "center", padding: 40 }}>
          {items.length === 0 ? "🎉 No hay cartas pendientes" : "Sin resultados para ese filtro"}
        </p>
      )}

      {/* Grid de tarjetas (mismo look que oportunidades piratas) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {filtrados.slice(0, visibles).map((p) => (
          <PendienteCard
            key={keyDe(p)}
            p={p}
            onRegistrada={(msg) => { quitarDeLista(keyDe(p)); setMensaje(msg); }}
            onError={(msg) => setMensaje(msg)}
          />
        ))}
      </div>

      {filtrados.length > visibles && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button
            onClick={() => setVisibles((v) => v + PAGE)}
            style={{
              padding: "10px 28px", background: "#0E1D2B", color: "#B08343",
              border: "1px solid #6A481C", borderRadius: 8, cursor: "pointer",
              fontFamily: "'Philosopher', serif", fontWeight: 700, fontSize: 13,
            }}
          >
            Mostrar {Math.min(PAGE, filtrados.length - visibles)} más ({filtrados.length - visibles} restantes)
          </button>
        </div>
      )}
    </div>
  );
}

// Carta a tamaño grande al hacer click (mismo patrón que el panel pirata).
function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(14, 21, 29, 0.92)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
        <img src={src} alt={alt} style={{
          maxWidth: "80vw", maxHeight: "85vh", borderRadius: 16,
          border: "2px solid #B08343", boxShadow: "0 0 60px #B0834340", objectFit: "contain",
        }} />
        <button onClick={onClose} style={{
          position: "absolute", top: -14, right: -14, width: 30, height: 30, borderRadius: "50%",
          background: "#0E1D2B", border: "1px solid #B08343", color: "#B08343",
          fontSize: 16, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>×</button>
      </div>
    </div>
  );
}

function PendienteCard({ p, onRegistrada, onError }: {
  p: Pendiente;
  onRegistrada: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [lightbox, setLightbox] = useState(false);
  const [url, setUrl] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [verUrls, setVerUrls] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const meta = metaOrigen(p.origen);
  const img = imagenDe(p.uuid);

  async function registrar() {
    const u = url.trim();
    if (!u.startsWith("http")) {
      onError(`⚠️ Pega primero la URL de SCG para "${p.titulo}"`);
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/cache/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uuid: p.uuid,
          finishing: p.finishing,
          titulo: p.titulo,
          url: u,
          comentario: `Registrado manual desde Pendientes (origen: ${meta.nombre})`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error registrando");
      onRegistrada(`✓ "${p.titulo}" (${p.finishing}) registrada en el cache manual`);
    } catch (e) {
      console.error(e);
      onError(`⚠️ Error registrando "${p.titulo}"`);
      setGuardando(false);
    }
  }

  const fecha = (p.ultima_vez_usado || "").slice(0, 10);

  return (
    <>
      {lightbox && imgOk && <Lightbox src={img} alt={p.titulo} onClose={() => setLightbox(false)} />}
      <div style={{
        display: "flex", flexDirection: "column", gap: 10,
        background: "#0E1D2B", border: `1px solid ${meta.accent}55`,
        borderTop: `3px solid ${meta.accent}`, borderRadius: 12, padding: 12,
      }}>
        {/* origen + fecha */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{
            fontSize: 11.5, fontWeight: 800, padding: "3px 12px", borderRadius: 20,
            background: "#0E151D", border: `1px solid ${meta.accent}`, color: meta.accent,
            fontFamily: "'Philosopher', serif", letterSpacing: 0.5, whiteSpace: "nowrap",
          }}>
            {meta.emoji} {meta.nombre}
          </span>
          {fecha && <span style={{ fontSize: 11, color: "#44546A" }}>{fecha}</span>}
        </div>

        {/* imagen (click → grande) */}
        <div
          onClick={() => imgOk && setLightbox(true)}
          style={{
            width: "100%", aspectRatio: "0.716",
            borderRadius: 10, overflow: "hidden", border: "1px solid #24445D", background: "#0E151D",
            cursor: imgOk ? "zoom-in" : "default", transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => { if (imgOk) e.currentTarget.style.borderColor = "#B08343"; }}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#24445D")}
        >
          <img
            src={img}
            alt={p.titulo}
            loading="lazy"
            onError={(e) => { setImgOk(false); (e.currentTarget as HTMLImageElement).src = LOGO_FALLBACK; }}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>

        {/* nombre */}
        <div style={{
          fontSize: 15, fontWeight: 700, color: "#e8d5b7", fontFamily: "'Philosopher', serif",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }} title={p.titulo}>
          {p.titulo}
        </div>

        {/* foil / no foil */}
        {p.finishing === "Foil" ? (
          <span style={{
            alignSelf: "flex-start", fontSize: 12.5, fontWeight: 900, padding: "3px 14px", borderRadius: 20,
            background: "linear-gradient(90deg, #FF00FF, #FF69FF, #FF00FF)", color: "#fff",
            border: "2px solid #FF00FF", fontFamily: "'Philosopher', serif",
            boxShadow: "0 0 14px #FF00FF, 0 0 28px #FF00FF80", letterSpacing: 1.5, textShadow: "0 0 8px #fff",
          }}>✨ FOIL</span>
        ) : (
          <span style={{
            alignSelf: "flex-start", fontSize: 12, fontWeight: 700, padding: "3px 12px", borderRadius: 20,
            background: "#122F43", color: "#5C84A0", border: "1px solid #24445D", fontFamily: "'Philosopher', serif",
          }}>🃏 No Foil</span>
        )}

        {/* buscar en SCG + urls intentadas */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <a
            href={`https://starcitygames.com/search/?search_query=${encodeURIComponent(p.titulo)}`}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 12, color: "#B08343", textDecoration: "none",
              fontFamily: "'Philosopher', serif", fontWeight: 700,
            }}
          >
            🔎 Buscar en SCG ↗
          </a>
          {p.urls_intentadas.length > 0 && (
            <button
              onClick={() => setVerUrls((v) => !v)}
              style={{
                background: "transparent", border: "none", color: "#5C84A0",
                cursor: "pointer", fontSize: 11, fontFamily: "'Philosopher', serif",
                fontWeight: 700, padding: 0,
              }}
            >
              {verUrls ? "▾ ocultar" : `▸ intentadas (${p.urls_intentadas.length})`}
            </button>
          )}
        </div>

        {verUrls && (
          <div style={{
            padding: "8px 10px", background: "#0E151D",
            border: "1px solid #24445D40", borderRadius: 8, maxHeight: 120, overflowY: "auto",
          }}>
            {p.urls_intentadas.map((u) => (
              <div key={u} style={{ fontSize: 10.5, fontFamily: "monospace", overflowWrap: "anywhere", marginBottom: 4 }}>
                <a href={u} target="_blank" rel="noreferrer" style={{ color: "#44546A" }}>{u}</a>
              </div>
            ))}
          </div>
        )}

        {/* URL + registrar */}
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL del producto en SCG..."
          style={{
            width: "100%", padding: "8px 10px", background: "#0E151D",
            border: "1px solid #24445D", borderRadius: 8, color: "#e8d5b7",
            fontSize: 12, fontFamily: "monospace", outline: "none", boxSizing: "border-box",
          }}
        />
        <button
          onClick={registrar}
          disabled={guardando}
          style={{
            width: "100%", padding: "9px 0", background: guardando ? "#442E17" : "#8F672E",
            color: "#e8d5b7", border: "1px solid #6A481C", borderRadius: 8,
            fontFamily: "'Philosopher', serif", fontWeight: 700, fontSize: 13,
            cursor: guardando ? "not-allowed" : "pointer", letterSpacing: 0.5,
          }}
        >
          {guardando ? "Guardando..." : "Registrar en cache"}
        </button>
      </div>
    </>
  );
}
