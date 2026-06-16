import type { LoaderFunctionArgs } from "react-router";

const API_BASE = process.env.THEVAULT_API_URL!;
const API_KEY = process.env.THEVAULT_API_KEY!;

// ─── GET /api/inventario/proveedores ──────────────────────────────────────────
// Lista de proveedores existentes (barcodes de Shopify, cacheada en el
// backend). Con ?refresh=1 fuerza un re-escaneo (~1 min).

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh");

  const response = await fetch(
    `${API_BASE}/inventory/proveedores${refresh ? "?refresh=1" : ""}`,
    {
      headers: {
        "x-api-key": API_KEY,
        "ngrok-skip-browser-warning": "true",
      },
    },
  );

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
