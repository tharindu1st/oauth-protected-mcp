import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { authenticate, type AuthenticatedUser } from "./auth.js";
import { createMcpServerForUser } from "./mcp.js";
import { logger } from "./logger.js";

// JSON-RPC methods that MCP clients must be able to call before they have
// (or even know how to obtain) an access token: capability negotiation and
// capability/tool/prompt/resource discovery. None of these touch per-user
// data, so they're safe to expose without a Bearer token. Everything else
// (tools/call, etc.) stays protected.
const PUBLIC_MCP_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "tools/list",
  "prompts/list",
  "resources/list",
]);

const ANONYMOUS_USER: AuthenticatedUser = {
  key: "anonymous",
  subject: "anonymous",
  scopes: [],
  claims: {},
};

function isPublicMcpRequest(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  return (
    messages.length > 0 &&
    messages.every(
      (msg) => typeof msg === "object" && msg !== null && PUBLIC_MCP_METHODS.has((msg as { method?: unknown }).method as string),
    )
  );
}

/** Skips bearer-token auth for public MCP methods (initialize, tools/list); enforces it for everything else. */
function authenticateProtectedMethods(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (isPublicMcpRequest(req.body)) {
    logger.debug("Allowing unauthenticated public MCP request", { body: req.body });
    req.user = ANONYMOUS_USER;
    next();
    return;
  }
  authenticate(req, res, next);
}

const app = express();
app.use(express.json());

app.use((req, _res, next) => {
  logger.debug("Incoming request", { method: req.method, path: req.path });
  next();
});

// OAuth 2.0 Protected Resource Metadata (RFC 9728), as expected by MCP clients
// implementing the MCP authorization spec: tells clients which authorization
// server (IdP) to obtain tokens from before calling this MCP server.
app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: config.resourceUrl,
    authorization_servers: [config.oauth.issuer],
    bearer_methods_supported: ["header"],
    ...(config.oauth.scopesSupported.length > 0
      ? { scopes_supported: config.oauth.scopesSupported }
      : {}),
  });
});

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

app.post("/mcp", authenticateProtectedMethods, async (req, res) => {
  const user = req.user!;
  logger.debug("Dispatching MCP request", { key: user.key, body: req.body });
  try {
    const server = createMcpServerForUser(user);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    logger.debug("Completed MCP request", { key: user.key });
  } catch (err) {
    logger.error("Error handling MCP request", {
      key: user.key,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Stateless server: no server-initiated streams (GET) or session teardown (DELETE) to support.
app.get("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. This server runs in stateless mode." },
    id: null,
  });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. This server runs in stateless mode." },
    id: null,
  });
});

app.listen(config.port, () => {
  logger.info(`Dummy OAuth-protected MCP server listening on http://localhost:${config.port}/mcp`);
  logger.info(`IdP issuer: ${config.oauth.issuer}`);
  logger.info(`Log level: ${config.logLevel}`);
});
