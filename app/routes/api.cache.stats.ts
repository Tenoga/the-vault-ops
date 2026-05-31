import { json } from "@remix-run/node";

// api.cache.stats.ts
export async function loader() {
  console.log("🔍 Cache loader ejecutado");
  console.log("API URL:", process.env.THEVAULT_API_URL);
  console.log("API KEY existe:", !!process.env.THEVAULT_API_KEY);

  const response = await fetch(
    `${process.env.THEVAULT_API_URL}/cache/stats`,
    {
      headers: {
        "x-api-key": process.env.THEVAULT_API_KEY!,
        "ngrok-skip-browser-warning": "true",
      },
    }
  );

  console.log("Response status:", response.status);
  
  if (!response.ok) {
    const text = await response.text();
    console.log("Error body:", text);
    throw new Error("Error cargando cache stats");
  }

  const data = await response.json();
  return json(data);
}

