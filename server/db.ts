import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

export type StoredItem = {
  id: number;
  title: string;
  url: string;
  description: string;
  imageUrl: string | null;
  categories: string[];
  tags: string[];
  kind: string;
  status: "reviewed" | "pending";
  prod: "Pronto" | "Experimental" | "Não revisado";
  favorability: "Recomendado" | "Neutro" | "Evitar" | "Não revisado";
  sourceMetadata: GithubMetadata | XMetadata | null;
};

export type GithubMetadata = {
  provider: "github";
  owner: string;
  repo: string;
  stars: number;
  forks: number;
  language: string | null;
  license: string | null;
  topics: string[];
  updatedAt: string;
  archived: boolean;
  avatarUrl: string;
};

export type XMetadata = {
  provider: "x";
  postId: string;
  handle: string;
  authorName: string;
  text: string;
  publishedAt: string | null;
  capturedAt: string;
  originalMediaUrl: string | null;
  localMediaUrl: string | null;
};

const databasePath = process.env.DATABASE_PATH || "data/commonplace.sqlite";
mkdirSync(databasePath.includes("/") ? databasePath.slice(0, databasePath.lastIndexOf("/")) : ".", { recursive: true });

const db = new Database(databasePath, { create: true, strict: true });
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA synchronous = NORMAL;");
db.run("PRAGMA foreign_keys = ON;");
db.run("PRAGMA busy_timeout = 5000;");

db.run(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    categories TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '[]',
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    prod TEXT NOT NULL DEFAULT 'Não revisado',
    favorability TEXT NOT NULL DEFAULT 'Não revisado',
    source_metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;
`);
const itemColumns = db.query<{ name: string }, []>("PRAGMA table_info(items)").all();
if (!itemColumns.some((column) => column.name === "source_metadata")) {
  db.run("ALTER TABLE items ADD COLUMN source_metadata TEXT;");
}
db.run("CREATE INDEX IF NOT EXISTS items_created_at_idx ON items(created_at DESC);");
db.run("CREATE INDEX IF NOT EXISTS items_status_idx ON items(status);");

type Row = Omit<StoredItem, "imageUrl" | "categories" | "tags" | "sourceMetadata"> & {
  image_url: string | null;
  categories: string;
  tags: string;
  source_metadata: string | null;
};

const selectAll = db.query<Row, []>(`
  SELECT id, title, url, description, image_url, categories, tags, kind, status, prod, favorability, source_metadata
  FROM items ORDER BY id DESC
`);

const insertItem = db.query(`
  INSERT INTO items (title, url, description, image_url, categories, tags, kind, status, prod, favorability, source_metadata)
  VALUES ($title, $url, $description, $imageUrl, $categories, $tags, $kind, $status, $prod, $favorability, $sourceMetadata)
  RETURNING id
`);

const selectById = db.query<Row, [number]>(`
  SELECT id, title, url, description, image_url, categories, tags, kind, status, prod, favorability, source_metadata
  FROM items WHERE id = ?1
`);

const updateReview = db.query(`
  UPDATE items
  SET status = 'reviewed', prod = $prod, favorability = $favorability
  WHERE id = $id
`);

function fromRow(row: Row): StoredItem {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    description: row.description,
    imageUrl: row.image_url,
    categories: JSON.parse(row.categories),
    tags: JSON.parse(row.tags),
    kind: row.kind,
    status: row.status,
    prod: row.prod,
    favorability: row.favorability,
    sourceMetadata: row.source_metadata ? JSON.parse(row.source_metadata) : null,
  };
}

export function listItems() {
  return selectAll.all().map(fromRow);
}

export function createItem(item: Omit<StoredItem, "id">): StoredItem {
  const row = insertItem.get({
    title: item.title,
    url: item.url,
    description: item.description,
    imageUrl: item.imageUrl,
    categories: JSON.stringify(item.categories),
    tags: JSON.stringify(item.tags),
    kind: item.kind,
    status: item.status,
    prod: item.prod,
    favorability: item.favorability,
    sourceMetadata: item.sourceMetadata ? JSON.stringify(item.sourceMetadata) : null,
  }) as { id: number };
  return { id: row.id, ...item };
}

export function reviewItem(id: number, prod: StoredItem["prod"], favorability: StoredItem["favorability"]) {
  updateReview.run({ id, prod, favorability });
  const row = selectById.get(id);
  return row ? fromRow(row) : null;
}

const seeds: Array<Omit<StoredItem, "id">> = [
  { title: "shadcn/ui", url: "https://ui.shadcn.com", description: "Componentes acessíveis que você copia para o projeto e adapta sem depender de uma biblioteca fechada.", imageUrl: "https://ui.shadcn.com/og?title=The%20Foundation%20for%20your%20Design%20System", categories: ["component", "design", "frontend"], tags: ["react", "tailwind"], kind: "component", status: "reviewed", prod: "Pronto", favorability: "Recomendado", sourceMetadata: null },
  { title: "Hono", url: "https://hono.dev", description: "Framework web pequeno e rápido que funciona em Workers, Bun, Node e outros runtimes.", imageUrl: "https://hono.dev/images/hono-title.png", categories: ["framework", "backend", "api"], tags: ["typescript", "edge"], kind: "framework", status: "reviewed", prod: "Pronto", favorability: "Recomendado", sourceMetadata: null },
  { title: "Motion", url: "https://motion.dev", description: "Biblioteca de animação para interfaces React com gestos, layout transitions e presença.", imageUrl: "https://images.motion.dev/og/fresh/v1/site/home-3jhn8b0abpu66.png", categories: ["component", "design", "frontend"], tags: ["animation", "react"], kind: "tool", status: "pending", prod: "Não revisado", favorability: "Não revisado", sourceMetadata: null },
  { title: "Valibot", url: "https://valibot.dev", description: "Schemas modulares e type-safe para validar dados em runtime com bundle pequeno.", imageUrl: "https://valibot.dev/og/index.png", categories: ["tool", "backend", "frontend"], tags: ["validation", "typescript"], kind: "tool", status: "reviewed", prod: "Pronto", favorability: "Recomendado", sourceMetadata: null },
];

if ((db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM items").get()?.count ?? 0) === 0) {
  db.transaction(() => seeds.forEach(createItem))();
}
