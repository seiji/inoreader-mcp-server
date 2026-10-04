import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { Config, UserInfo } from "../src/types.js";

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

// Only the OS credential-store boundary is replaced. Auth and client logic stay real.
const loadTokens = mock(async (): Promise<Tokens | null> => null);
const saveTokens = mock(async (_tokens: Tokens) => {});
const deleteTokens = mock(async () => {});
const isKeychainAvailable = mock(async () => true);
mock.module("../src/keychain.js", () => ({
  loadTokens,
  saveTokens,
  deleteTokens,
  isKeychainAvailable,
}));

const { getValidAccessToken, logout, startAuthFlow } = await import(
  "../src/auth.js"
);
const { AuthenticationError, InoreaderClient } = await import(
  "../src/client.js"
);

const envKeys = [
  "INOREADER_APP_ID",
  "INOREADER_APP_KEY",
  "INOREADER_ACCESS_TOKEN",
] as const;
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
const config: Config = {
  appId: "test-app",
  appKey: "test-key",
  accessToken: "old-token",
  apiBaseUrl: "https://api.example.invalid/reader/api/0",
  oauthBaseUrl: "https://oauth.example.invalid",
};
const userInfo: UserInfo = {
  userId: "user-1",
  userName: "Test User",
  userProfileId: "profile-1",
  userEmail: "test@example.invalid",
  isBloggerUser: false,
  signupTimeSec: 1700000000,
  isMultiLoginEnabled: false,
};
const tokenResponse = {
  access_token: "new-token",
  refresh_token: "new-refresh-token",
  expires_in: 3600,
  token_type: "Bearer",
};

const fetchMock = mock(
  async (
    _input: string | URL | Request,
    _init?: RequestInit,
  ): Promise<Response> => {
    throw new Error("Unexpected fetch: external network access is disabled");
  },
);
let callback: ((request: Request) => Response | Promise<Response>) | undefined;
let activeFlow: Awaited<ReturnType<typeof startAuthFlow>> | undefined;
let flowResult: Promise<{ error?: unknown }> | undefined;

beforeEach(() => {
  for (const key of envKeys) delete process.env[key];
  process.env.INOREADER_APP_ID = "test-app";
  process.env.INOREADER_APP_KEY = "test-key";
  loadTokens.mockReset();
  loadTokens.mockImplementation(async () => null);
  saveTokens.mockClear();
  deleteTokens.mockClear();
  isKeychainAvailable.mockReset();
  isKeychainAvailable.mockImplementation(async () => true);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => {
    throw new Error("Unexpected fetch: external network access is disabled");
  });
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(fetchMock, { preconnect: () => {} }),
  );
  spyOn(console, "log").mockImplementation(() => {});
  spyOn(console, "error").mockImplementation(() => {});
  callback = undefined;
  activeFlow = undefined;
  flowResult = undefined;
});

