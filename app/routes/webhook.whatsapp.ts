/**
 * Proxy para webhooks de Meta WhatsApp → FastAPI backend (puerto 8000)
 *
 * GET  /webhook/whatsapp → verificación del webhook en Meta Developer Console
 * POST /webhook/whatsapp → eventos de estado de mensajes (sent, delivered, read, failed)
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

const BACKEND = process.env.THEVAULT_API_URL!.replace(/\/$/, "");

// ── GET: verificación de webhook que hace Meta ────────────────────────────────
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  try {
    const response = await fetch(
      `${BACKEND}/webhook/whatsapp?${url.searchParams.toString()}`
    );

    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: { "content-type": "text/plain" },
    });
  } catch (err) {
    console.error("[webhook.whatsapp GET] Error al reenviar al backend:", err);
    return new Response("proxy error", { status: 502 });
  }
}

// ── POST: eventos de estado de mensajes de Meta ───────────────────────────────
export async function action({ request }: ActionFunctionArgs) {
  const rawBody = await request.arrayBuffer();

  try {
    const response = await fetch(`${BACKEND}/webhook/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("[webhook.whatsapp POST] Error al reenviar al backend:", err);
    // Meta requiere siempre 200 — si el proxy falla, responder OK igual
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}
