import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

console.log("ENTRY CLIENT EJECUTANDO");

startTransition(() => {
  console.log("ANTES HYDRATE");

  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>
  );

  console.log("DESPUES HYDRATE");
});