afterEach(async () => {
  try {
    activeFlow?.stopServer();
    await flowResult;
  } finally {
    mock.restore();
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

function client() {
  return new InoreaderClient(config, "old-token");
}

function requestBody(index = 0) {
  return new URLSearchParams(String(fetchMock.mock.calls[index]?.[1]?.body));
}

async function beginAuthFlow() {
  // Capture the callback handler without opening a port or launching a browser.
  spyOn(Bun, "serve").mockImplementation((options) => {
    callback = options.fetch as typeof callback;
    return { stop: () => {} } as ReturnType<typeof Bun.serve>;
  });
  activeFlow = await startAuthFlow();
  // Observe rejection immediately, including cancellation in afterEach.
  flowResult = activeFlow.tokenPromise.then(
    () => ({}),
    (error: unknown) => ({ error }),
  );
  return activeFlow;
}

async function sendCallback(params: URLSearchParams) {
  if (!callback || !activeFlow) throw new Error("No active callback handler");
  const url = new URL(
    new URL(activeFlow.authUrl).searchParams.get("redirect_uri") ?? "",
  );
  url.search = params.toString();
  return callback(new Request(url.toString()));
}

describe("authentication", () => {
  test("environment token takes priority over the credential store", async () => {
    process.env.INOREADER_ACCESS_TOKEN = "environment-token";
    expect(await getValidAccessToken()).toBe("environment-token");
    expect(loadTokens).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("missing saved tokens produces an authentication error", async () => {
    await expect(getValidAccessToken()).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("valid saved tokens do not trigger a refresh", async () => {
    loadTokens.mockResolvedValue({
      accessToken: "saved-token",
      refreshToken: "saved-refresh-token",
      expiresAt: Date.now() + 3600_000,
    });
    expect(await getValidAccessToken()).toBe("saved-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("expired tokens are refreshed and saved with an expiry", async () => {
    loadTokens.mockResolvedValue({
      accessToken: "expired-token",
      refreshToken: "saved-refresh-token",
      expiresAt: Date.now() - 1000,
    });
    fetchMock.mockImplementation(async () => Response.json(tokenResponse));
    const startedAt = Date.now();
    expect(await getValidAccessToken()).toBe("new-token");
    expect(requestBody().get("grant_type")).toBe("refresh_token");
    expect(requestBody().get("refresh_token")).toBe("saved-refresh-token");
    expect(saveTokens).toHaveBeenCalledTimes(1);
    const saved = saveTokens.mock.calls[0]?.[0];
    expect(saved?.accessToken).toBe("new-token");
    expect(saved?.expiresAt).toBeGreaterThanOrEqual(startedAt + 3600_000);
    expect(saved?.expiresAt).toBeLessThanOrEqual(Date.now() + 3600_000);
  });

  test("unavailable credential store does not start a callback server", async () => {
    isKeychainAvailable.mockResolvedValue(false);
    const serve = spyOn(Bun, "serve");
    await expect(startAuthFlow()).rejects.toThrow("Keychain is not available");
    expect(serve).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("valid OAuth callback exchanges the code and saves tokens", async () => {
    fetchMock.mockImplementation(async () => Response.json(tokenResponse));
    const flow = await beginAuthFlow();
    const state = new URL(flow.authUrl).searchParams.get("state");
    expect(state).toBeTruthy();
    const response = await sendCallback(
      new URLSearchParams({ code: "test-code", state: state ?? "" }),
    );
    expect(response.status).toBe(200);
    expect(await flowResult).toEqual({});
    expect(requestBody().get("code")).toBe("test-code");
    expect(requestBody().get("redirect_uri")).toBe(
      new URL(flow.authUrl).searchParams.get("redirect_uri"),
    );
    expect(saveTokens).toHaveBeenCalledTimes(1);
    expect(saveTokens.mock.calls[0]?.[0]).toMatchObject({
      accessToken: "new-token",
      refreshToken: "new-refresh-token",
    });
  });

  for (const state of [undefined, "incorrect-state"]) {
    test(`OAuth callback rejects ${state === undefined ? "missing" : "incorrect"} state without exchanging tokens`, async () => {
      fetchMock.mockImplementation(async () => Response.json(tokenResponse));
      await beginAuthFlow();
      const params = new URLSearchParams({ code: "untrusted-code" });
      if (state !== undefined) params.set("state", state);
      const response = await sendCallback(params);
      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(saveTokens).not.toHaveBeenCalled();
    });
  }

  test("README registration instructions match the OAuth redirect URI", async () => {
    const flow = await beginAuthFlow();
    const redirectUri = new URL(flow.authUrl).searchParams.get("redirect_uri");
    const readme = await Bun.file(
      new URL("../README.md", import.meta.url),
    ).text();
    expect(readme).toContain(`**Redirect URI**: \`${redirectUri}\``);
  });

  test("OAuth denial rejects the flow without exchanging or saving tokens", async () => {
    const flow = await beginAuthFlow();
    const state = new URL(flow.authUrl).searchParams.get("state") ?? "";
    await sendCallback(new URLSearchParams({ error: "access_denied", state }));
    const result = await flowResult;
    expect(result?.error).toBeInstanceOf(Error);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveTokens).not.toHaveBeenCalled();
  });

  test("starting an auth flow does not write non-MCP output to stdout", async () => {
    await beginAuthFlow();
    expect(console.log).not.toHaveBeenCalled();
  });

  test("logout removes tokens without writing non-MCP output to stdout", async () => {
    await logout();
    expect(deleteTokens).toHaveBeenCalledTimes(1);
    expect(console.log).not.toHaveBeenCalled();
  });
});

describe("API client", () => {
  test("unread pagination sends the continuation token and read exclusion", async () => {
    const contents = {
      direction: "ltr",
      id: "user/-/state/com.google/reading-list",
      title: "Reading list",
      items: [],
      continuation: "next-page",
    };
    fetchMock.mockImplementation(async () => Response.json(contents));
    expect(await client().getUnreadItems(25, "previous-page")).toEqual(
      contents,
    );
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("n")).toBe("25");
    expect(url.searchParams.get("c")).toBe("previous-page");
    expect(url.searchParams.get("xt")).toBe("user/-/state/com.google/read");
  });

  test("batch marking preserves all item IDs", async () => {
    fetchMock.mockImplementation(async () => new Response("OK"));
    await client().markAsRead(["item-1", "item-2"]);
    expect(requestBody().getAll("i")).toEqual(["item-1", "item-2"]);
    expect(requestBody().get("a")).toBe("user/-/state/com.google/read");
  });

  for (const timestamp of [0, 1700000000]) {
    test(`mark-all-as-read preserves explicit timestamp ${timestamp}`, async () => {
      fetchMock.mockImplementation(async () => new Response("OK"));
      await client().markAsRead(undefined, "feed/example", timestamp);
      expect(requestBody().get("ts")).toBe(String(timestamp));
    });
  }

  for (const action of ["addToFolder", "removeFromFolder"] as const) {
    for (const folder of ["Tech", "Tech News", "日本語", "100% Read"]) {
      test(`${action} preserves folder name ${folder} after form decoding`, async () => {
        fetchMock.mockImplementation(async () => new Response("OK"));
        await client().editSubscription("feed/example", { [action]: folder });
        expect(requestBody().get(action === "addToFolder" ? "a" : "r")).toBe(
          `user/-/label/${folder}`,
        );
      });
    }
  }

  test("a 401 refreshes the token and retries with the new bearer token", async () => {
    loadTokens.mockResolvedValue({
      accessToken: "old-token",
      refreshToken: "old-refresh-token",
    });
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith("/token")) return Response.json(tokenResponse);
      const authorization = new Headers(init?.headers).get("Authorization");
      return authorization === "Bearer old-token"
        ? new Response(null, { status: 401 })
        : Response.json(userInfo);
    });
    expect(await client().getUserInfo()).toEqual(userInfo);
    expect(saveTokens).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("a repeated 401 stops after one refresh rather than looping", async () => {
    loadTokens.mockResolvedValue({
      accessToken: "old-token",
      refreshToken: "old-refresh-token",
    });
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/token")
        ? Response.json(tokenResponse)
        : new Response(null, { status: 401 }),
    );
    await expect(client().getUserInfo()).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(saveTokens).toHaveBeenCalledTimes(1);
  });

  test("concurrent 401 requests share refresh and both succeed", async () => {
    loadTokens.mockResolvedValue({
      accessToken: "old-token",
      refreshToken: "old-refresh-token",
    });
    const refreshStarted = Promise.withResolvers<void>();
    const refreshResponse = Promise.withResolvers<Response>();
    let refreshCount = 0;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith("/token")) {
        refreshCount++;
        refreshStarted.resolve();
        return refreshResponse.promise;
      }
      const authorization = new Headers(init?.headers).get("Authorization");
      return authorization === "Bearer old-token"
        ? new Response(null, { status: 401 })
        : Response.json(userInfo);
    });
    const c = client();
    const results = Promise.allSettled([c.getUserInfo(), c.getUserInfo()]);
    await refreshStarted.promise;
    refreshResponse.resolve(Response.json(tokenResponse));
    expect(await results).toEqual([
      { status: "fulfilled", value: userInfo },
      { status: "fulfilled", value: userInfo },
    ]);
    expect(refreshCount).toBe(1);
  });
});
