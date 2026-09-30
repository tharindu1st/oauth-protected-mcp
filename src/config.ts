import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

const VALID_LOG_LEVELS = ["error", "warn", "info", "debug"] as const;
type LogLevel = (typeof VALID_LOG_LEVELS)[number];

function resolveLogLevel(): LogLevel {
  // DEBUG=true is a convenience shorthand for LOG_LEVEL=debug.
  if ((process.env.DEBUG ?? "").toLowerCase() === "true") return "debug";
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return (VALID_LOG_LEVELS as readonly string[]).includes(raw) ? (raw as LogLevel) : "info";
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  resourceUrl: process.env.MCP_RESOURCE_URL ?? "http://localhost:3000",
  /** Log verbosity: error|warn|info|debug (default "info"). DEBUG=true forces "debug". */
  logLevel: resolveLogLevel(),

  oauth: {
    issuer: required("OAUTH_ISSUER", "https://localhost:9443/oauth2/token"),
    jwksUri: optional("OAUTH_JWKS_URI"),
    audience: optional("OAUTH_AUDIENCE"),
    userClaim: process.env.OAUTH_USER_CLAIM ?? "email",
    requiredScopes: (process.env.OAUTH_REQUIRED_SCOPES ?? "")
      .split(/\s+/)
      .filter(Boolean),
    /**
     * Scopes advertised in OAuth Protected Resource Metadata (RFC 9728) via
     * `scopes_supported`. MCP clients that honor this field request only
     * these scopes; clients that ignore it fall back to the authorization
     * server's own `scopes_supported`, which on Okta includes the mutually
     * exclusive `device_sso`/`interclient_access` system scopes and fails
     * with "scopes cannot be requested together". Defaulting this list
     * (rather than leaving it empty) avoids that fallback.
     */
    scopesSupported: (
      process.env.OAUTH_SCOPES_SUPPORTED ?? "openid profile email offline_access"
    )
      .split(/\s+/)
      .filter(Boolean),
    /**
     * Dev/test escape hatch: when set, every validated token is treated as
     * this user for data filtering purposes, regardless of its claims. Lets
     * you exercise per-user filtering with tokens that carry no per-user
     * identity (e.g. an Asgardeo client-credentials/application token).
     * The token must still be a valid, signed token from the configured
     * IdP — this only changes identity resolution, not authentication.
     * Never set this in a real deployment serving real users.
     */
    overrideUserKey: optional("OAUTH_OVERRIDE_USER_KEY"),
  },
};
