import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

const API_BASE = process.env.THEVAULT_API_URL!;
const API_KEY = process.env.THEVAULT_API_KEY!;

const BASE_HEADERS = {
  "x-api-key": API_KEY,
  "ngrok-skip-browser-warning": "true",
};

// ─── GET /api/tirillas?order=1720  → datos del pedido para prellenar ────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const orderNumber = url.searchParams.get("order");

  if (!orderNumber) {
    return json({ error: "Número de pedido requerido" }, { status: 400 });
  }

  const response = await fetch(
    `${API_BASE}/tirillas/${encodeURIComponent(orderNumber)}/prefill`,
    { headers: BASE_HEADERS },
  );

  if (!response.ok) {
    return json(
      { error: `Error cargando pedido #${orderNumber} (HTTP ${response.status})` },
      { status: response.status },
    );
  }

  return json(await response.json());
}

// ─── POST /api/tirillas  → genera el PDF y lo devuelve tal cual ─────────────────

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Método no permitido" }, { status: 405 });
  }

  const body = await request.json();

  const response = await fetch(`${API_BASE}/tirillas/generate`, {
    method: "POST",
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return json(
      { error: `Error generando tirilla: ${errorText}` },
      { status: response.status },
    );
  }

  // Reenviar el PDF binario al navegador.
  const pdf = await response.arrayBuffer();
  const filename =
    response.headers
      .get("content-disposition")
      ?.match(/filename="?([^"]+)"?/)?.[1] ?? "tirilla.pdf";

  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
