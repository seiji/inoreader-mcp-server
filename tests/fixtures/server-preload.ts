import { mock, spyOn } from "bun:test";
import { streamContents, userInfo } from "./inoreader.js";

// This file is loaded only in the isolated MCP server subprocess.
mock.module("../../src/keychain.js", () => ({
  loadTokens: async () => null,
  saveTokens: async () => {},
  deleteTokens: async () => {},
  isKeychainAvailable: async () => true,
}));
spyOn(Bun, "serve").mockImplementation(() => {
  throw new Error("Listening ports are disabled in contract tests");
});

async function fixtureFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== "https://api.example.invalid") {
    throw new Error(`Unexpected network request: ${url.origin}`);
  }
  if (process.env.TEST_API_MODE === "forbidden") {
    // Make accidental API calls externally observable to the parent test.
    console.error("UNEXPECTED_API_CALL");
    throw new Error("API must not be called for this input");
  }
  if (process.env.TEST_API_MODE === "error") {
    return new Response(null, { status: 500, statusText: "Fixture failure" });
  }
  if (url.pathname.endsWith("/user-info")) return Response.json(userInfo);
  if (url.pathname.endsWith("/unread-count")) {
    return Response.json({
      max: 1000,
      unreadcounts: [
        { id: "feed/example", count: 2 },
        { id: "feed/empty", count: 0 },
      ],
    });
  }
  if (url.pathname.endsWith("/subscription/list")) {
    return Response.json({
      subscriptions: [
        {
          id: "feed/example",
          title: "Example",
          url: "https://example.invalid/rss",
          categories: [{ id: "user/-/label/Tech", label: "Tech" }],
        },
      ],
    });
  }
  if (url.pathname.endsWith("/tag/list")) {
    return Response.json({
      tags: [
        { id: "user/-/label/Tech" },
        { id: "custom-tag" },
        { id: "user/-/state/com.google/read" },
      ],
    });
  }
  if (url.pathname.includes("/stream/contents/")) {
    // Validate selection, defaults, and pagination as part of the tool contract.
    const expectedStream = process.env.TEST_STREAM;
    if (
      expectedStream &&
      decodeURIComponent(url.pathname.split("/stream/contents/")[1] ?? "") !==
        expectedStream
    ) {
      throw new Error("Wrong stream selected");
    }
    for (const [env, param] of [
      ["TEST_COUNT", "n"],
      ["TEST_CONTINUATION", "c"],
      ["TEST_EXCLUDE", "xt"],
      ["TEST_INCLUDE", "it"],
    ]) {
      const expected = process.env[env];
      if (
        expected !== undefined &&
        (url.searchParams.get(param) ?? "") !== expected
      ) {
        throw new Error(`Wrong ${param} parameter`);
      }
    }
    if (process.env.TEST_EMPTY === "1") {
      return Response.json({
        ...streamContents,
        items: [],
        continuation: undefined,
      });
    }
    return Response.json(streamContents);
  }
  if (url.pathname.endsWith("/subscription/quickadd")) {
    return Response.json({ numResults: 1 });
  }
  if (
    url.pathname.endsWith("/edit-tag") ||
    url.pathname.endsWith("/subscription/edit") ||
    url.pathname.endsWith("/mark-all-as-read")
  ) {
    return new Response("OK");
  }
  throw new Error(`Unexpected API endpoint: ${url.pathname}`);
}

spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(fixtureFetch, { preconnect: () => {} }),
);
