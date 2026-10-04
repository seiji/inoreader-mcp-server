import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { expectedArticles, userInfo } from "./fixtures/inoreader.js";

let client: Client | undefined;
let transport: StdioClientTransport | undefined;
let stderr = "";

async function connect(env: Record<string, string> = {}) {
  client = new Client({ name: "contract-tests", version: "1.0.0" });
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--preload",
      fileURLToPath(new URL("./fixtures/server-preload.ts", import.meta.url)),
      fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    ],
    env: {
      INOREADER_ACCESS_TOKEN: "fixture-token",
      INOREADER_APP_ID: "fixture-app",
      INOREADER_APP_KEY: "fixture-key",
      INOREADER_API_BASE_URL: "https://api.example.invalid/reader/api/0",
      ...env,
    },
    stderr: "pipe",
  });
  stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  await client.connect(transport);
  return client;
}

afterEach(async () => {
  try {
    await client?.close();
  } finally {
    await transport?.close();
    client = undefined;
    transport = undefined;
  }
  expect(stderr).not.toContain("UNEXPECTED_API_CALL");
});

async function call(name: string, args: Record<string, unknown> = {}) {
  if (!client) throw new Error("Client is not connected");
  return CallToolResultSchema.parse(
    await client.callTool({ name, arguments: args }),
  );
}

function payload(
  result: ReturnType<typeof CallToolResultSchema.parse>,
): unknown {
  expect(result.content).toHaveLength(1);
  const content = result.content[0];
  if (content?.type !== "text") throw new Error("Expected a text response");
  return JSON.parse(content.text);
}

const toolNames = [
  "auth_login",
  "auth_complete",
  "auth_status",
  "auth_logout",
  "get_user_info",
  "get_unread_counts",
  "get_subscriptions",
  "get_folders_and_tags",
  "get_articles",
  "get_starred_articles",
  "add_subscription",
  "remove_subscription",
  "mark_as_read",
  "mark_as_unread",
  "star_article",
  "unstar_article",
  "add_tag_to_article",
  "remove_tag_from_article",
  "add_subscription_to_folder",
  "remove_subscription_from_folder",
  "rename_subscription",
];

