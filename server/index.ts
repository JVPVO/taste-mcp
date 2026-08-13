import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateText, jsonSchema, Output } from "ai";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { streamSSE } from "hono/streaming";
import { mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import * as v from "valibot";
import { createItem, listItems, reviewItem, type GithubMetadata, type XMetadata } from "./db";

const app = new Hono();

const defaultCategories = [
  "skill",
  "component",
  "framework",
  "design",
  "frontend",
  "backend",
  "api",
  "database",
  "authentication",
  "deployment",
  "testing",
  "tool",
  "reference",
];

const EnrichmentSchema = v.object({
  title: v.string(),
  description: v.string(),
  kind: v.picklist(["skill", "component", "framework", "design", "backend", "api", "tool", "reference"]),
  categories: v.pipe(v.array(v.string()), v.maxLength(4)),
  tags: v.pipe(v.array(v.string()), v.maxLength(8)),
});

const enrichmentJsonSchema = jsonSchema<v.InferOutput<typeof EnrichmentSchema>>({
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "kind", "categories", "tags"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    kind: { type: "string", enum: ["skill", "component", "framework", "design", "backend", "api", "tool", "reference"] },
    categories: { type: "array", maxItems: 4, items: { type: "string" } },
    tags: { type: "array", maxItems: 8, items: { type: "string" } },
  },
}, {
  validate(value) {
    const result = v.safeParse(EnrichmentSchema, value);
    return result.success
      ? { success: true, value: result.output }
      : { success: false, error: new Error("O modelo retornou um rascunho inválido.") };
  },
});

const ConfigureSchema = v.object({ apiKey: v.pipe(v.string(), v.minLength(8)) });
const EnrichSchema = v.object({
  url: v.pipe(v.string(), v.url()),
  humanDescription: v.optional(v.string()),
});
const ReviewSchema = v.object({
  prod: v.picklist(["Pronto", "Experimental"]),
  favorability: v.picklist(["Recomendado", "Neutro", "Evitar"]),
});

let runtimeApiKey: string | undefined;

function getApiKey() {
  return runtimeApiKey || process.env.DEEPSEEK_API_KEY;
}

function cleanHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18_000);
}

function extractImage(html: string, pageUrl: string) {
  const tags = html.match(/<meta\s+[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/(?:property|name)=["'](?:og:image|twitter:image)(?::url)?["']/i.test(tag)) continue;
    const match = tag.match(/content=["']([^"']+)["']/i);
    if (!match) continue;
    try {
      return new URL(match[1].replaceAll("&amp;", "&"), pageUrl).href;
    } catch {
      return null;
    }
  }
  return null;
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function extractMeta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]).trim();
  }
  return null;
}

function parseXPost(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!["x.com", "twitter.com", "www.x.com", "www.twitter.com"].includes(url.hostname.toLowerCase())) return null;
  const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
  return match ? { handle: match[1], postId: match[2] } : null;
}

const databasePath = process.env.DATABASE_PATH || "data/commonplace.sqlite";
const mediaDirectory = join(dirname(databasePath), "media");
mkdirSync(mediaDirectory, { recursive: true });

async function saveRemoteMedia(remoteUrl: string | null, postId: string) {
  if (!remoteUrl) return null;
  const response = await fetch(remoteUrl, {
    headers: { "User-Agent": "CommonplaceDemo/0.1" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "";
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 15_000_000) return null;
  const filename = `x-${postId}.${extension}`;
  await Bun.write(join(mediaDirectory, filename), bytes);
  return `/media/${filename}`;
}

async function captureXPost(html: string, post: { handle: string; postId: string }) {
  const title = extractMeta(html, "og:title") || `@${post.handle} no X`;
  const text = extractMeta(html, "og:description") || extractMeta(html, "twitter:description") || "Post sem texto disponível.";
  const originalMediaUrl = extractMeta(html, "og:image") || extractMeta(html, "twitter:image");
  const localMediaUrl = await saveRemoteMedia(originalMediaUrl, post.postId);
  const metadata: XMetadata = {
    provider: "x",
    postId: post.postId,
    handle: post.handle,
    authorName: title.replace(/\s*\(@[^)]+\)\s+on X.*$/i, "").trim() || post.handle,
    text,
    publishedAt: extractMeta(html, "article:published_time"),
    capturedAt: new Date().toISOString(),
    originalMediaUrl,
    localMediaUrl,
  };
  return metadata;
}

function parseGithubRepository(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.hostname.toLowerCase() !== "github.com") return null;
  const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/, "");
  if (!owner || !repo) return null;
  return { owner, repo };
}

