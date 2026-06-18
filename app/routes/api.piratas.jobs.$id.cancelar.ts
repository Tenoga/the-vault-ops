import type { ActionFunctionArgs } from "react-router";

const API_BASE = process.env.THEVAULT_API_URL!;
const API_KEY = process.env.THEVAULT_API_KEY!;

// ─── POST /api/piratas/jobs/:id/cancelar ───────────────────────────────────
// Pide al backend detener una corrida (parada cooperativa).

export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Método no permitido" }, { status: 405 });
  }

  const response = await fetch(`${API_BASE}/piratas/jobs/${params.id}/cancelar`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "ngrok-skip-browser-warning": "true",
    },
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
