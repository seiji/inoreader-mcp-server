# Inoreader MCP Server

## Development Commands

```bash
# Install dependencies
bun install

# Type checking
bun run typecheck

# Lint
bun run lint

# Format code
bun run format

# Start MCP server (stdio mode)
bun run start

# Authentication commands
bun run start auth login   # Authenticate with Inoreader (opens browser)
bun run start auth logout  # Remove saved tokens from keychain
bun run start auth status  # Show authentication status
```

## Architecture Overview

### Entry Point
- `src/index.ts` - MCP server setup and tool definitions

### Core Modules
- `src/client.ts` - Inoreader API client with 401 auto-retry logic
- `src/auth.ts` - OAuth2 authentication flow and token management
- `src/keychain.ts` - Secure token storage (macOS Keychain / Linux secret-tool)
- `src/types.ts` - TypeScript type definitions for Inoreader API

### Key Features
- OAuth2 authentication with automatic token refresh
- Secure token storage in system keychain
- Batch API calls for marking multiple items as read/unread
- All MCP tools return JSON responses

### Environment Variables
- `INOREADER_APP_ID` - Inoreader App ID (required for auth)
- `INOREADER_APP_KEY` - Inoreader App Key (required for auth)
- `INOREADER_ACCESS_TOKEN` - Override keychain token (optional)