describe("MCP contract", () => {
  test("[MCP-001] initializes over stdio and lists all public tools", async () => {
    const c = await connect();
    expect(c.getServerVersion()?.name).toBe("inoreader-mcp");
    const tools = await c.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
      [...toolNames].sort(),
    );
    for (const tool of tools.tools)
      expect(tool.inputSchema.type).toBe("object");
  });

  test("[AUTH-001] environment-backed status returns no credentials", async () => {
    await connect();
    const result = await call("auth_status");
    expect(result.isError).not.toBe(true);
    expect(payload(result)).toEqual({
      authenticated: true,
      keychainAvailable: true,
      source: "environment",
    });
  });

  test("[AUTH-002] complete without a pending flow returns a JSON tool error", async () => {
    await connect();
    const result = await call("auth_complete");
    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ error: expect.any(String) });
  });

  for (const [name, expected] of [
    ["get_user_info", userInfo],
    [
      "get_unread_counts",
      { max: 1000, counts: [{ id: "feed/example", count: 2 }] },
    ],
    [
      "get_subscriptions",
      {
        count: 1,
        subscriptions: [
          {
            id: "feed/example",
            title: "Example",
            url: "https://example.invalid/rss",
            categories: ["Tech"],
          },
        ],
      },
    ],
    ["get_folders_and_tags", { folders: ["Tech"], tags: ["custom-tag"] }],
  ] as const) {
    test(`[READ-001] ${name} returns its documented JSON shape`, async () => {
      await connect();
      const result = await call(name);
      expect(result.isError).not.toBe(true);
      expect(payload(result)).toEqual(expected);
    });
  }

  for (const [name, args, env] of [
    [
      "get_articles",
      {},
      {
        TEST_STREAM: "user/-/state/com.google/reading-list",
        TEST_COUNT: "20",
        TEST_EXCLUDE: "user/-/state/com.google/read",
      },
    ],
    [
      "get_articles",
      {
        stream_id: "user/-/label/Tech",
        unread_only: false,
        count: 1,
        continuation: "previous-page",
      },
      {
        TEST_STREAM: "user/-/label/Tech",
        TEST_COUNT: "1",
        TEST_CONTINUATION: "previous-page",
        TEST_EXCLUDE: "",
      },
    ],
    [
      "get_articles",
      { unread_only: false },
      { TEST_STREAM: "user/-/state/com.google/reading-list", TEST_EXCLUDE: "" },
    ],
    [
      "get_starred_articles",
      { continuation: "previous-page" },
      {
        TEST_STREAM: "user/-/state/com.google/starred",
        TEST_COUNT: "20",
        TEST_CONTINUATION: "previous-page",
        TEST_INCLUDE: "user/-/state/com.google/read",
      },
    ],
  ] as const) {
    test(`[READ-002/003] ${name} selection ${JSON.stringify(args)}`, async () => {
      await connect(env);
      const result = await call(name, args);
      expect(result.isError).not.toBe(true);
      expect(payload(result)).toEqual({
        count: 3,
        continuation: "next-page",
        articles: expectedArticles,
      });
    });
  }

  test("[READ-004] an empty page omits continuation and returns an empty array", async () => {
    await connect({ TEST_EMPTY: "1" });
    expect(payload(await call("get_articles"))).toEqual({
      count: 0,
      articles: [],
    });
  });

  for (const args of [
    {},
    { item_ids: [] },
    { item_ids: ["item-1"], older_than: 1 },
    { item_ids: ["item-1"], stream_id: "feed/example", older_than: 1 },
  ]) {
    test(`[WRITE-001] invalid mark_as_read combination ${JSON.stringify(args)} has no API effect`, async () => {
      await connect({ TEST_API_MODE: "forbidden" });
      const result = await call("mark_as_read", args);
      expect(result.isError).toBe(true);
      expect(payload(result)).toMatchObject({ error: expect.any(String) });
    });
  }

  for (const count of [0, 101]) {
    test(`[INPUT-001] out-of-range article count ${count} is rejected before API access`, async () => {
      await connect({ TEST_API_MODE: "forbidden" });
      // SDK validation errors use isError, but their text is not application JSON.
      const result = await call("get_articles", { count });
      expect(result.isError).toBe(true);
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.any(String),
      });
    });
  }

  const writes: Array<[string, Record<string, unknown>]> = [
    ["add_subscription", { feed_url: "https://example.invalid/rss" }],
    ["remove_subscription", { subscription_id: "feed/example" }],
    ["mark_as_read", { item_ids: ["item-1", "item-2"] }],
    ["mark_as_read", { stream_id: "feed/example", older_than: 1700000000 }],
    ["mark_as_unread", { item_ids: ["item-1"] }],
    ["star_article", { item_id: "item-1" }],
    ["unstar_article", { item_id: "item-1" }],
    ["add_tag_to_article", { item_id: "item-1", tag_name: "Tech" }],
    ["remove_tag_from_article", { item_id: "item-1", tag_name: "Tech" }],
    [
      "add_subscription_to_folder",
      { subscription_id: "feed/example", folder_name: "Tech" },
    ],
    [
      "remove_subscription_from_folder",
      { subscription_id: "feed/example", folder_name: "Tech" },
    ],
    [
      "rename_subscription",
      { subscription_id: "feed/example", title: "New title" },
    ],
  ];
  for (const [name, args] of writes) {
    test(`[WRITE-002] ${name} reports a successful mutation ${JSON.stringify(args)}`, async () => {
      await connect();
      const result = await call(name, args);
      expect(result.isError).not.toBe(true);
      expect(payload(result)).toMatchObject({ success: true });
    });
  }

  test("[ERROR-001] API failure becomes a JSON tool error", async () => {
    await connect({ TEST_API_MODE: "error" });
    const result = await call("get_user_info");
    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({
      error: expect.stringContaining("500"),
    });
  });

  test("[ERROR-002] unauthenticated reads fail without calling the API", async () => {
    await connect({ INOREADER_ACCESS_TOKEN: "", TEST_API_MODE: "forbidden" });
    const result = await call("get_articles");
    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({
      error: expect.stringContaining("Not authenticated"),
    });
  });
});
