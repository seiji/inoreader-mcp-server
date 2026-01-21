# Inoreader MCP Server

An MCP (Model Context Protocol) server that provides RSS feed management capabilities through the Inoreader API. This enables LLMs like Claude to read and manage RSS feeds on your behalf.

Built with [Bun](https://bun.sh/) for fast startup and low memory usage.

## Features

- **OAuth2 authentication** - Browser-based login with secure keychain storage
- **Automatic token refresh** - Tokens are refreshed automatically when expired
- **Read articles** - Get unread, starred, or all articles from your feeds
- **Manage subscriptions** - Add or remove RSS feed subscriptions
- **Organize content** - Mark articles as read/unread, star articles, add tags
- **Browse feeds** - List subscriptions, folders, tags, and unread counts

## Requirements

- [Bun](https://bun.sh/) 1.0+
- Inoreader Pro account (API access requires Pro subscription)
- Inoreader API credentials (App ID and App Key)
- **macOS**: Keychain (built-in)
- **Linux**: libsecret (`apt install libsecret-tools`)

## Installation

```bash
# Install dependencies
bun install
```

## Authentication

### 1. Get API Credentials

1. Go to [Inoreader Developer Portal](https://www.inoreader.com/developers/)
2. Register a new application with these settings:
   - **Redirect URI**: `http://localhost:19812/callback`
   - **Scopes**: `read` and `write`
3. Note your **App ID** and **App Key**

### 2. Set Environment Variables

```bash
export INOREADER_APP_ID="your-app-id"
export INOREADER_APP_KEY="your-app-key"
```

### 3. Login

```bash
# This opens your browser for OAuth authentication
bun run src/index.ts auth login
```

Tokens are securely stored in your system keychain:
- **macOS**: Keychain Access
- **Linux**: GNOME Keyring / KDE Wallet (via libsecret)

### Auth Commands

```bash
# Login - opens browser for OAuth authentication
bun run start auth login

# Check authentication status
bun run start auth status

# Logout - remove tokens from keychain
bun run start auth logout
```

## Usage

### Running the Server

```bash
# Start the MCP server (stdio transport)
bun run start

# Or directly
bun run src/index.ts
```

### Claude Desktop Configuration

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "inoreader": {
      "command": "bun",
      "args": ["run", "/path/to/inoreader-mcp-server/src/index.ts"],
      "env": {
        "INOREADER_APP_ID": "your-app-id",
        "INOREADER_APP_KEY": "your-app-key"
      }
    }
  }
}
```

**Note**: After configuring, run `bun run start auth login` once to authenticate. Tokens are stored in keychain and automatically refreshed.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_user_info` | Get authenticated user information |
| `get_unread_counts` | Get unread counts for all feeds |
| `get_subscriptions` | List all RSS subscriptions |
| `get_folders_and_tags` | List folders and tags |
| `get_articles` | Get articles from feeds (with filters) |
| `get_starred_articles` | Get starred/saved articles |
| `add_subscription` | Subscribe to a new RSS feed |
| `remove_subscription` | Unsubscribe from a feed |
| `mark_as_read` | Mark articles as read |
| `mark_as_unread` | Mark articles as unread |
| `star_article` | Star/save an article |
| `unstar_article` | Remove star from article |
| `add_tag_to_article` | Add custom tag to article |
| `remove_tag_from_article` | Remove tag from article |

## Example Interactions

Once configured with Claude, you can:

- "Show me my unread articles"
- "What are my RSS subscriptions?"
- "Subscribe to https://example.com/feed.xml"
- "Mark all articles in my Tech folder as read"
- "Star the first article about AI"
- "How many unread articles do I have?"

## Development

```bash
# Install dependencies
bun install

# Run in development mode (with watch)
bun run dev

# Type check
bun run typecheck

# Lint
bun run lint

# Format
bun run format
```

## Troubleshooting

### "Keychain is not available"

**Linux**: Install libsecret-tools:
```bash
sudo apt install libsecret-tools
```

### "Token expired" errors

Run `bun run start auth login` to re-authenticate.

## Disclaimer

This project is an unofficial, community-developed tool and is not affiliated with, endorsed by, or sponsored by Inoreader. "Inoreader" is a trademark of Innologica Ltd.

To use this MCP server, you must:
- Have your own [Inoreader Pro](https://www.inoreader.com/pricing) subscription (API access requires Pro)
- Register your own application at the [Inoreader Developer Portal](https://www.inoreader.com/developers/)
- Comply with Inoreader's [Terms of Service](https://www.inoreader.com/tos)

This project does not include any API keys or tokens. Each user must obtain their own credentials.

## License

MIT
