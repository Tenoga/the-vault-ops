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
              style={{
                background: "#0E1D2B",
                border: `1px solid ${bot.accent}40`,
                borderTop: `3px solid ${bot.accent}`,
                borderRadius: 10,
                padding: "20px 18px",
                height: "100%",
                opacity: bot.disponible ? 1 : 0.5,
                transition: "all 0.15s",
              }}
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
              <h3 style={{
                fontFamily: "'Philosopher', serif",
                fontSize: 16,
                fontWeight: 700,
                color: "#e8d5b7",
                margin: "0 0 8px",
              }}>
                {bot.nombre}
              </h3>
              <p style={{ fontSize: 12.5, color: "#b8a07a", lineHeight: 1.5, margin: 0 }}>
                {bot.descripcion}
              </p>
            </div>
          );

          return bot.disponible ? (
            <Link key={bot.nombre} to={bot.to} style={{ textDecoration: "none" }}>
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
