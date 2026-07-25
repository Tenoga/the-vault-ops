import type { ActionFunctionArgs } from "react-router";

const API_BASE = process.env.THEVAULT_API_URL!;
const API_KEY = process.env.THEVAULT_API_KEY!;

// ─── POST /api/depurador/upload ───────────────────────────────────────────────
// Reenvía el CSV de ManaBox + parámetros al backend y lanza la depuración.

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Método no permitido" }, { status: 405 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Archivo CSV requerido" }, { status: 400 });
  }

  const out = new FormData();
  out.append("file", file, file.name);
  out.append("umbral", String(formData.get("umbral") ?? "0.90"));
  out.append("conservar", String(formData.get("conservar") ?? "4"));
  const cmc = formData.get("cmc");
  if (cmc != null && String(cmc).trim() !== "") out.append("cmc", String(cmc));
  const letras = formData.get("letras");
  if (letras != null && String(letras).trim() !== "") out.append("letras", String(letras));
  const color = formData.get("color");
  if (color != null && String(color).trim() !== "") out.append("color", String(color));

  const response = await fetch(`${API_BASE}/depurador/depurar`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "ngrok-skip-browser-warning": "true",
    },
    body: out,
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
