import type { ActionFunctionArgs } from "react-router";

const API_BASE = process.env.THEVAULT_API_URL!;
const API_KEY = process.env.THEVAULT_API_KEY!;

// ─── POST /api/inventario/validate ────────────────────────────────────────────
// Reenvía el CSV al backend para validarlo (no toca Shopify).

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Método no permitido" }, { status: 405 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "Archivo CSV requerido" }, { status: 400 });
  }

  const out = new FormData();
  out.append("file", file, file.name);

  const response = await fetch(`${API_BASE}/inventory/validate`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "ngrok-skip-browser-warning": "true",
    },
    body: out,
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
