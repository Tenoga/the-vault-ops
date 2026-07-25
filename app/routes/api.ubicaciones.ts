import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { getUbicaciones, replaceUbicaciones } from "../lib/ubicaciones.server";
import { validarUbicaciones, type Ubicacion } from "../lib/ubicaciones";

// ─── GET /api/ubicaciones ───────────────────────────────────────────────────────
// Devuelve el mapa completo de cajas. Lo consumen el portal de configuración y la
// vista de pedidos.

export async function loader(_args: LoaderFunctionArgs) {
  const ubicaciones = await getUbicaciones();
  return Response.json({ ubicaciones });
}

// ─── POST /api/ubicaciones ──────────────────────────────────────────────────────
// Guarda el mapa completo (reemplazo total). Valida cobertura A–Z antes de tocar
// la base: si algún contexto queda con huecos o solapes, rechaza sin guardar.

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Método no permitido" }, { status: 405 });
  }

  const body = (await request.json().catch(() => null)) as
    | { ubicaciones?: Ubicacion[] }
    | null;

  const items = Array.isArray(body?.ubicaciones) ? body!.ubicaciones! : [];

  const validacion = validarUbicaciones(items);
  if (!validacion.ok) {
    return Response.json(
      { error: "La configuración tiene errores", validacion },
      { status: 400 },
    );
  }

  await replaceUbicaciones(items);

  return Response.json({ ok: true, ubicaciones: await getUbicaciones() });
}
