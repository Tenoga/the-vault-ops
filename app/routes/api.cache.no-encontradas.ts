import { json } from "@remix-run/node";

// api.cache.no-encontradas.ts
// Lista las cartas que los bots registraron como "no encontradas" en SCG,
// para cazarles la URL correcta desde /app/cache/pendientes.
export async function loader() {
  const response = await fetch(
    `${process.env.THEVAULT_API_URL}/cache/no-encontradas`,
    {
      headers: {
        "x-api-key": process.env.THEVAULT_API_KEY!,
        "ngrok-skip-browser-warning": "true",
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    console.log("Error body:", text);
    throw new Error("Error cargando no encontradas");
  }

  const data = await response.json();
  return json(data);
}
