import http from "node:http";
import { spawn } from "node:child_process";

const proxyPort = Number(process.env.PLAYWRIGHT_PORT || 3000);

async function findFreePort() {
  return await new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

const appPort = process.env.PLAYWRIGHT_APP_PORT
  ? Number(process.env.PLAYWRIGHT_APP_PORT)
  : await findFreePort();
const pocketBaseUrl = new URL(
  process.env.POCKETBASE_INTERNAL_URL || "http://127.0.0.1:8090",
);
const appUrl = new URL(`http://127.0.0.1:${appPort}`);

let shuttingDown = false;

const app = spawn("bun", ["run", "start"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(appPort),
  },
  stdio: ["ignore", "inherit", "inherit"],
});

app.on("exit", (code, signal) => {
  if (!shuttingDown) {
    console.error(`Production app exited unexpectedly (${code ?? signal}).`);
    process.exit(code || 1);
  }
});
function proxyRequest(req, res) {
  const target = req.url?.startsWith("/api") ? pocketBaseUrl : appUrl;
  const headers = { ...req.headers, host: target.host };
  delete headers.connection;
  delete headers["proxy-connection"];

  const upstream = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: req.method,
      path: req.url,
      headers,
    },
    (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers };
      delete responseHeaders.connection;
      res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(res);
    },
  );

  upstream.on("error", (error) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end(`Upstream unavailable: ${error.message}`);
  });
  req.pipe(upstream);
}
const server = http.createServer(proxyRequest);
server.listen(proxyPort, "127.0.0.1", () => {
  console.log(
    `Playwright production proxy listening on ${proxyPort} ` +
      `(app ${appPort}, PocketBase ${pocketBaseUrl.origin})`,
  );
});

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => process.exit(0));
  if (!app.killed) app.kill("SIGTERM");
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
