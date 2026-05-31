import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

const API_BASE = process.env.THEVAULT_API_URL!;
const API_KEY = process.env.THEVAULT_API_KEY!;

// GET /api/pedidos?order=1463
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const orderNumber = url.searchParams.get("order");

  if (!orderNumber) {
    return json({ error: "Número de orden requerido" }, { status: 400 });
  }

  const response = await fetch(`${API_BASE}/orders/${orderNumber}`, {
    headers: { "x-api-key": API_KEY },
    "ngrok-skip-browser-warning": "true",
  });

  if (!response.ok) {
    throw new Error(`Error cargando pedido #${orderNumber}`);
  }

  const data = await response.json();
  return json(data);
}

// POST /api/pedidos  → procesa la gestión del pedido
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Método no permitido" }, { status: 405 });
  }

  const body = await request.json();

  const response = await fetch(`${API_BASE}/orders/process`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return json(
      { error: `Error procesando pedido: ${errorText}` },
      { status: response.status }
    );
  }

  const data = await response.json();
  return json(data);
}