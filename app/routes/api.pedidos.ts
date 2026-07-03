import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

const API_BASE = process.env.THEVAULT_API_URL!;
const API_KEY = process.env.THEVAULT_API_KEY!;

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface RequestBody {
  order_name: string;
  order_id: string;
  tags: string[];
  dry_run: boolean;
  allocations: { variant_id: string; providers: Record<string, number> }[];
  gestionados: string[];
  no_fisicos: string[];
  items: { variant_id: string; [key: string]: unknown }[];
}

// ─── GET /api/pedidos?order=1463 ──────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // ── Listado de pedidos pendientes (tarjetas del inicio) ──────────────────
  if (url.searchParams.get("list") === "pending") {
    const response = await fetch(`${API_BASE}/orders/pending`, {
      headers: {
        "x-api-key": API_KEY,
        "ngrok-skip-browser-warning": "true",
      },
    });

    if (!response.ok) {
      return json(
        { error: `Error cargando pedidos pendientes (HTTP ${response.status})` },
        { status: response.status },
      );
    }

    return json(await response.json());
  }

  const orderNumber = url.searchParams.get("order");

  if (!orderNumber) {
    return json({ error: "Número de orden requerido" }, { status: 400 });
  }

  const response = await fetch(`${API_BASE}/orders/${orderNumber}`, {
    headers: {
      "x-api-key": API_KEY,
      "ngrok-skip-browser-warning": "true",
    },
  });

  if (!response.ok) {
    return json(
      { error: `Error cargando pedido #${orderNumber} (HTTP ${response.status})` },
      { status: response.status },
    );
  }

  const data = await response.json();
  return json(data);
}

// ─── POST /api/pedidos ────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Método no permitido" }, { status: 405 });
  }

  const body: RequestBody = await request.json();

  // ── 1. Verificar tag "alistado" antes de tocar nada ──────────────────────
  if (body.tags?.includes("alistado")) {
    return json(
      { error: `El pedido ${body.order_name} ya está alistado. No se realizó ningún cambio.` },
      { status: 409 }
    );
  }

  // ── 2. Filtrar no_fisicos de las allocations ─────────────────────────────
  const noFisicoSet = new Set(body.no_fisicos ?? []);
  const allocations = body.allocations.filter(
    (a) => !noFisicoSet.has(a.variant_id)
  );

  // ── 3. Llamar al backend (maneja Excel + Shopify + tag "alistado") ────────
  const response = await fetch(`${API_BASE}/orders/process`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({
      order_name: body.order_name,
      allocations,
      dry_run: body.dry_run,
      no_fisicos: body.no_fisicos ?? [],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return json(
      { error: `Error procesando pedido: ${errorText}` },
      { status: response.status }
    );
  }

  const data = await response.json();

  // Manejar todos los estados de error del pipeline
  switch (data.status) {
    case "completed":
      return json(data);

    case "blocked":
    case "already_processed":
      return json(
        { error: `El pedido ${body.order_name} ya está alistado. No se realizó ningún cambio.` },
        { status: 409 }
      );

    case "excel_error":
      return json(
        { error: `Error en Excel: ${data.message ?? data.excel?.message ?? "Error desconocido"}. Inventario y tag NO actualizados.` },
        { status: 500 }
      );

    case "allocation_error":
      return json(
        { error: `Error en allocations: ${data.message}` },
        { status: 400 }
      );

    case "validation_error":
      return json(
        { error: `Error de validación: ${JSON.stringify(data.errors)}` },
        { status: 400 }
      );

    case "error":
      return json(
        { error: data.message ?? "Error desconocido en el backend" },
        { status: 500 }
      );

    default:
      // Retornar los datos tal cual para casos no contemplados
      return json(data);
  }
}
