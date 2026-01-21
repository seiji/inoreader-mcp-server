#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { login, logout, showStatus } from "./auth.js";
import { type InoreaderClient, createClient } from "./client.js";
import type { StreamContentsResponse, StreamItem } from "./types.js";

let client: InoreaderClient | null = null;

async function getClient(): Promise<InoreaderClient> {
  if (!client) {
    client = await createClient();
  }
  return client;
}

function getArticleUrl(item: StreamItem): string {
  if (item.canonical?.[0]?.href) {
    return item.canonical[0].href;
  }
  if (item.alternate?.[0]?.href) {
    return item.alternate[0].href;
  }
  return "";
}

function formatArticle(item: StreamItem) {
  const article: Record<string, unknown> = {
    id: item.id,
    title: item.title,
    url: getArticleUrl(item),
    author: item.author ?? "",
    published: item.published ?? 0,
    isRead: item.categories.includes("user/-/state/com.google/read"),
    isStarred: item.categories.includes("user/-/state/com.google/starred"),
  };

  if (item.origin) {
    article.feedTitle = item.origin.title;
  }

  if (item.summary?.content) {
    let content = item.summary.content;
    if (content.length > 500) {
      content = `${content.slice(0, 500)}...`;
    }
    article.summary = content;
  }

  return article;
}

function handleToolError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return {
    content: [
      { type: "text" as const, text: JSON.stringify({ error: message }) },
    ],
    isError: true,
  };
}

const server = new McpServer({
  name: "inoreader-mcp",
  version: "0.1.0",
});

// Get user info
server.tool(
  "get_user_info",
  "Get authenticated Inoreader user information",
  {},
  async () => {
    try {
      const c = await getClient();
      const user = await c.getUserInfo();
      return {
        content: [{ type: "text", text: JSON.stringify(user, null, 2) }],
      };
    } catch (e) {
      return handleToolError(e);
    }
  },
);

// Get unread counts
server.tool(
  "get_unread_counts",
  "Get unread article counts for all subscriptions and tags",
  {},
  async () => {
    try {
      const c = await getClient();
      const counts = await c.getUnreadCounts();
      const result = {
        max: counts.max,
        counts: counts.unreadcounts
          .filter((c) => c.count > 0)
          .map((c) => ({ id: c.id, count: c.count })),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      return handleToolError(e);
    }
  },
);

// Get subscriptions
server.tool(
  "get_subscriptions",
  "Get list of all RSS feed subscriptions",
  {},
  async () => {
    try {
      const c = await getClient();
      const subs = await c.getSubscriptions();
      const result = {
        count: subs.subscriptions.length,
        subscriptions: subs.subscriptions.map((s) => ({
          id: s.id,
          title: s.title,
          url: s.url,
          categories: s.categories.map((c) => c.label),
        })),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      return handleToolError(e);
    }
  },
);

// Get folders and tags
server.tool(
  "get_folders_and_tags",
  "Get list of all folders and tags used for organizing feeds",
  {},
  async () => {
    try {
      const c = await getClient();
      const tags = await c.getTags();
      const folders: string[] = [];
      const userTags: string[] = [];

      for (const tag of tags.tags) {
        if (tag.id.includes("/label/")) {
          folders.push(tag.id.split("/label/").pop() ?? "");
        } else if (!tag.id.includes("/state/com.google/")) {
          userTags.push(tag.id);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ folders, tags: userTags }, null, 2),
          },
        ],
      };
    } catch (e) {
      return handleToolError(e);
    }
  },
);

// Get articles
server.tool(
  "get_articles",
  "Get articles from a feed, folder, or all subscriptions",
  {
    stream_id: z
      .string()
      .optional()
      .describe("Feed or folder ID. Leave empty for all unread articles."),
    count: z
      .number()
      .min(1)
      .max(100)
      .default(20)
      .describe("Number of articles to return (1-100)"),
    unread_only: z
      .boolean()
      .default(true)
      .describe("If true, only return unread articles"),
  },
  async ({ stream_id, count, unread_only }) => {
    try {
      const c = await getClient();
      let contents: StreamContentsResponse;

      if (stream_id) {
        contents = await c.getStreamContents(stream_id, {
          count,
          excludeTarget: unread_only
            ? "user/-/state/com.google/read"
            : undefined,
        });
      } else if (unread_only) {
        contents = await c.getUnreadItems(count);
      } else {
        contents = await c.getStreamContents(
          "user/-/state/com.google/reading-list",
          { count },
        );
      }

      const result = {
        count: contents.items.length,
        continuation: contents.continuation,
        articles: contents.items.map(formatArticle),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      return handleToolError(e);
    }
  },
);

// Get starred articles
server.tool(
  "get_starred_articles",
  "Get starred (saved) articles",
  {
    count: z
      .number()
      .min(1)
      .max(100)
      .default(20)
      .describe("Number of articles to return (1-100)"),
  },
  async ({ count }) => {
    try {
      const c = await getClient();
      const contents = await c.getStarredItems(count);
      const result = {
        count: contents.items.length,
        articles: contents.items.map(formatArticle),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      return handleToolError(e);
    }
  },
);

// Add subscription
server.tool(
  "add_subscription",
  "Subscribe to a new RSS/Atom feed",
  {
    feed_url: z
      .string()
      .describe("URL of the RSS or Atom feed to subscribe to"),
    title: z
      .string()
      .optional()
      .describe("Optional custom title for the subscription"),
  },
  async ({ feed_url, title }) => {
    try {
      const c = await getClient();
      const result = await c.addSubscription(feed_url, title);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, result }, null, 2),
          },
        ],
      };
    } catch (e) {
      return handleToolError(e);
    }
  },
);

