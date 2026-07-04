import { RemixBrowser } from "@remix-run/react";
import { startTransition, StrictMode } from "react";
import { createRoot, type Container } from "react-dom/client";

startTransition(() => {
  createRoot(document as unknown as Container).render(
    <StrictMode>
      <RemixBrowser />
    </StrictMode>,
  );
});
