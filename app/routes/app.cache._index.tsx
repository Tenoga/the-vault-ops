import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

// Paleta de marca
// #442E17 #0E1D2B #6A481C #122F43 #8F672E #24445D #0E151D

export default function CacheDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStats() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/cache/stats");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setStats(data);
    } catch (e: any) {
      setError(e.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  const staleCount = stats?.stale_uuids?.length ?? 0;
  const forecast = stats?.deletion_forecast ?? {};

  const kpis = stats
    ? [
        { label: "UUIDs", value: stats.total_uuids, accent: "#8F672E" },
        { label: "Finishings", value: stats.total_finishings, accent: "#24445D" },
        { label: "Vacíos", value: stats.empty_uuids, accent: "#6A481C" },
        { label: "Viejos", value: staleCount, accent: "#442E17" },
        { label: "Max días", value: stats.max_age_days, accent: "#122F43" },
        { label: "Promedio", value: Number(stats.avg_age_days ?? 0).toFixed(1) + "d", accent: "#24445D" },
      ]
    : [];

  const forecastBars = [
    { label: "0–3d", key: "0-3", color: "#8F672E" },
    { label: "4–7d", key: "4-7", color: "#6A481C" },
    { label: "8–15d", key: "8-15", color: "#442E17" },
    { label: "16–31d", key: "16-31", color: "#24445D" },
    { label: "31+d", key: "31+", color: "#122F43" },
  ];

  const maxForecast = Math.max(...forecastBars.map((b) => forecast[b.key] ?? 0), 1);

  return (
    <div style={{ fontFamily: "'Literata', Georgia, serif", color: "#e8d5b7" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontFamily: "'Philosopher', serif", fontSize: 22, fontWeight: 700, color: "#e8d5b7", margin: 0 }}>
            Estadísticas del Cache
          </h2>
          <p style={{ fontSize: 13, color: "#8F672E", marginTop: 4 }}>
            Vista general del estado actual del cache de productos
          </p>
        </div>
        <button
          onClick={loadStats}
          disabled={loading}
          style={{
            padding: "10px 22px",
            background: loading ? "#442E17" : "#8F672E",
            color: "#e8d5b7",
            border: "1px solid #6A481C",
            borderRadius: 8,
            fontFamily: "'Philosopher', serif",
            fontWeight: 700,
            fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            transition: "all 0.2s",
          }}
        >
          {loading ? "Cargando..." : "↻ Actualizar stats"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: "12px 16px",
          borderRadius: 8,
          background: "#2a0e0e",
          border: "1px solid #7f1d1d",
          color: "#fca5a5",
          fontSize: 13,
          marginBottom: 20,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* KPIs */}
      {stats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 28 }}>
            {kpis.map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  background: "#0E1D2B",
                  border: `1px solid ${kpi.accent}40`,
                  borderTop: `3px solid ${kpi.accent}`,
                  borderRadius: 10,
                  padding: "16px 14px",
                }}
              >
                <p style={{ fontSize: 10, fontWeight: 700, color: kpi.accent, textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>
                  {kpi.label}
                </p>
                <p style={{ fontSize: 28, fontWeight: 800, color: "#e8d5b7", margin: "6px 0 0", fontFamily: "'Philosopher', serif" }}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          {/* Separator */}
          <div style={{ height: 1, background: "#24445D40", marginBottom: 24 }} />

          {/* Forecast */}
          <div style={{ marginBottom: 28 }}>
            <h3 style={{
              fontFamily: "'Philosopher', serif",
              fontSize: 13,
              fontWeight: 700,
              color: "#8F672E",
              textTransform: "uppercase",
              letterSpacing: 1.5,
              marginBottom: 16,
            }}>
              Proyección de eliminación
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
              {forecastBars.map((bar) => {
                const val = forecast[bar.key] ?? 0;
                const pct = Math.round((val / maxForecast) * 100);
                return (
                  <div key={bar.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: "#e8d5b7", fontFamily: "'Philosopher', serif" }}>{val}</span>
                    <div style={{ width: "100%", height: 6, background: "#0E1D2B", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: bar.color, borderRadius: 99, transition: "width 0.5s" }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#8F672E", fontWeight: 600 }}>{bar.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Separator */}
          <div style={{ height: 1, background: "#24445D40", marginBottom: 24 }} />

          {/* UUIDs Viejos */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{
                fontFamily: "'Philosopher', serif",
                fontSize: 13,
                fontWeight: 700,
                color: "#8F672E",
                textTransform: "uppercase",
                letterSpacing: 1.5,
                margin: 0,
              }}>
                UUIDs Viejos
              </h3>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                background: "#442E1740",
                color: "#8F672E",
                border: "1px solid #6A481C",
                padding: "2px 10px",
                borderRadius: 20,
              }}>
                {staleCount} entradas
              </span>
            </div>
            <div style={{ border: "1px solid #24445D40", borderRadius: 10, overflow: "hidden", background: "#0E151D" }}>
              <ScrollArea className="h-[320px]">
                {staleCount === 0 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, color: "#8F672E", fontSize: 13 }}>
                    ✓ No hay UUIDs viejos
                  </div>
                )}
                {stats.stale_uuids?.map((item: any, i: number) => (
                  <div
                    key={item.uuid}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 16px",
                      borderBottom: "1px solid #24445D30",
                      background: i % 2 === 0 ? "#0E151D" : "#0E1D2B",
                    }}
                  >
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "#b8a07a" }}>{item.uuid}</span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: item.age_days > 30 ? "#442E1780" : item.age_days > 15 ? "#6A481C60" : "#8F672E40",
                      color: item.age_days > 30 ? "#fca5a5" : item.age_days > 15 ? "#fdba74" : "#8F672E",
                      border: `1px solid ${item.age_days > 30 ? "#7f1d1d" : item.age_days > 15 ? "#6A481C" : "#442E17"}`,
                    }}>
                      {item.age_days}d
                    </span>
                  </div>
                ))}
              </ScrollArea>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!stats && !loading && !error && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <p style={{ color: "#8F672E", fontSize: 14, fontFamily: "'Literata', serif" }}>
            Presiona "Actualizar stats" para cargar los datos del cache
          </p>
        </div>
      )}
    </div>
  );
}