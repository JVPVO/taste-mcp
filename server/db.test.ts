import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as DatabaseModule from "./db";

let testDirectory: string;
let databasePath: string;
let db: typeof DatabaseModule;
let server: { fetch(request: Request): Response | Promise<Response> };

beforeAll(async () => {
  testDirectory = await mkdtemp(join(tmpdir(), "taste-delete-test-"));
  databasePath = join(testDirectory, "taste.sqlite");
  process.env.DATABASE_PATH = databasePath;
  db = await import("./db");
  server = (await import("./index")).default;
});

afterAll(async () => {
  await rm(testDirectory, { recursive: true, force: true });
});

describe("bookmark deletion", () => {
  test("removes the SQLite row and associated local X media", async () => {
    const mediaDirectory = join(testDirectory, "media");
    const mediaPath = join(mediaDirectory, "x-999.jpg");
    await mkdir(mediaDirectory, { recursive: true });
    await Bun.write(mediaPath, "test-media");

    const item = db.createItem({
      title: "Temporary X bookmark",
      url: "https://x.com/test/status/999",
      description: "Deletion integration fixture",
      imageUrl: "/media/x-999.jpg",
      categories: ["testing"],
      tags: ["delete"],
      kind: "reference",
      status: "pending",
      prod: "Não revisado",
      favorability: "Não revisado",
      sourceMetadata: {
        provider: "x",
        postId: "999",
        handle: "test",
        authorName: "Test",
        text: "fixture",
        publishedAt: null,
        capturedAt: new Date().toISOString(),
        originalMediaUrl: null,
        localMediaUrl: "/media/x-999.jpg",
      },
    });

    const response = await server.fetch(new Request(`http://localhost/api/items/${item.id}`, { method: "DELETE" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true, id: item.id });
    expect(db.listItems().some((candidate) => candidate.id === item.id)).toBe(false);
    expect(await Bun.file(mediaPath).exists()).toBe(false);
  });

  test("returns 404 without changing the library for an unknown bookmark", async () => {
    const before = db.listItems();
    const response = await server.fetch(new Request("http://localhost/api/items/999999", { method: "DELETE" }));

    expect(response.status).toBe(404);
    expect(db.listItems()).toEqual(before);
  });

  test("does not restore seed bookmarks after the library becomes empty", async () => {
    for (const item of db.listItems()) db.deleteItem(item.id);
    expect(db.listItems()).toHaveLength(0);

    const process = Bun.spawn(["bun", "-e", "const db = await import('./server/db.ts'); if (db.listItems().length !== 0) process.exit(1);"], {
      cwd: join(import.meta.dir, ".."),
      env: { ...Bun.env, DATABASE_PATH: databasePath },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(await process.exited).toBe(0);
  });
});
