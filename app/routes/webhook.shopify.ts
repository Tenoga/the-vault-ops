/**
 * Proxy para webhooks de Shopify → FastAPI backend (puerto 8000)
 *
 * Shopify envía los webhooks a la URL pública del app (ngrok:3000).
 * Esta ruta los reenvía internamente a localhost:8000 preservando
 * el body crudo y los headers de HMAC para que la verificación funcione.
 */
import type { ActionFunctionArgs } from "react-router";

const BACKEND = process.env.THEVAULT_API_URL!.replace(/\/$/, "");

export async function action({ request }: ActionFunctionArgs) {
  // Leer el body crudo como buffer — imprescindible para que el HMAC sea válido
  const rawBody = await request.arrayBuffer();

  // Reenviar solo los headers relevantes de Shopify
  const forwardHeaders: Record<string, string> = {
    "content-type": request.headers.get("content-type") ?? "application/json",
  };

  for (const header of [
    "x-shopify-topic",
    "x-shopify-hmac-sha256",
    "x-shopify-shop-domain",
    "x-shopify-api-version",
    "x-shopify-event-id",
    "x-shopify-triggered-at",
    "x-shopify-webhook-id",
  ]) {
    const value = request.headers.get(header);
    if (value) forwardHeaders[header] = value;
  }

  try {
    const response = await fetch(`${BACKEND}/webhook/shopify`, {
      method: "POST",
      headers: forwardHeaders,
      body: rawBody,
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("[webhook.shopify] Error al reenviar al backend:", err);
    return new Response(JSON.stringify({ ok: false, error: "proxy error" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}
