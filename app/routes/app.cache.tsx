import { Outlet, Link, useLocation } from "react-router";

const navLinks = [
  { to: "/app/cache", label: "Inicio", end: true },
  { to: "/app/cache/registro", label: "Registrar / Actualizar" },
  { to: "/app/cache/consulta", label: "Consultar" },
  { to: "/app/cache/delete", label: "Eliminar" },
];

export default function CacheLayout() {
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
        <h1 style={{
          fontFamily: "'Nova Cut', cursive",
          fontSize: 22,
          color: "#8F672E",
          margin: "0 0 14px",
          letterSpacing: 2,
        }}>
          THE VAULT · Cache Module
        </h1>

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