import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { config } from "./config.js";
import { logger } from "./logger.js";

export interface AuthenticatedUser {
  /** Value used to key/filter the dummy dataset (email claim, falls back to sub) */
  key: string;
  subject: string;
  scopes: string[];
  claims: JWTPayload;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let discoveredJwksUri: string | undefined;

async function resolveJwksUri(): Promise<string> {
  if (config.oauth.jwksUri) return config.oauth.jwksUri;
  if (discoveredJwksUri) return discoveredJwksUri;

  const discoveryUrl = new URL(
    ".well-known/openid-configuration",
    config.oauth.issuer.endsWith("/") ? config.oauth.issuer : `${config.oauth.issuer}/`,
  );

  logger.debug("Discovering JWKS URI via OIDC metadata", { discoveryUrl: discoveryUrl.toString() });
  const res = await fetch(discoveryUrl, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    logger.error("OIDC discovery request failed", {
      discoveryUrl: discoveryUrl.toString(),
      status: res.status,
      statusText: res.statusText,
    });
    throw new Error(
      `Failed to discover JWKS URI from ${discoveryUrl}: ${res.status} ${res.statusText}. ` +
        "Set OAUTH_JWKS_URI explicitly if your IdP does not expose OIDC discovery.",
    );
  }
  const metadata = (await res.json()) as { jwks_uri?: string };
  if (!metadata.jwks_uri) {
    throw new Error(`OIDC discovery document at ${discoveryUrl} did not include a jwks_uri`);
  }
  discoveredJwksUri = metadata.jwks_uri;
  logger.debug("Discovered JWKS URI", { jwksUri: discoveredJwksUri });
  return discoveredJwksUri;
}

async function getJwks() {
  if (jwks) return jwks;
  const uri = await resolveJwksUri();
  jwks = createRemoteJWKSet(new URL(uri));
  return jwks;
}

function scopesFromClaims(claims: JWTPayload): string[] {
  const raw = (claims as Record<string, unknown>).scope ?? (claims as Record<string, unknown>).scp;
  if (typeof raw === "string") return raw.split(/\s+/).filter(Boolean);
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string");
  return [];
}

function protectedResourceMetadataUrl(): string {
  return new URL("/.well-known/oauth-protected-resource", config.resourceUrl).toString();
}

function sendUnauthorized(res: Response, error: string, description: string) {
  res.setHeader(
    "WWW-Authenticate",
    `Bearer realm="mcp", error="${error}", error_description="${description}", ` +
      `resource_metadata="${protectedResourceMetadataUrl()}"`,
  );
  res.status(401).json({
    error,
    error_description: description,
  });
}

/** Express middleware that validates the OAuth bearer token against the configured IdP. */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  logger.debug("Received Authorization header", { path: req.path, authorizationHeader: header });

  if (!header || !header.startsWith("Bearer ")) {
    logger.debug("Rejecting request: missing or malformed Authorization header", { path: req.path });
    sendUnauthorized(res, "invalid_request", "Missing Bearer token in Authorization header");
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  logger.debug("Verifying bearer token", {
    path: req.path,
    token,
    issuer: config.oauth.issuer,
    audience: config.oauth.audience,
  });

  try {
    const keyset = await getJwks();
    const { payload } = await jwtVerify(token, keyset, {
      issuer: config.oauth.issuer,
      audience: config.oauth.audience,
    });
    logger.debug("Validation step: signature/issuer/audience verified", {
      sub: payload.sub,
      iss: payload.iss,
      aud: payload.aud,
      exp: payload.exp,
    });

    const scopes = scopesFromClaims(payload);
    logger.debug("Validation step: scopes extracted from claims", {
      sub: payload.sub,
      scopes,
      requiredScopes: config.oauth.requiredScopes,
    });
    if (config.oauth.requiredScopes.length > 0) {
      const missing = config.oauth.requiredScopes.filter((s) => !scopes.includes(s));
      if (missing.length > 0) {
        logger.debug("Rejecting request: insufficient scope", {
          sub: payload.sub,
          required: config.oauth.requiredScopes,
          present: scopes,
          missing,
        });
        res.status(403).json({
          error: "insufficient_scope",
          error_description: `Missing required scope(s): ${missing.join(", ")}`,
        });
        return;
      }
      logger.debug("Validation step: required scopes satisfied", { sub: payload.sub });
    }

    const claims = payload as Record<string, unknown>;
    const key =
      config.oauth.overrideUserKey ??
      (typeof claims[config.oauth.userClaim] === "string"
        ? (claims[config.oauth.userClaim] as string)
        : undefined) ??
      payload.sub;

    if (!key) {
      logger.warn("Rejecting request: token missing configured user claim and sub", {
        userClaim: config.oauth.userClaim,
      });
      sendUnauthorized(
        res,
        "invalid_token",
        `Token is missing both the configured user claim "${config.oauth.userClaim}" and "sub"`,
      );
      return;
    }

    req.user = { key, subject: payload.sub ?? key, scopes, claims: payload };
    logger.debug("Authenticated request", { key, subject: req.user.subject, scopes });
    next();
  } catch (err) {
    const description = err instanceof Error ? err.message : "Token verification failed";
    logger.debug("Rejecting request: token verification failed", { path: req.path, reason: description });
    sendUnauthorized(res, "invalid_token", description);
  }
}

export { protectedResourceMetadataUrl };
