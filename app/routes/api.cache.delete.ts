import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

const API_URL = process.env.THEVAULT_API_URL;
const API_KEY = process.env.THEVAULT_API_KEY;

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json();

    const { uuid, finishing } = body;

    if (!uuid || !finishing) {
      return json(
        { error: "uuid y finishing son requeridos" },
        { status: 400 }
      );
    }

    // 1. DELETE CACHE
    const deleteResponse = await fetch(
      `${API_URL}/cache/${uuid}/${finishing}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY || "",
        },
      }
    );

    const deleteData = await deleteResponse.json();

    if (!deleteResponse.ok) {
      return json(
        { error: "Error eliminando cache", details: deleteData },
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
          error: "Cache eliminado pero falló el push",
          delete: deleteData,
          push: pushData,
        },
        { status: 500 }
      );
    }

    // 3. RESPUESTA FINAL
    return json({
      success: true,
      deleted: deleteData,
      push: pushData,
    });
  } catch (error) {
    console.error(error);
    return json(
      { error: "Error eliminando cache" },
      { status: 500 }
    );
  }
}