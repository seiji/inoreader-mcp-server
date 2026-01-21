import { $ } from "bun";

const SERVICE_NAME = "inoreader-mcp";

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

async function isMacOS(): Promise<boolean> {
  return process.platform === "darwin";
}

async function isLinux(): Promise<boolean> {
  return process.platform === "linux";
}

async function macOSSet(account: string, password: string): Promise<void> {
  // Delete existing entry first (ignore errors)
  try {
    await $`security delete-generic-password -s ${SERVICE_NAME} -a ${account}`.quiet();
  } catch {
    // Ignore - entry might not exist
  }

  await $`security add-generic-password -s ${SERVICE_NAME} -a ${account} -w ${password}`.quiet();
}

async function macOSGet(account: string): Promise<string | null> {
  try {
    const result =
      await $`security find-generic-password -s ${SERVICE_NAME} -a ${account} -w`.quiet();
    return result.text().trim();
  } catch {
    return null;
  }
}

async function macOSDelete(account: string): Promise<void> {
  try {
    await $`security delete-generic-password -s ${SERVICE_NAME} -a ${account}`.quiet();
  } catch {
    // Ignore - entry might not exist
  }
}

async function linuxSet(account: string, password: string): Promise<void> {
  await $`echo ${password} | secret-tool store --label="${SERVICE_NAME}" service ${SERVICE_NAME} account ${account}`.quiet();
}

async function linuxGet(account: string): Promise<string | null> {
  try {
    const result =
      await $`secret-tool lookup service ${SERVICE_NAME} account ${account}`.quiet();
    return result.text().trim() || null;
  } catch {
    return null;
  }
}

async function linuxDelete(account: string): Promise<void> {
  try {
    await $`secret-tool clear service ${SERVICE_NAME} account ${account}`.quiet();
  } catch {
    // Ignore
  }
}

export async function saveTokens(tokens: TokenData): Promise<void> {
  const data = JSON.stringify(tokens);

  if (await isMacOS()) {
    await macOSSet("tokens", data);
  } else if (await isLinux()) {
    await linuxSet("tokens", data);
  } else {
    throw new Error(
      `Unsupported platform: ${process.platform}. Use environment variables instead.`,
    );
  }
}

export async function loadTokens(): Promise<TokenData | null> {
  let data: string | null = null;

  if (await isMacOS()) {
    data = await macOSGet("tokens");
  } else if (await isLinux()) {
    data = await linuxGet("tokens");
  }

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as TokenData;
  } catch {
    return null;
  }
}

export async function deleteTokens(): Promise<void> {
  if (await isMacOS()) {
    await macOSDelete("tokens");
  } else if (await isLinux()) {
    await linuxDelete("tokens");
  }
}

export async function isKeychainAvailable(): Promise<boolean> {
  if (await isMacOS()) {
    try {
      await $`which security`.quiet();
      return true;
    } catch {
      return false;
    }
  }

  if (await isLinux()) {
    try {
      await $`which secret-tool`.quiet();
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
