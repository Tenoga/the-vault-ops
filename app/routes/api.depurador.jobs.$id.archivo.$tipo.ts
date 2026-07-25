import type { LoaderFunctionArgs } from "react-router";

const API_BASE = process.env.THEVAULT_API_URL!;
const API_KEY = process.env.THEVAULT_API_KEY!;

// ─── GET /api/depurador/jobs/:id/archivo/:tipo ────────────────────────────────
// Descarga una salida del job: retirar (lista de retiro) o depurado (inventario
// limpio). Reenvía el archivo del backend como descarga.

export async function loader({ params }: LoaderFunctionArgs) {
  const { id, tipo } = params;

  const response = await fetch(
    `${API_BASE}/depurador/jobs/${id}/archivo/${tipo}`,
    {
      headers: {
        "x-api-key": API_KEY,
        "ngrok-skip-browser-warning": "true",
      },
    },
  );

  if (!response.ok) {
    return new Response("Archivo no disponible", { status: response.status });
  }

  const buffer = await response.arrayBuffer();
  const nombre = tipo === "depurado" ? "inventario_depurado.csv" : "lista_retiro.csv";
  const media = tipo === "reporte" ? "text/html" : "text/csv";

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": `${media}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}
