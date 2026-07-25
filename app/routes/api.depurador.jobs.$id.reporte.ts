import type { LoaderFunctionArgs } from "react-router";

const API_BASE = process.env.THEVAULT_API_URL!;
const API_KEY = process.env.THEVAULT_API_KEY!;

// ─── GET /api/depurador/jobs/:id/reporte ──────────────────────────────────────
// Sirve el reporte HTML interactivo del job (para incrustarlo en un iframe).

export async function loader({ params }: LoaderFunctionArgs) {
  const response = await fetch(
    `${API_BASE}/depurador/jobs/${params.id}/reporte`,
    {
      headers: {
        "x-api-key": API_KEY,
        "ngrok-skip-browser-warning": "true",
      },
    },
  );

  if (!response.ok) {
    return new Response("Reporte no disponible", { status: response.status });
  }

  const html = await response.text();
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
