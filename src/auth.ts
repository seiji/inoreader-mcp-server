import { AuthenticationError } from "./errors.js";
import {
  deleteTokens,
  isKeychainAvailable,
  loadTokens,
  saveTokens,
} from "./keychain.js";

const OAUTH_BASE_URL = "https://www.inoreader.com/oauth2";
const REDIRECT_PORT = 19812;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface AuthConfig {
  appId: string;
  appKey: string;
}

function getAuthConfig(): AuthConfig {
  const appId = process.env.INOREADER_APP_ID;
  const appKey = process.env.INOREADER_APP_KEY;

  if (!appId || !appKey) {
    throw new Error(
      "INOREADER_APP_ID and INOREADER_APP_KEY environment variables are required.\n" +
        "Get your credentials at: https://www.inoreader.com/developers/",
    );
  }

  return { appId, appKey };
}

function buildAuthorizationUrl(appId: string, state: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "read write",
    state,
  });

  return `${OAUTH_BASE_URL}/auth?${params.toString()}`;
}

async function exchangeCodeForTokens(
  code: string,
  config: AuthConfig,
): Promise<TokenResponse> {
  const response = await fetch(`${OAUTH_BASE_URL}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.appId,
      client_secret: config.appKey,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const config = getAuthConfig();

  const response = await fetch(`${OAUTH_BASE_URL}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.appId,
      client_secret: config.appKey,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  return response.json() as Promise<TokenResponse>;
}

export async function openBrowser(url: string): Promise<void> {
  const { $ } = await import("bun");

  if (process.platform === "darwin") {
    await $`open ${url}`.quiet();
  } else if (process.platform === "linux") {
    await $`xdg-open ${url}`.quiet();
  } else if (process.platform === "win32") {
    await $`cmd /c start ${url}`.quiet();
  } else {
    console.log(`Please open this URL in your browser:\n${url}`);
  }
}

function startCallbackServer(expectedState: string): {
  codePromise: Promise<string>;
  stop: () => void;
} {
  let stopFn: () => void = () => {};
  const codePromise = new Promise<string>((resolve, reject) => {
    const server = Bun.serve({
      port: REDIRECT_PORT,
      hostname: "127.0.0.1",
      fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/callback") {
          if (url.searchParams.get("state") !== expectedState) {
            return new Response("Invalid OAuth state", { status: 400 });
          }

          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");

          clearTimeout(timeout);
          server.stop();

          if (error) {
            reject(new Error(`Authorization error: ${error}`));
            return new Response(
              "<html><body><h1>Authentication Failed</h1><p>You can close this window.</p></body></html>",
              { headers: { "Content-Type": "text/html" } },
            );
          }

          if (code) {
            resolve(code);
            return new Response(
              "<html><body><h1>Authentication Successful!</h1><p>You can close this window.</p></body></html>",
              { headers: { "Content-Type": "text/html" } },
            );
          }

          reject(new Error("No authorization code received"));
          return new Response("Bad Request", { status: 400 });
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    // Start the timer only after the server has successfully bound its port.
    const timeout = setTimeout(
      () => {
        server.stop();
        reject(new Error("Authentication timed out after 5 minutes"));
      },
      5 * 60 * 1000,
    );

    stopFn = () => {
      clearTimeout(timeout);
      server.stop();
      reject(new Error("Authentication flow was cancelled"));
    };

    console.error(`Callback server started on port ${REDIRECT_PORT}`);
  });
  return { codePromise, stop: () => stopFn() };
}

export async function login(): Promise<void> {
  const { authUrl, tokenPromise } = await startAuthFlow();

  console.log("Opening browser for authentication...");
  console.log(`If the browser doesn't open, visit:\n${authUrl}\n`);

  await openBrowser(authUrl);

  console.log("Waiting for authentication...");
  await tokenPromise;

  console.log("Authentication successful! Tokens saved to keychain.");
}

export async function logout(): Promise<void> {
  await deleteTokens();
}

export async function startAuthFlow(): Promise<{
  authUrl: string;
  tokenPromise: Promise<void>;
  stopServer: () => void;
}> {
  const keychainAvailable = await isKeychainAvailable();
  if (!keychainAvailable) {
    throw new Error(
      "Keychain is not available on this system.\n" +
        "macOS: Keychain should be available by default.\n" +
        "Linux: Install libsecret-tools (apt install libsecret-tools)",
    );
  }

  const config = getAuthConfig();
  const state = crypto.randomUUID();
  const authUrl = buildAuthorizationUrl(config.appId, state);
  const { codePromise, stop } = startCallbackServer(state);

  const tokenPromise = (async () => {
    const code = await codePromise;
    const tokens = await exchangeCodeForTokens(code, config);
    const expiresAt = Date.now() + tokens.expires_in * 1000;
    await saveTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    });
  })();

  // MCP callers may not call auth_complete before cancellation or timeout.
  // Observe rejection now while preserving it for callers awaiting tokenPromise.
  void tokenPromise.catch(() => {});

  return { authUrl, tokenPromise, stopServer: stop };
}

export async function getAuthStatus(): Promise<Record<string, unknown>> {
  const keychainAvailable = await isKeychainAvailable();

  if (process.env.INOREADER_ACCESS_TOKEN) {
    return {
      authenticated: true,
      keychainAvailable,
      source: "environment",
    };
  }

  const tokens = await loadTokens();
  if (!tokens) {
    return {
      authenticated: false,
      keychainAvailable,
      source: null,
    };
  }

  const expiresIn = tokens.expiresAt ? tokens.expiresAt - Date.now() : null;
  const expiresInMinutes =
    expiresIn !== null ? Math.floor(expiresIn / 60000) : null;

  return {
    authenticated: true,
    keychainAvailable,
    source: "keychain",
    expiresInMinutes,
    expired: expiresIn !== null && expiresIn <= 0,
  };
}

export async function getValidAccessToken(): Promise<string> {
  // First, check environment variable (highest priority)
  const envToken = process.env.INOREADER_ACCESS_TOKEN;
  if (envToken) {
    return envToken;
  }

  // Check keychain
  const tokens = await loadTokens();
  if (!tokens) {
    throw new AuthenticationError(
      "Not authenticated. Use the auth_login tool or set INOREADER_ACCESS_TOKEN environment variable.",
    );
  }

  // Check if token is expired (with 5 minute buffer)
  const isExpired =
    tokens.expiresAt && tokens.expiresAt < Date.now() + 5 * 60 * 1000;

  if (isExpired && tokens.refreshToken) {
    console.error("Access token expired, refreshing...");
    try {
      const newTokens = await refreshAccessToken(tokens.refreshToken);
      const expiresAt = Date.now() + newTokens.expires_in * 1000;

      await saveTokens({
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token || tokens.refreshToken,
        expiresAt,
      });

      return newTokens.access_token;
    } catch (error) {
      throw new AuthenticationError(
        `Failed to refresh token: ${error}. Use the auth_login tool to re-authenticate.`,
      );
    }
  }

  return tokens.accessToken;
}

export async function showStatus(): Promise<void> {
  const keychainAvailable = await isKeychainAvailable();
  console.log(`Keychain available: ${keychainAvailable ? "Yes" : "No"}`);

  if (process.env.INOREADER_ACCESS_TOKEN) {
    console.log("Using access token from environment variable.");
    return;
  }

  const tokens = await loadTokens();
  if (!tokens) {
    console.log("Not authenticated. Use the auth_login tool to authenticate.");
    return;
  }

  console.log("Authenticated via keychain.");
  if (tokens.expiresAt) {
    const expiresIn = tokens.expiresAt - Date.now();
    if (expiresIn > 0) {
      const minutes = Math.floor(expiresIn / 60000);
      console.log(`Token expires in ${minutes} minutes.`);
    } else {
      console.log("Token expired. Will refresh on next use.");
    }
  }
}