// Remove subscription
server.tool(
  "remove_subscription",
  "Unsubscribe from a feed",
  {
    subscription_id: z.string().describe("The subscription ID to remove"),
  },
  async ({ subscription_id }) => {
    try {
      const c = await getClient();
      await c.removeSubscription(subscription_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Unsubscribed from ${subscription_id}`,
            }),
          },
        ],
      };
    } catch (e) {
      return handleToolError(e);
    }
  },
);

// Mark as read
server.tool(
  "mark_as_read",
  "Mark articles as read",
  {
    item_ids: z
      .array(z.string())
      .optional()
      .describe("List of article IDs to mark as read"),
    stream_id: z
      .string()
      .optional()
      .describe("Mark all articles in this feed/folder as read"),
  },
  async ({ item_ids, stream_id }) => {
    try {
      if (!item_ids && !stream_id) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Provide either item_ids or stream_id",
              }),
            },
          ],
          isError: true,
        };
      }

      const c = await getClient();
      await c.markAsRead(item_ids, stream_id);

      const message = item_ids
        ? `Marked ${item_ids.length} items as read`
        : `Marked all items in ${stream_id} as read`;

      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, message }) },
        ],
      };
    } catch (e) {
      return handleToolError(e);
    }
  },
);

// Mark as unread
server.tool(
  "mark_as_unread",
  "Mark articles as unread",
  {
    item_ids: z
      .array(z.string())
      .describe("List of article IDs to mark as unread"),
  },
  async ({ item_ids }) => {
    try {
      const c = await getClient();
      await c.markAsUnread(item_ids);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Marked ${item_ids.length} items as unread`,
            }),
          },
        ],
      };
    } catch (e) {
      return handleToolError(e);
    }
  },
);

// Star article
server.tool(
  "star_article",
  "Add star to an article (save for later)",
  {
    item_id: z.string().describe("The article ID to star"),
  },
  async ({ item_id }) => {
    try {
      const c = await getClient();
      await c.addStar(item_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Starred article ${item_id}`,
            }),
          },
        ],
      };
    } catch (e) {
      return handleToolError(e);
    }
  },
);

// Unstar article
server.tool(
  "unstar_article",
  "Remove star from an article",
  {
    item_id: z.string().describe("The article ID to unstar"),
  },
  async ({ item_id }) => {
    try {
      const c = await getClient();
      await c.removeStar(item_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Unstarred article ${item_id}`,
            }),
          },
        ],
      };
    } catch (e) {
      return handleToolError(e);
    }
  },
);

// Add tag to article
server.tool(
  "add_tag_to_article",
  "Add a custom tag to an article",
  {
    item_id: z.string().describe("The article ID to tag"),
    tag_name: z.string().describe("The tag name to add"),
  },
  async ({ item_id, tag_name }) => {
    try {
      const c = await getClient();
      const tag = `user/-/label/${tag_name}`;
      await c.addTag(item_id, tag);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Added tag '${tag_name}' to article`,
            }),
          },
        ],
      };
    } catch (e) {
      return handleToolError(e);
    }
  },
);

// Remove tag from article
server.tool(
  "remove_tag_from_article",
  "Remove a tag from an article",
  {
    item_id: z.string().describe("The article ID"),
    tag_name: z.string().describe("The tag name to remove"),
  },
  async ({ item_id, tag_name }) => {
    try {
      const c = await getClient();
      const tag = `user/-/label/${tag_name}`;
      await c.removeTag(item_id, tag);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Removed tag '${tag_name}' from article`,
            }),
          },
        ],
      };
    } catch (e) {
      return handleToolError(e);
    }
  },
);

// CLI commands
async function runCli() {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  if (command === "auth") {
    switch (subcommand) {
      case "login":
        await login();
        break;
      case "logout":
        await logout();
        break;
      case "status":
        await showStatus();
        break;
      default:
        console.log("Usage: bun run start auth <login|logout|status>");
        console.log("");
        console.log("Commands:");
        console.log("  login   - Authenticate with Inoreader (opens browser)");
        console.log("  logout  - Remove saved tokens from keychain");
        console.log("  status  - Show current authentication status");
        process.exit(1);
    }
    return true;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    console.log("Inoreader MCP Server");
    console.log("");
    console.log("Usage:");
    console.log("  bun run start              Start the MCP server (stdio)");
    console.log("  bun run start auth login   Authenticate with Inoreader");
    console.log("  bun run start auth logout  Remove saved tokens");
    console.log("  bun run start auth status  Show authentication status");
    console.log("");
    console.log("Environment variables:");
    console.log(
      "  INOREADER_APP_ID      Your Inoreader App ID (required for auth)",
    );
    console.log(
      "  INOREADER_APP_KEY     Your Inoreader App Key (required for auth)",
    );
    console.log("  INOREADER_ACCESS_TOKEN  Override keychain token (optional)");
    return true;
  }

  return false;
}

// Start the server
async function main() {
  // Check for CLI commands first
  if (await runCli()) {
    return;
  }

  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Inoreader MCP Server started");
}

main().catch((e) => {
  console.error("Error:", e.message || e);
  process.exit(1);
});
