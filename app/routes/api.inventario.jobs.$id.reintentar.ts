import type { ActionFunctionArgs } from "react-router";

const API_BASE = process.env.THEVAULT_API_URL!;
const API_KEY = process.env.THEVAULT_API_KEY!;

// ─── POST /api/inventario/jobs/:id/reintentar ─────────────────────────────
// Crea un job nuevo solo con las cartas fallidas de un job terminado.

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Método no permitido" }, { status: 405 });
  }

  const response = await fetch(`${API_BASE}/inventory/jobs/${params.id}/reintentar`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "ngrok-skip-browser-warning": "true",
    },
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
