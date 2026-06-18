import type { ActionFunctionArgs } from "react-router";

const API_BASE = process.env.THEVAULT_API_URL!;
const API_KEY = process.env.THEVAULT_API_KEY!;

// ─── POST /api/piratas/scan-todos ──────────────────────────────────────────
// Encola los 4 bots (corren uno a la vez en el backend).

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Método no permitido" }, { status: 405 });
  }

  const payload = await request.json();

  const response = await fetch(`${API_BASE}/piratas/scan-todos`, {
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
