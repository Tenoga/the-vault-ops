import type { ActionFunctionArgs } from "react-router";

const API_BASE = process.env.THEVAULT_API_URL!;
const API_KEY = process.env.THEVAULT_API_KEY!;

// ─── POST /api/precios/scan ────────────────────────────────────────────────
// Lanza un escaneo de precios contra SCG (job en background).

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Método no permitido" }, { status: 405 });
  }

  const payload = await request.json();

  const response = await fetch(`${API_BASE}/precios/scan`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
