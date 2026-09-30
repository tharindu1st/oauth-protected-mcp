export interface Insight {
  id: string;
  title: string;
  body: string;
  tags: string[];
  /** Owner key (matches the configured OAUTH_USER_CLAIM value, e.g. an email) */
  owner: string;
  /** "private" -> only the owner can see it. "public" -> visible to every authenticated user. */
  visibility: "private" | "public";
}

/**
 * Dummy dataset. Each record is attributed to a different (fake) analyst so
 * that authorization/filtering by authenticated user has something to bite on.
 * "user@example.com" is seeded as an owner so the tool works out of the box
 * for a primary dev user; swap/add owners to match real IdP subjects.
 */
export const insights: Insight[] = [
  {
    id: "quality-driven-equities",
    title: "Quality-Focused Equity Strategy",
    body:
      "Targets established companies with strong balance sheets, high return on equity (ROE), " +
      "low leverage, and durable competitive advantages, favoring resilience over speculative growth.",
    tags: ["equities", "strategy", "quality"],
    owner: "user@example.com",
    visibility: "private",
  },
  {
    id: "broad-asset-allocation",
    title: "Diversified Asset Allocation",
    body:
      "Spreads client capital across public equities, fixed income, real estate, private equity, " +
      "and hedge funds to balance risk and return across market cycles.",
    tags: ["asset-allocation", "diversification"],
    owner: "user@example.com",
    visibility: "private",
  },
  {
    id: "in-house-and-sub-advised-management",
    title: "Internal & External Manager Blend",
    body:
      "Manages core fixed income and equity portfolios with an internal team while engaging " +
      "specialized outside managers for alternative and niche strategies.",
    tags: ["operations", "management"],
    owner: "alice@example.com",
    visibility: "private",
  },
  {
    id: "focus-on-fundamentals",
    title: "Market Outlook: Focus on Fundamentals",
    body:
      "Views corporate earnings growth, labor productivity, and capital expenditures as the " +
      "primary long-term drivers of stock performance.",
    tags: ["market-outlook", "fundamentals"],
    owner: "alice@example.com",
    visibility: "private",
  },
  {
    id: "perspective-on-volatility",
    title: "Perspective on Volatility",
    body:
      "Recommends staying invested through seasonal market swings or short-term policy changes, " +
      "cautioning against attempting to time short-term market fluctuations.",
    tags: ["market-outlook", "volatility", "risk"],
    owner: "bob@example.com",
    visibility: "private",
  },
  {
    id: "glossary-note",
    title: "Glossary Note: Fund vs. Firm",
    body:
      "A 'fund' is a pooled investment vehicle with its own strategy and term; a 'firm' is the " +
      "management company that sponsors and advises one or more funds. The two are legally distinct.",
    tags: ["disambiguation", "reference"],
    owner: "bob@example.com",
    visibility: "public",
  },
];

export function listInsightsForUser(userKey: string): Insight[] {
  return insights.filter((i) => i.owner === userKey || i.visibility === "public");
}

export function getInsightForUser(userKey: string, id: string): Insight | undefined {
  const insight = insights.find((i) => i.id === id);
  if (!insight) return undefined;
  if (insight.owner !== userKey && insight.visibility !== "public") return undefined;
  return insight;
}

export function searchInsightsForUser(userKey: string, query: string): Insight[] {
  const q = query.toLowerCase();
  return listInsightsForUser(userKey).filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      i.body.toLowerCase().includes(q) ||
      i.tags.some((t) => t.toLowerCase().includes(q)),
  );
}
