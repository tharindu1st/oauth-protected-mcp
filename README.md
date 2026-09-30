# oauth-protected-mcp-server

A dummy MCP server (Streamable HTTP transport) that:

- Requires a valid OAuth2/OIDC access token (`Authorization: Bearer <token>`) on every call,
  verified against an IdP configured entirely via environment variables — no IdP-specific code.
- Publishes OAuth 2.0 Protected Resource Metadata at `/.well-known/oauth-protected-resource`
  (RFC 9728 / MCP authorization spec) so compliant MCP clients can discover which IdP to log in to.
- Exposes a small dummy dataset of "investment insight" records and filters what each caller
  can see based on the identity extracted from their token — callers only see records they
  own, plus any marked `public`.

## Tools

| Tool               | Description                                                         |
|---------------------|----------------------------------------------------------------------|
| `whoami`            | Returns the identity resolved from the caller's access token.       |
| `list_insights`     | Lists insight records visible to the caller.                        |
| `get_insight`       | Fetches one insight by id (403/not-found if not visible to caller). |
| `search_insights`   | Keyword search over the caller's visible insights.                  |

Data and per-user ownership live in `src/data.ts` — edit the `owner` fields to match real
subjects/emails issued by your IdP.

## Configuration (environment variables)

See `.env.example`. Any standard OIDC IdP works (WSO2 Identity Server, Asgardeo, Auth0,
Keycloak, Okta, ...):

- `OAUTH_ISSUER` — issuer URL of the IdP that mints access tokens for this server.
- `OAUTH_JWKS_URI` — optional; auto-discovered from `${OAUTH_ISSUER}/.well-known/openid-configuration` if unset.
- `OAUTH_AUDIENCE` — optional expected `aud` claim.
- `OAUTH_USER_CLAIM` — which JWT claim identifies the user for data filtering (default `email`, falls back to `sub`).
- `OAUTH_REQUIRED_SCOPES` — optional space-separated scopes required to call any tool.
- `MCP_RESOURCE_URL` — this server's own public URL (used in the protected-resource metadata).
- `PORT` — HTTP port (default `3000`).
- `LOG_LEVEL` — log verbosity: `error`, `warn`, `info`, or `debug` (default `info`). `debug`
  logs per-request auth decisions (token verification, scope checks, resolved identity) and
  tool-call details — structured JSON lines on stdout/stderr.
- `DEBUG` — shorthand; set to `true` to force `debug`-level logging regardless of `LOG_LEVEL`.

## Run

```bash
cp .env.example .env   # then fill in OAUTH_ISSUER etc. for your IdP
npm install
npm run dev             # or: npm run build && npm start
```

The server listens on `POST http://localhost:<PORT>/mcp` (stateless Streamable HTTP — one
request/response per call, no session persistence). Point any MCP client that supports
Streamable HTTP + OAuth at that URL.

## Notes

- This is a POC: the dataset lives in memory (`src/data.ts`), and a fresh `McpServer` instance
  is created per request, scoped to the caller's identity — simple and safe, but not optimized
  for high request volume.
- Swap in your real IdP by only changing environment variables; no code changes needed as long
  as it's OIDC-compliant and issues JWT access tokens.
