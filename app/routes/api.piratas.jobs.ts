const API_BASE = process.env.THEVAULT_API_URL!;
const API_KEY = process.env.THEVAULT_API_KEY!;

// ─── GET /api/piratas/jobs ─────────────────────────────────────────────────
// Lista todas las corridas (recientes primero).

export async function loader() {
  const response = await fetch(`${API_BASE}/piratas/jobs`, {
    headers: {
      "x-api-key": API_KEY,
      "ngrok-skip-browser-warning": "true",
    },
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
