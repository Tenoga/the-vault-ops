import { Link } from "react-router";

// Paleta de marca
// #442E17 #0E1D2B #6A481C #122F43 #8F672E #24445D #0E151D

const bots = [
  {
    nombre: "Cargue de Inventario",
    emoji: "📦",
    descripcion:
      "Sube el CSV del proveedor y carga las cartas a Shopify con seguimiento en vivo: validación previa, progreso, ETA y detalle de exitosas/fallidas.",
    to: "/app/bots/inventario",
    accent: "#8F672E",
    disponible: true,
  },
  {
    nombre: "Bot Pirata Draco",
    emoji: "🐲",
    descripcion: "Creación masiva de productos desde Scryfall.",
    to: "",
    accent: "#24445D",
    disponible: false,
  },
  {
    nombre: "Actualizador de Precios",
    emoji: "💰",
    descripcion:
      "Compara precios contra SCG y actualiza Shopify con seguimiento en vivo: progreso, ETA y diferencia total.",
    to: "/app/bots/precios",
    accent: "#6A481C",
    disponible: true,
  },
];

export default function BotsHub() {
  return (
    <div style={{ fontFamily: "'Literata', Georgia, serif", color: "#e8d5b7" }}>

      {/* Hover de las cards disponibles: elevación + glow del borde según el acento */}
      <style>{`
        .bot-card-on { cursor: pointer; }
        .bot-card-on:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 28px #00000055;
          border-color: var(--accent);
        }
        .bot-card-on:hover .bot-card-titulo { color: #fff; }
        .bot-card-on:active { transform: translateY(-1px); }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Philosopher', serif", fontSize: 22, fontWeight: 700, color: "#e8d5b7", margin: 0 }}>
          Bots de The Vault
        </h2>
        <p style={{ fontSize: 13, color: "#8F672E", marginTop: 4 }}>
          Automatizaciones de la tienda — elige un bot para empezar
        </p>
      </div>

      {/* Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {bots.map((bot) => {
          const card = (
            <div
              key={bot.nombre}
              className={bot.disponible ? "bot-card-on" : undefined}
              style={{
                "--accent": bot.accent,
                background: "#0E1D2B",
                border: `1px solid ${bot.accent}40`,
                borderTop: `3px solid ${bot.accent}`,
                borderRadius: 10,
                padding: "20px 18px",
                height: "100%",
                opacity: bot.disponible ? 1 : 0.5,
                transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
              } as React.CSSProperties}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 28 }}>{bot.emoji}</span>
                {!bot.disponible && (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    color: "#8F672E",
                    background: "#442E1740",
                    border: "1px solid #6A481C",
                    padding: "2px 10px",
                    borderRadius: 20,
                  }}>
                    Próximamente
                  </span>
                )}
              </div>
              <h3 className="bot-card-titulo" style={{
                fontFamily: "'Philosopher', serif",
                fontSize: 16,
                fontWeight: 700,
                color: "#e8d5b7",
                margin: "0 0 8px",
                transition: "color 0.15s ease",
              }}>
                {bot.nombre}
              </h3>
              <p style={{ fontSize: 12.5, color: "#b8a07a", lineHeight: 1.5, margin: 0 }}>
                {bot.descripcion}
              </p>
            </div>
          );

          return bot.disponible ? (
            <Link key={bot.nombre} to={bot.to} style={{ textDecoration: "none", display: "block" }}>
              {card}
            </Link>
          ) : (
            card
          );
        })}
      </div>
    </div>
  );
}
