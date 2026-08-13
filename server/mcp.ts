import { createMcpHandler, McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { StoredItem } from "./db";

export type TasteItemSource = () => StoredItem[];

const SourceMetadataSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("github"),
    owner: z.string(),
    repo: z.string(),
    stars: z.number().nonnegative(),
    forks: z.number().nonnegative(),
    language: z.string().nullable(),
    license: z.string().nullable(),
    topics: z.array(z.string()),
    updatedAt: z.string(),
    archived: z.boolean(),
    avatarUrl: z.string(),
  }),
  z.object({
    provider: z.literal("x"),
    postId: z.string(),
    handle: z.string(),
    authorName: z.string(),
    text: z.string(),
    publishedAt: z.string().nullable(),
    capturedAt: z.string(),
    originalMediaUrl: z.string().nullable(),
    localMediaUrl: z.string().nullable(),
  }),
]).nullable();

const TasteItemSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  url: z.url(),
  description: z.string(),
  kind: z.string(),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  status: z.enum(["reviewed", "pending"]),
  productionReadiness: z.enum(["Pronto", "Experimental", "Não revisado"]),
  favorability: z.enum(["Recomendado", "Neutro", "Evitar", "Não revisado"]),
  sourceMetadata: SourceMetadataSchema,
});

const SearchResultItemSchema = TasteItemSchema.extend({
  score: z.number(),
  whyMatched: z.array(z.string()),
});

const SearchResultSchema = z.object({
  query: z.string(),
  totalMatches: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
  guidance: z.string(),
  items: z.array(SearchResultItemSchema),
});

