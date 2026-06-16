import { Outlet, Link, useLocation } from "react-router";

const navLinks = [
  { to: "/app/bots", label: "Inicio", end: true },
  { to: "/app/bots/inventario", label: "Cargue de Inventario" },
];

export default function BotsLayout() {
  const { pathname } = useLocation();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0E151D",
      fontFamily: "'Literata', Georgia, serif",
      color: "#e8d5b7",
    }}>

      {/* Top bar */}
      <div style={{
        background: "#0E1D2B",
        borderBottom: "1px solid #24445D40",
        padding: "16px 28px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 14px" }}>
          <img
            src="https://cdn.shopify.com/s/files/1/0710/0029/3568/files/Asset_16_e4fa64a8-f068-4f0b-ae9f-c93f8339b649.png?v=1757435443"
            alt="The Vault"
            style={{ height: 84, display: "block" }}
          />
          <span style={{
            fontFamily: "'Nova Cut', cursive",
            fontSize: 18,
            color: "#8F672E",
            letterSpacing: 2,
          }}>
            · BOTS
          </span>
        </div>

        <nav style={{ display: "flex", gap: 4 }}>
          {navLinks.map(({ to, label, end }) => {
            const active = end ? pathname === to : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: active ? 700 : 400,
                  fontFamily: "'Philosopher', serif",
                  color: active ? "#e8d5b7" : "#8F672E",
                  background: active ? "#442E17" : "transparent",
                  border: active ? "1px solid #6A481C" : "1px solid transparent",
                  textDecoration: "none",
                  transition: "all 0.15s",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div style={{ padding: "28px 28px" }}>
        <Outlet />
      </div>
    </div>
  );
}
