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

    // 2. PUSH CACHE
    const pushResponse = await fetch(`${API_URL}/cache/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY || "",
      },
    });

    const pushData = await pushResponse.json().catch(() => ({}));

    if (!pushResponse.ok) {
      return json(
        {
          error: "Cache actualizado pero falló el push",
          update: updateData,
          push: pushData,
        },
        { status: 500 }
      );
    }

    // 3. RESPUESTA FINAL
    return json({
      ...updateData,
      push: pushData,
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