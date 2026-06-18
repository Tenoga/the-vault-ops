import type { LoaderFunctionArgs } from "react-router";

const API_BASE = process.env.THEVAULT_API_URL!;
const API_KEY = process.env.THEVAULT_API_KEY!;

// ─── GET /api/piratas/jobs/:id ─────────────────────────────────────────────
// Progreso de una corrida. Con ?result=1 devuelve el resumen final completo.

export async function loader({ params, request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const conResultado = url.searchParams.get("result");

  const endpoint = conResultado
    ? `${API_BASE}/piratas/jobs/${params.id}/result`
    : `${API_BASE}/piratas/jobs/${params.id}`;

  const response = await fetch(endpoint, {
    headers: {
      "x-api-key": API_KEY,
      "ngrok-skip-browser-warning": "true",
    },
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
