import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

const API_URL = process.env.THEVAULT_API_URL;
const API_KEY = process.env.THEVAULT_API_KEY;

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();

    const { uuid, finishing, url, comentario, titulo } = body;

    if (!uuid || !finishing || !url || !titulo) {
      return json(
        { error: "uuid, finishing, url y titulo son requeridos" },
        { status: 400 }
      );
    }

    // 1. UPDATE CACHE
    const updateResponse = await fetch(`${API_URL}/cache/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY || "",
      },
      body: JSON.stringify({
        uuid,
        finishing,
        url,
        titulo,
        comentario: comentario || "",
      }),
    });

    const updateData = await updateResponse.json();

    if (!updateResponse.ok) {
      return json(
        { error: "Error actualizando cache", details: updateData },
        { status: 500 }
      );
    }

    // 2. RESPUESTA FINAL (sin push: el cache es local, git eliminado 2026-07-06;
    // el backend ademas quita la carta de no-encontradas en el mismo update)
    return json({
      ...updateData,
      success: true,
    });
  } catch (error) {
    console.error(error);

    return json(
      { error: "Error actualizando cache" },
      { status: 500 }
    );
  }
}