import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthenticatedUser } from "./auth.js";
import { getInsightForUser, listInsightsForUser, searchInsightsForUser } from "./data.js";
import { logger } from "./logger.js";

/**
 * Builds a fresh MCP server instance scoped to a single authenticated user.
 * All tool results are filtered/derived from `user.key` so one user can never
 * see another user's private data.
 */
export function createMcpServerForUser(user: AuthenticatedUser): McpServer {
  const server = new McpServer({
    name: "oauth-protected-dummy-mcp-server",
    version: "0.1.0",
  });

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description: "Returns the identity the MCP server resolved from your access token.",
      inputSchema: {},
    },
    async () => {
      logger.debug("Tool call: whoami", { key: user.key });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ key: user.key, subject: user.subject, scopes: user.scopes }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_insights",
    {
      title: "List investment insights",
      description:
        "Lists the investment insight records visible to the authenticated user " +
        "(records they own, plus any marked public).",
      inputSchema: {},
    },
    async () => {
      const items = listInsightsForUser(user.key).map(({ id, title, tags, visibility }) => ({
        id,
        title,
        tags,
        visibility,
      }));
      logger.debug("Tool call: list_insights", { key: user.key, count: items.length });
      return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
    },
  );

  server.registerTool(
    "get_insight",
    {
      title: "Get investment insight",
      description: "Fetches a single investment insight by id, if visible to the authenticated user.",
      inputSchema: { id: z.string().describe("Insight id, as returned by list_insights") },
    },
    async ({ id }) => {
      const insight = getInsightForUser(user.key, id);
      if (!insight) {
        logger.debug("Tool call: get_insight (not found or denied)", { key: user.key, id });
        return {
          isError: true,
          content: [{ type: "text", text: `No insight "${id}" found (or you do not have access to it).` }],
        };
      }
      logger.debug("Tool call: get_insight", { key: user.key, id });
      return { content: [{ type: "text", text: JSON.stringify(insight, null, 2) }] };
    },
  );

  server.registerTool(
    "search_insights",
    {
      title: "Search investment insights",
      description: "Full-text search over the insight records visible to the authenticated user.",
      inputSchema: { query: z.string().min(1).describe("Search text, matched against title/body/tags") },
    },
    async ({ query }) => {
      const items = searchInsightsForUser(user.key, query);
      logger.debug("Tool call: search_insights", { key: user.key, query, count: items.length });
      return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
    },
  );

  return server;
}
