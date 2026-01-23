import { getValidAccessToken, refreshAccessToken } from "./auth.js";
import { AuthenticationError, InoreaderClientError } from "./errors.js";
import { loadTokens, saveTokens } from "./keychain.js";
import type {
  Config,
  StreamContentsResponse,
  SubscriptionsResponse,
  TagsResponse,
  UnreadCountsResponse,
  UserInfo,
} from "./types.js";

export { AuthenticationError, InoreaderClientError };

export class InoreaderClient {
  private config: Config;
  private accessToken: string;
  private hasRetriedAuth = false;

  constructor(config: Config, accessToken: string) {
    this.config = config;
    this.accessToken = accessToken;
  }

  private async tryRefreshToken(): Promise<boolean> {
    try {
      const tokens = await loadTokens();
      if (!tokens?.refreshToken) {
        return false;
      }

      const newTokens = await refreshAccessToken(tokens.refreshToken);
      const expiresAt = Date.now() + newTokens.expires_in * 1000;

      await saveTokens({
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token || tokens.refreshToken,
        expiresAt,
      });

      this.accessToken = newTokens.access_token;
      return true;
    } catch {
      return false;
    }
  }

  private async request<T>(
    method: string,
    endpoint: string,
    params?: Record<string, string>,
    body?: Record<string, string> | URLSearchParams,
  ): Promise<T> {
    const url = new URL(`${this.config.apiBaseUrl}${endpoint}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method === "POST") {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      options.body =
        body instanceof URLSearchParams
          ? body.toString()
          : new URLSearchParams(body).toString();
    }

    const response = await fetch(url.toString(), options);

    if (response.status === 401 && !this.hasRetriedAuth) {
      this.hasRetriedAuth = true;
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        return this.request<T>(method, endpoint, params, body);
      }
      throw new AuthenticationError(
        "Authentication failed. Token may be expired. Run 'bun run start auth login' to re-authenticate.",
      );
    }
    if (response.status === 401) {
      throw new AuthenticationError(
        "Authentication failed. Token may be expired. Run 'bun run start auth login' to re-authenticate.",
      );
    }
    if (response.status === 403) {
      throw new AuthenticationError(
        "Access forbidden. API access requires Inoreader Pro.",
      );
    }
    if (!response.ok) {
      throw new InoreaderClientError(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }

    // Reset retry flag on success
    this.hasRetriedAuth = false;

    const contentType = response.headers.get("content-type") ?? "";

    // Prefer JSON when explicitly indicated
    if (contentType.includes("application/json")) {
      return response.json() as Promise<T>;
    }

    // Handle no-content responses
    if (response.status === 204 || response.status === 205) {
      return undefined as T;
    }

    // Fallback to text for non-JSON responses (e.g., plain text or empty body)
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    return text as unknown as T;
  }

  async getUserInfo(): Promise<UserInfo> {
    return this.request<UserInfo>("GET", "/user-info");
  }

  async getUnreadCounts(): Promise<UnreadCountsResponse> {
    return this.request<UnreadCountsResponse>("GET", "/unread-count", {
      output: "json",
    });
  }

  async getSubscriptions(): Promise<SubscriptionsResponse> {
    return this.request<SubscriptionsResponse>("GET", "/subscription/list", {
      output: "json",
    });
  }

  async getTags(): Promise<TagsResponse> {
    return this.request<TagsResponse>("GET", "/tag/list", { output: "json" });
  }

  async getStreamContents(
    streamId: string,
    options: {
      count?: number;
      continuation?: string;
      excludeTarget?: string;
      includeAllItems?: boolean;
    } = {},
  ): Promise<StreamContentsResponse> {
    const params: Record<string, string> = {
      output: "json",
      n: String(Math.min(options.count ?? 20, 1000)),
    };

    if (options.continuation) {
      params.c = options.continuation;
    }
    if (options.excludeTarget) {
      params.xt = options.excludeTarget;
    }
    if (options.includeAllItems) {
      params.it = "user/-/state/com.google/read";
    }

    const encodedStreamId = encodeURIComponent(streamId);
    return this.request<StreamContentsResponse>(
      "GET",
      `/stream/contents/${encodedStreamId}`,
      params,
    );
  }

  async getStarredItems(count = 20): Promise<StreamContentsResponse> {
    return this.getStreamContents("user/-/state/com.google/starred", {
      count,
      includeAllItems: true,
    });
  }

  async getUnreadItems(count = 20): Promise<StreamContentsResponse> {
    return this.getStreamContents("user/-/state/com.google/reading-list", {
      count,
      excludeTarget: "user/-/state/com.google/read",
    });
  }

  async addSubscription(
    feedUrl: string,
    title?: string,
  ): Promise<Record<string, unknown>> {
    const params: Record<string, string> = { quickadd: feedUrl };
    if (title) {
      params.t = title;
    }
    return this.request<Record<string, unknown>>(
      "POST",
      "/subscription/quickadd",
      params,
    );
  }

  async removeSubscription(subscriptionId: string): Promise<void> {
    await this.request<string>("POST", "/subscription/edit", undefined, {
      ac: "unsubscribe",
      s: subscriptionId,
    });
  }

  async markAsRead(
    itemIds?: string[],
    streamId?: string,
    timestamp?: number,
  ): Promise<void> {
    if (itemIds && itemIds.length > 0) {
      const body = new URLSearchParams();
      body.append("a", "user/-/state/com.google/read");
      for (const id of itemIds) {
        body.append("i", id);
      }
      await this.request<string>("POST", "/edit-tag", undefined, body);
    } else if (streamId) {
      const body: Record<string, string> = { s: streamId };
      if (timestamp) {
        body.ts = String(timestamp);
      }
      await this.request<string>("POST", "/mark-all-as-read", undefined, body);
    }
  }

  async markAsUnread(itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;
    const body = new URLSearchParams();
    body.append("r", "user/-/state/com.google/read");
    for (const id of itemIds) {
      body.append("i", id);
    }
    await this.request<string>("POST", "/edit-tag", undefined, body);
  }

  async addStar(itemId: string): Promise<void> {
    await this.request<string>("POST", "/edit-tag", undefined, {
      a: "user/-/state/com.google/starred",
      i: itemId,
    });
  }

  async removeStar(itemId: string): Promise<void> {
    await this.request<string>("POST", "/edit-tag", undefined, {
      r: "user/-/state/com.google/starred",
      i: itemId,
    });
  }

  async addTag(itemId: string, tag: string): Promise<void> {
    await this.request<string>("POST", "/edit-tag", undefined, {
      a: tag,
      i: itemId,
    });
  }

  async removeTag(itemId: string, tag: string): Promise<void> {
    await this.request<string>("POST", "/edit-tag", undefined, {
      r: tag,
      i: itemId,
    });
  }

  async editSubscription(
    subscriptionId: string,
    options: {
      title?: string;
      addToFolder?: string;
      removeFromFolder?: string;
    },
  ): Promise<void> {
    if (!options.title && !options.addToFolder && !options.removeFromFolder) {
      throw new InoreaderClientError(
        "At least one option (title, addToFolder, or removeFromFolder) is required",
      );
    }
    if (
      options.addToFolder &&
      options.removeFromFolder &&
      options.addToFolder === options.removeFromFolder
    ) {
      throw new InoreaderClientError(
        "Cannot add and remove from the same folder",
      );
    }

    const body = new URLSearchParams();
    body.append("ac", "edit");
    body.append("s", subscriptionId);

    if (options.title) {
      body.append("t", options.title);
    }
    if (options.addToFolder) {
      body.append(
        "a",
        `user/-/label/${encodeURIComponent(options.addToFolder)}`,
      );
    }
    if (options.removeFromFolder) {
      body.append(
        "r",
        `user/-/label/${encodeURIComponent(options.removeFromFolder)}`,
      );
    }

    await this.request<string>("POST", "/subscription/edit", undefined, body);
  }
}

export async function createClient(): Promise<InoreaderClient> {
  const accessToken = await getValidAccessToken();

  const config: Config = {
    appId: process.env.INOREADER_APP_ID ?? "",
    appKey: process.env.INOREADER_APP_KEY ?? "",
    accessToken,
    refreshToken: process.env.INOREADER_REFRESH_TOKEN,
    apiBaseUrl:
      process.env.INOREADER_API_BASE_URL ??
      "https://www.inoreader.com/reader/api/0",
    oauthBaseUrl:
      process.env.INOREADER_OAUTH_BASE_URL ??
      "https://www.inoreader.com/oauth2",
  };

  return new InoreaderClient(config, accessToken);
}
