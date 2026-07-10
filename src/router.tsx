import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    trailingSlash: 'preserve',
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}

// Keep getRouter for backward compatibility with routeTree.gen.ts until it regenerates
export function getRouter() {
  return createRouter();
}
