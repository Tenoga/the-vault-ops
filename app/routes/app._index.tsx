import { Link } from "react-router";

// ─── Paleta de marca ──────────────────────────────────────────────────────────
// #442E17 #0E1D2B #6A481C #122F43 #8F672E #24445D #0E151D #B08343 #5C84A0

const modules = [
  {
    to: "/app/pedidos",
    icon: "📦",
    title: "Pedidos",
    description: "Gestiona y asigna proveedores a los ítems de cada pedido. Marca como gestionado y exporta.",
    accent: "#B08343",
    border: "#8F672E",
    glow: "#B0834325",
  },
  {
    to: "/app/cache",
    icon: "⚡",
    title: "Cache",
    description: "Administra el caché de productos y sincronización con Shopify para mantener los datos al día.",
    accent: "#5C84A0",
    border: "#24445D",
    glow: "#5C84A025",
  },
  {
    to: "/app/bots",
    icon: "🤖",
    title: "Bots",
    description: "Configura y monitorea los bots automatizados de operaciones de The Vault.",
    accent: "#8F672E",
    border: "#6A481C",
    glow: "#8F672E25",
  },
];

export default function Inicio() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0E151D",
      fontFamily: "'Literata', Georgia, serif",
      color: "#e8d5b7",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 32px",
    }}>

      {/* Logo + título */}
      <div style={{ textAlign: "center", marginBottom: 56 }}>
        <img
          src="https://cdn.shopify.com/s/files/1/0710/0029/3568/files/Asset_9_e0d5e097-e5f5-4847-aad0-349d9cae599d.png?v=1759766276"
          alt="The Vault"
          style={{ width: 260, marginBottom: 20, opacity: 0.95 }}
        />
        <p style={{
          fontSize: 13, color: "#5C84A0", letterSpacing: 4,
          textTransform: "uppercase", fontFamily: "'Philosopher', serif",
          margin: 0,
        }}>
          Panel de Operaciones
        </p>
      </div>

      {/* Cards de módulos */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 20,
        width: "100%",
        maxWidth: 860,
      }}>
        {modules.map((mod) => (
          <Link
            key={mod.to}
            to={mod.to}
            style={{ textDecoration: "none" }}
          >
            <div
              style={{
                background: "#0E1D2B",
                border: `1px solid ${mod.border}50`,
                borderRadius: 16,
                padding: "32px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                cursor: "pointer",
                transition: "all 0.2s",
                height: "100%",
                boxSizing: "border-box",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.border = `1px solid ${mod.border}`;
                el.style.boxShadow = `0 0 24px ${mod.glow}`;
                el.style.transform = "translateY(-3px)";
                el.style.background = "#0E1D2Bcc";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.border = `1px solid ${mod.border}50`;
                el.style.boxShadow = "none";
                el.style.transform = "translateY(0)";
                el.style.background = "#0E1D2B";
              }}
            >
              <div style={{ fontSize: 36 }}>{mod.icon}</div>
              <h2 style={{
                fontFamily: "'Philosopher', serif",
                fontSize: 20, fontWeight: 700,
                color: mod.accent, margin: 0,
                letterSpacing: 1,
              }}>
                {mod.title}
              </h2>
              <p style={{
                fontSize: 13, color: "#5C84A0",
                margin: 0, lineHeight: 1.6,
              }}>
                {mod.description}
              </p>
              <div style={{
                marginTop: "auto",
                paddingTop: 16,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 700,
                color: mod.accent,
                fontFamily: "'Philosopher', serif",
                letterSpacing: 1,
              }}>
                Abrir módulo
                <span style={{ fontSize: 14 }}>→</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Footer */}
      <p style={{
        marginTop: 56, fontSize: 10,
        color: "#24445D", letterSpacing: 2,
        textTransform: "uppercase",
        fontFamily: "'Nova Cut', cursive",
      }}>
        The Vault MTG · Ops
      </p>
    </div>
  );
}
