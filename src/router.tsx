import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  routeTree,
  scrollRestoration: true,
  trailingSlash: 'preserve',
});

// Required by TanStack Start internals (hydrateStart imports getRouter)
export function getRouter() {
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