const CategorySchema = z.object({
  name: z.string(),
  count: z.number().int().nonnegative(),
  reviewed: z.number().int().nonnegative(),
  recommended: z.number().int().nonnegative(),
});

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokens(value: string) {
  return [...new Set(normalize(value).split(/[^a-z0-9+#./-]+/).filter((token) => token.length > 1))];
}

function serializeItem(item: StoredItem) {
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    description: item.description,
    kind: item.kind,
    categories: item.categories,
    tags: item.tags,
    status: item.status,
    productionReadiness: item.prod,
    favorability: item.favorability,
    sourceMetadata: item.sourceMetadata,
  };
}

function itemAsMarkdown(item: ReturnType<typeof serializeItem>, whyMatched: string[] = []) {
  const signals = [item.productionReadiness, item.favorability].filter((signal) => signal !== "Não revisado");
  const lines = [
    `### ${item.title}`,
    item.description,
    `- URL: ${item.url}`,
    `- Kind: ${item.kind}`,
    `- Categories: ${item.categories.join(", ") || "none"}`,
    `- Tags: ${item.tags.join(", ") || "none"}`,
    `- Human signals: ${signals.join(" · ") || "not reviewed"}`,
  ];
  if (whyMatched.length) lines.push(`- Why it matched: ${whyMatched.join(", ")}`);
  if (item.sourceMetadata?.provider === "github") {
    lines.push(`- GitHub snapshot: ${item.sourceMetadata.stars} stars · ${item.sourceMetadata.forks} forks · ${item.sourceMetadata.license || "license not detected"}${item.sourceMetadata.archived ? " · archived" : ""}`);
  }
  if (item.sourceMetadata?.provider === "x") {
    lines.push(`- X snapshot: @${item.sourceMetadata.handle}, captured ${item.sourceMetadata.capturedAt}`);
  }
  return lines.join("\n");
}

function matchesFilter(item: StoredItem, options: {
  categories?: string[];
  favorability?: "any" | "recommended" | "neutral" | "avoid" | "unreviewed";
  productionReadiness?: "any" | "ready" | "experimental" | "unreviewed";
}) {
  const wantedCategories = options.categories?.map(normalize) ?? [];
  if (wantedCategories.length && !wantedCategories.every((category) => item.categories.some((candidate) => normalize(candidate) === category))) {
    return false;
  }

  const favorability = {
    recommended: "Recomendado",
    neutral: "Neutro",
    avoid: "Evitar",
    unreviewed: "Não revisado",
  } as const;
  if (options.favorability && options.favorability !== "any" && item.favorability !== favorability[options.favorability]) {
    return false;
  }

  const readiness = {
    ready: "Pronto",
    experimental: "Experimental",
    unreviewed: "Não revisado",
  } as const;
  if (options.productionReadiness && options.productionReadiness !== "any" && item.prod !== readiness[options.productionReadiness]) {
    return false;
  }

  return true;
}

function scoreItem(item: StoredItem, query: string) {
  const normalizedQuery = normalize(query);
  const queryTokens = tokens(query);
  const title = normalize(item.title);
  const description = normalize(item.description);
  const url = normalize(item.url);
  const kind = normalize(item.kind);
  const categories = item.categories.map(normalize);
  const tags = item.tags.map(normalize);
  const allText = [title, description, url, kind, ...categories, ...tags].join(" ");
  const whyMatched = new Set<string>();
  let relevance = 0;

  if (normalizedQuery && title.includes(normalizedQuery)) {
    relevance += 16;
    whyMatched.add("title");
  } else if (normalizedQuery && allText.includes(normalizedQuery)) {
    relevance += 7;
    whyMatched.add("phrase");
  }

  for (const token of queryTokens) {
    if (title.includes(token)) {
      relevance += 8;
      whyMatched.add("title");
    }
    if (categories.some((category) => category.includes(token))) {
      relevance += 6;
      whyMatched.add("category");
    }
    if (tags.some((tag) => tag.includes(token))) {
      relevance += 6;
      whyMatched.add("tag");
    }
    if (kind.includes(token)) {
      relevance += 4;
      whyMatched.add("kind");
    }
    if (description.includes(token)) {
      relevance += 3;
      whyMatched.add("description");
    }
    if (url.includes(token)) {
      relevance += 1;
      whyMatched.add("URL");
    }
  }

  const curation = (item.favorability === "Recomendado" ? 3 : item.favorability === "Evitar" ? -1 : 0)
    + (item.prod === "Pronto" ? 2 : 0)
    + (item.status === "reviewed" ? 1 : 0);

  return { relevance, score: relevance * 100 + curation, whyMatched: [...whyMatched] };
}

export function searchTaste(items: StoredItem[], query: string, options: {
  categories?: string[];
  favorability?: "any" | "recommended" | "neutral" | "avoid" | "unreviewed";
  productionReadiness?: "any" | "ready" | "experimental" | "unreviewed";
  limit?: number;
}) {
  const ranked = items
    .filter((item) => matchesFilter(item, options))
    .map((item) => ({ item, ...scoreItem(item, query) }))
    .filter((entry) => entry.relevance > 0)
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title));

  return {
    totalMatches: ranked.length,
    items: ranked.slice(0, options.limit ?? 8).map((entry) => ({
      ...serializeItem(entry.item),
      score: entry.score,
      whyMatched: entry.whyMatched,
    })),
  };
}

export function createTasteMcpServer(source: TasteItemSource) {
  const server = new McpServer({ name: "taste-mcp", version: "0.2.0" });

  server.registerTool(
    "consult_taste",
    {
      title: "Consult curated development taste",
      description: "Search the human-curated bookmark library before making a development, architecture, tooling, or design decision. Results include explicit human readiness and favorability signals.",
      inputSchema: z.object({
        query: z.string().min(2).max(500).describe("Plain-text search for a problem, technology, approach, or development decision"),
        categories: z.array(z.string().min(1)).max(5).optional().describe("Require all of these exact library categories"),
        favorability: z.enum(["any", "recommended", "neutral", "avoid", "unreviewed"]).optional().describe("Filter by the curator's favorability signal"),
        productionReadiness: z.enum(["any", "ready", "experimental", "unreviewed"]).optional().describe("Filter by the curator's production-readiness signal"),
        limit: z.number().int().min(1).max(20).optional().describe("Maximum number of bookmarks to return; defaults to 8"),
      }),
      outputSchema: SearchResultSchema,
      annotations: readOnlyAnnotations,
    },
    async ({ query, categories, favorability, productionReadiness, limit }) => {
      const result = searchTaste(source(), query, { categories, favorability, productionReadiness, limit });
      const guidance = result.items.length
        ? "Use the human signals as curated opinion, inspect the linked sources when details matter, and explain when you choose against an Avoid signal."
        : "The curated library has no matching guidance. Say that taste was consulted but no relevant bookmark was found; do not invent a recommendation."
      const output = {
        query,
        totalMatches: result.totalMatches,
        returned: result.items.length,
        guidance,
        items: result.items,
      };
      const text = result.items.length
        ? `${guidance}\n\n${result.items.map((item) => itemAsMarkdown(item, item.whyMatched)).join("\n\n")}`
        : guidance;
      return { content: [{ type: "text", text }], structuredContent: output };
    },
  );

  server.registerTool(
    "get_taste_item",
    {
      title: "Get one curated bookmark",
      description: "Read one bookmark and all of its human review signals by the numeric ID returned by consult_taste or a taste resource.",
      inputSchema: z.object({ id: z.number().int().positive().describe("The bookmark's numeric ID") }),
      outputSchema: z.object({ found: z.boolean(), item: TasteItemSchema.nullable() }),
      annotations: readOnlyAnnotations,
    },
    async ({ id }) => {
      const found = source().find((item) => item.id === id);
      if (!found) {
        const output = { found: false, item: null };
        return { content: [{ type: "text", text: `No curated bookmark exists with ID ${id}.` }], structuredContent: output, isError: true };
      }
      const item = serializeItem(found);
      return { content: [{ type: "text", text: itemAsMarkdown(item) }], structuredContent: { found: true, item } };
    },
  );

  server.registerTool(
    "list_taste_categories",
    {
      title: "List taste categories",
      description: "Discover the categories available in the curated library and how many reviewed or recommended bookmarks each contains.",
      outputSchema: z.object({ categories: z.array(CategorySchema) }),
      annotations: readOnlyAnnotations,
    },
    async () => {
      const counts = new Map<string, z.infer<typeof CategorySchema>>();
      for (const item of source()) {
        for (const category of item.categories) {
          const current = counts.get(category) ?? { name: category, count: 0, reviewed: 0, recommended: 0 };
          current.count += 1;
          if (item.status === "reviewed") current.reviewed += 1;
          if (item.favorability === "Recomendado") current.recommended += 1;
          counts.set(category, current);
        }
      }
      const categories = [...counts.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
      const output = { categories };
      const text = categories.length
        ? categories.map((category) => `${category.name}: ${category.count} total, ${category.reviewed} reviewed, ${category.recommended} recommended`).join("\n")
        : "The curated library has no categories yet.";
      return { content: [{ type: "text", text }], structuredContent: output };
    },
  );

  server.registerResource(
    "taste-library",
    "taste://library",
    {
      title: "Complete taste library",
      description: "A current JSON snapshot of every curated development bookmark and its human signals.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({ items: source().map(serializeItem) }, null, 2),
      }],
    }),
  );

  server.registerResource(
    "taste-item",
    new ResourceTemplate("taste://items/{itemId}", {
      list: async () => ({
        resources: source().map((item) => ({
          uri: `taste://items/${item.id}`,
          name: item.title,
          title: item.title,
          description: item.description,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Curated bookmark",
      description: "One bookmark with categories, tags, and human review signals.",
      mimeType: "application/json",
    },
    async (uri, { itemId }) => {
      const id = Number(itemId);
      const item = source().find((candidate) => candidate.id === id);
      if (!Number.isInteger(id) || !item) throw new Error(`No curated bookmark exists at ${uri.href}.`);
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(serializeItem(item), null, 2) }],
      };
    },
  );

  server.registerPrompt(
    "make_tasteful_decision",
    {
      title: "Make a taste-guided development decision",
      description: "Ask an agent to consult the curated library before recommending an implementation, dependency, architecture, or interface direction.",
      argsSchema: z.object({
        decision: z.string().min(2).max(1_000).describe("The development decision to make"),
        constraints: z.string().max(1_000).optional().describe("Project constraints, requirements, or tradeoffs"),
      }),
    },
    ({ decision, constraints }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            `Make this development decision: ${decision}`,
            constraints ? `Constraints: ${constraints}` : null,
            "Call consult_taste before recommending anything.",
            "Treat Recomendado/Evitar and Pronto/Experimental as deliberate human signals, cite the relevant bookmark URLs, and explicitly say when the library has no applicable opinion.",
          ].filter(Boolean).join("\n\n"),
        },
      }],
    }),
  );

  return server;
}

export function createTasteMcpHandler(source: TasteItemSource) {
  return createMcpHandler(() => createTasteMcpServer(source));
}