function scrapeGithubRepository(html: string, fallbackOwner: string, fallbackRepo: string) {
  const embedded = html.match(/<script type="application\/json" data-target="react-app\.embeddedData">([\s\S]*?)<\/script>/i);
  if (!embedded) throw new Error("Não foi possível ler este repositório público no GitHub.");

  const payload = JSON.parse(embedded[1]).payload;
  const layout = payload?.codeViewLayoutRoute;
  const about = payload?.sidebarAbout;
  if (!layout?.repo || !about) throw new Error("A página do GitHub não contém os metadados esperados.");

  const owner = layout.repo.ownerLogin || about.ownerLogin || fallbackOwner;
  const repo = layout.repo.name || about.repoName || fallbackRepo;
  const description = about.description || null;
  const readmeHtml = payload?.codeViewRepoRoute?.overview?.overviewFiles?.find(
    (file: { preferredFileType?: string }) => file.preferredFileType === "readme",
  )?.richText;
  const readme = readmeHtml ? cleanHtml(readmeHtml) : "README não disponível.";
  const topics = Array.isArray(about.topics) ? about.topics.map((topic: { name: string }) => topic.name) : [];
  const language = topics.includes("typescript") ? "TypeScript" : topics.includes("javascript") ? "JavaScript" : null;
  const license = about.repo?.license;
  const metadata: GithubMetadata = {
    provider: "github", owner, repo,
    stars: Number(about.stargazerCount) || 0, forks: Number(about.forksCount) || 0,
    language,
    license: license?.spdxId === "NOASSERTION" ? license.name : license?.spdxId || null,
    topics, updatedAt: new Date().toISOString(),
    archived: Boolean(about.repo?.isArchived), avatarUrl: about.repo?.ownerAvatarUrl || layout.repo.ownerAvatar || "",
  };
  return { repository: { name: repo, full_name: `${owner}/${repo}`, description }, readme, metadata };
}

app.get("/api/config", (c) =>
  c.json({ configured: Boolean(getApiKey()), source: runtimeApiKey ? "session" : getApiKey() ? "env" : null }),
);

app.get("/api/items", (c) => c.json({ items: listItems() }));

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.patch("/api/items/:id/review", async (c) => {
  const id = Number(c.req.param("id"));
  const parsed = v.safeParse(ReviewSchema, await c.req.json());
  if (!Number.isInteger(id) || id < 1 || !parsed.success) return c.json({ error: "Revisão inválida." }, 400);
  const item = reviewItem(id, parsed.output.prod, parsed.output.favorability);
  if (!item) return c.json({ error: "Item não encontrado." }, 404);
  return c.json({ item });
});

app.post("/api/config", async (c) => {
  const result = v.safeParse(ConfigureSchema, await c.req.json());
  if (!result.success) return c.json({ error: "Chave inválida." }, 400);
  runtimeApiKey = result.output.apiKey;
  return c.json({ configured: true, source: "session" });
});

