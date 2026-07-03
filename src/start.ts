import { createStart, createCsrfMiddleware } from "@tanstack/react-start";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  origin: process.env.PUBLIC_APP_URL || "http://localhost:3001",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}));
