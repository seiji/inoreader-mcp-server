import {
  deleteTokens,
  isKeychainAvailable,
  loadTokens,
  saveTokens,
} from "./keychain.js";

const OAUTH_BASE_URL = "https://www.inoreader.com/oauth2";
const REDIRECT_PORT = 19812;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

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

function buildAuthorizationUrl(appId: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "read write",
    state: crypto.randomUUID(),
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

async function openBrowser(url: string): Promise<void> {
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

async function startCallbackServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        server.stop();
        reject(new Error("Authentication timed out after 5 minutes"));
      },
      5 * 60 * 1000,
    );

    const server = Bun.serve({
      port: REDIRECT_PORT,
      fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/callback") {
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

    console.log(`Callback server started on port ${REDIRECT_PORT}`);
  });
}

export async function login(): Promise<void> {
  const keychainAvailable = await isKeychainAvailable();
  if (!keychainAvailable) {
    throw new Error(
      "Keychain is not available on this system.\n" +
        "macOS: Keychain should be available by default.\n" +
        "Linux: Install libsecret-tools (apt install libsecret-tools)",
    );
  }

  const config = getAuthConfig();
  const authUrl = buildAuthorizationUrl(config.appId);

  console.log("Opening browser for authentication...");
  console.log(`If the browser doesn't open, visit:\n${authUrl}\n`);

  // Start callback server before opening browser
  const codePromise = startCallbackServer();

  await openBrowser(authUrl);

  console.log("Waiting for authentication...");
  const code = await codePromise;

  console.log("Exchanging code for tokens...");
  const tokens = await exchangeCodeForTokens(code, config);

  const expiresAt = Date.now() + tokens.expires_in * 1000;

  await saveTokens({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
  });

  console.log("Authentication successful! Tokens saved to keychain.");
}

export async function logout(): Promise<void> {
  await deleteTokens();
  console.log("Logged out. Tokens removed from keychain.");
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
    throw new Error(
      "Not authenticated. Run 'inoreader-mcp auth login' first, " +
        "or set INOREADER_ACCESS_TOKEN environment variable.",
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
      throw new Error(
        `Failed to refresh token: ${error}. Run 'inoreader-mcp auth login' to re-authenticate.`,
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
    console.log(
      "Not authenticated. Run 'inoreader-mcp auth login' to authenticate.",
    );
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