app.post("/api/enrich", async (c) => {
  const parsed = v.safeParse(EnrichSchema, await c.req.json());
  if (!parsed.success) return c.json({ error: "Informe uma URL válida." }, 400);

  return streamSSE(c, async (stream) => {
    const send = (event: string, data: unknown) =>
      stream.writeSSE({ event, data: JSON.stringify(data) });

    try {
      const github = parseGithubRepository(parsed.output.url);
      const xPost = parseXPost(parsed.output.url);
      await send("progress", { step: "fetch", label: github ? "Lendo o repositório" : xPost ? "Capturando o post" : "Buscando a página", detail: github ? `${github.owner}/${github.repo} no GitHub` : xPost ? `@${xPost.handle} no X` : new URL(parsed.output.url).hostname });
      const pagePromise = fetch(parsed.output.url, {
        headers: { "User-Agent": "CommonplaceDemo/0.1 (+local enrichment demo)" },
        signal: AbortSignal.timeout(12_000),
      });
      const response = await pagePromise;
      if (!response.ok) throw new Error(`A página respondeu ${response.status}.`);
      const html = await response.text();
      const githubData = github ? scrapeGithubRepository(html, github.owner, github.repo) : null;
      const xData = xPost ? await captureXPost(html, xPost) : null;
      const imageUrl = githubData
        ? `https://opengraph.githubassets.com/commonplace/${githubData.repository.full_name}`
        : xData?.localMediaUrl || extractImage(html, parsed.output.url);

      await send("progress", { step: "extract", label: githubData ? "Lendo README e metadados" : xData ? "Guardando uma cópia local" : "Separando o conteúdo útil", detail: githubData ? `${githubData.metadata.stars.toLocaleString("pt-BR")} stars · ${githubData.metadata.language || "linguagem mista"}` : xData ? `${xData.text.length} caracteres${xData.localMediaUrl ? " · mídia salva" : ""}` : `${Math.round(html.length / 1024)} KB recebidos` });
      const content = githubData
        ? `Repositório: ${githubData.repository.full_name}\nDescrição: ${githubData.repository.description || "sem descrição"}\nLinguagem: ${githubData.metadata.language || "não informada"}\nLicença: ${githubData.metadata.license || "não informada"}\nTópicos: ${githubData.metadata.topics.join(", ") || "nenhum"}\nStars: ${githubData.metadata.stars}\nForks: ${githubData.metadata.forks}\nArquivado: ${githubData.metadata.archived ? "sim" : "não"}\n\nREADME:\n${githubData.readme}`
        : xData
          ? `Post de ${xData.authorName} (@${xData.handle})\nPublicado em: ${xData.publishedAt || "data não disponível"}\nTexto preservado localmente:\n${xData.text}`
        : cleanHtml(html);
      if (!content) throw new Error("Não foi possível extrair texto da página.");
      const key = getApiKey();
      await send("progress", {
        step: "model",
        label: key ? "DeepSeek está lendo" : "Executando demonstração",
        detail: key ? "Gerando descrição e categorias" : "Configure uma chave para usar o modelo real",
      });

      let item: v.InferOutput<typeof EnrichmentSchema>;

      if (key) {
        const deepseek = createDeepSeek({ apiKey: key });
        const result = await generateText({
          model: deepseek("deepseek-v4-flash"),
          output: Output.object({ schema: enrichmentJsonSchema }),
          system: `Você cataloga referências para desenvolvimento de software. Responda em português. Prefira categorias existentes: ${defaultCategories.join(", ")}. Crie no máximo uma categoria nova e apenas quando necessário. Nunca avalie se algo está pronto para produção e nunca dê favorabilidade; isso é decisão humana.`,
          prompt: `URL: ${parsed.output.url}\nObservação humana: ${parsed.output.humanDescription || "nenhuma"}\n\nConteúdo extraído:\n${content}`,
        });
        item = result.output;
      } else {
        const hostname = new URL(parsed.output.url).hostname.replace(/^www\./, "");
        item = githubData ? {
          title: githubData.repository.full_name,
          description: parsed.output.humanDescription || githubData.repository.description || "Repositório selecionado para a biblioteca.",
          kind: "tool",
          categories: ["tool", "reference"],
          tags: [...githubData.metadata.topics, githubData.metadata.language?.toLowerCase()].filter((tag): tag is string => Boolean(tag)).slice(0, 8),
        } : {
          title: hostname.includes("shadcn") ? "shadcn/ui" : hostname.split(".")[0] || "Nova referência",
          description: parsed.output.humanDescription || "Uma referência selecionada para a biblioteca. Conecte o DeepSeek para gerar uma descrição baseada no conteúdo completo da página.",
          kind: hostname.includes("ui") ? "component" : "tool",
          categories: hostname.includes("ui") ? ["component", "design", "frontend"] : ["tool", "reference"],
          tags: hostname.includes("shadcn") ? ["react", "tailwind", "acessibilidade"] : [hostname],
        };
      }

      await send("progress", { step: "validate", label: "Validando a resposta", detail: "Valibot conferiu a estrutura" });
      const validated = v.parse(EnrichmentSchema, item);
      await send("progress", { step: "save", label: "Preparando para sua revisão", detail: "Campos humanos continuam em branco" });
      const stored = createItem({
        ...validated,
        url: parsed.output.url,
        imageUrl,
        sourceMetadata: githubData?.metadata || xData || null,
        status: "pending",
        prod: "Não revisado",
        favorability: "Não revisado",
      });
      await send("complete", { item: stored, demo: !key });
    } catch (error) {
      await send("error", { message: error instanceof Error ? error.message : "Falha inesperada." });
    }
  });
});

app.use("/assets/*", async (c, next) => {
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  await next();
});
app.use("/assets/*", serveStatic({ root: "./dist" }));
app.get("/media/:filename", async (c) => {
  const filename = basename(c.req.param("filename"));
  if (!/^x-\d+\.(?:jpg|png|webp)$/.test(filename)) return new Response("Not found", { status: 404 });
  const file = Bun.file(join(mediaDirectory, filename));
  return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
});
app.get("*", serveStatic({ path: "./dist/index.html" }));

const port = Number(process.env.PORT || 8787);
console.log(`Commonplace com Bun + SQLite em http://localhost:${port}`);

export default { hostname: "0.0.0.0", port, fetch: app.fetch };
