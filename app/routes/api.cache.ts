import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

const API_KEY = process.env.THEVAULT_API_KEY;
const API_URL = process.env.THEVAULT_API_URL;

function isUUID(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

export async function loader({ request }: LoaderFunctionArgs) {

  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  if (!q) {
    throw new Response("Query required", { status: 400 });
  }

  const endpoint = isUUID(q)
    ? `${API_URL}/cache/${q}`
    : `${API_URL}/cache/search/?q=${encodeURIComponent(q)}`;

  const response = await fetch(endpoint, {
    headers: {
      "x-api-key": API_KEY || "",
    },
  });

  const data = await response.json();

  // 🔥 NORMALIZACIÓN ÚNICA
  if (isUUID(q)) {
    return json({
      [q]: data
    });
  }

  return json(data);
}