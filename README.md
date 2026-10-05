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

### Quick Start (via bunx)

No installation required - run directly from GitHub:

```bash
bunx github:seiji/inoreader-mcp-server          # latest
bunx github:seiji/inoreader-mcp-server#v0.4.0   # specific version
```

### Local Development

```bash
git clone https://github.com/seiji/inoreader-mcp-server.git
cd inoreader-mcp-server
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
bunx github:seiji/inoreader-mcp-server auth login
```

Alternatively, authenticate from your MCP client: call the `auth_login` tool,
open the returned URL in a browser, then call `auth_complete`.

Tokens are securely stored in your system keychain:
- **macOS**: Keychain Access
- **Linux**: GNOME Keyring / KDE Wallet (via libsecret)

To bypass the keychain, set `INOREADER_ACCESS_TOKEN`. It takes priority over
tokens stored in the keychain.

### Auth Commands

```bash
# Login - opens browser for OAuth authentication
bunx github:seiji/inoreader-mcp-server auth login

# Check authentication status
bunx github:seiji/inoreader-mcp-server auth status

# Logout - remove tokens from keychain
bunx github:seiji/inoreader-mcp-server auth logout
```

## Usage

### Running the Server

```bash
# Via bunx (recommended)
bunx github:seiji/inoreader-mcp-server

# Local development
bun run start
```

### MCP Client Configuration

Install the server with your MCP client. `INOREADER_APP_ID` and `INOREADER_APP_KEY`
are required for login and token refresh.

**Standard config** works in most of the tools:

```json
{
  "mcpServers": {
    "inoreader": {
      "command": "bunx",
      "args": ["github:seiji/inoreader-mcp-server"],
      "env": {
        "INOREADER_APP_ID": "your-app-id",
        "INOREADER_APP_KEY": "your-app-key"
      }
    }
  }
}
```

<details>
<summary>Claude Code</summary>

Use the Claude Code CLI to add the Inoreader MCP server:

```bash
claude mcp add inoreader --scope user \
  -e INOREADER_APP_ID=your-app-id \
  -e INOREADER_APP_KEY=your-app-key \
  -- bunx github:seiji/inoreader-mcp-server
```

</details>

<details>
<summary>Claude Desktop</summary>

Follow the MCP install [guide](https://modelcontextprotocol.io/quickstart/user), use the standard config above.

</details>

<details>
<summary>Codex</summary>

Use the Codex CLI to add the Inoreader MCP server:

```bash
codex mcp add inoreader \
  --env INOREADER_APP_ID=your-app-id \
  --env INOREADER_APP_KEY=your-app-key \
  -- bunx github:seiji/inoreader-mcp-server
```

Alternatively, create or edit the configuration file `~/.codex/config.toml` and add:

```toml
[mcp_servers.inoreader]
command = "bunx"
args = ["github:seiji/inoreader-mcp-server"]
env = { INOREADER_APP_ID = "your-app-id", INOREADER_APP_KEY = "your-app-key" }
```

</details>

<details>
<summary>VS Code</summary>

Follow the MCP install [guide](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server), use the standard config above. You can also install the Inoreader MCP server using the VS Code CLI:

```bash
code --add-mcp '{"name":"inoreader","command":"bunx","args":["github:seiji/inoreader-mcp-server"],"env":{"INOREADER_APP_ID":"your-app-id","INOREADER_APP_KEY":"your-app-key"}}'
```

</details>

Do not commit project-scoped config files that contain your App Key.

After configuring, authenticate once with `bunx github:seiji/inoreader-mcp-server auth login`
(with the environment variables set in your shell) or with the `auth_login` / `auth_complete`
tools. Tokens are stored in keychain and automatically refreshed.

## Available Tools

| Tool | Description |
|------|-------------|
| `auth_login` | Start OAuth flow and return an authorization URL |
| `auth_complete` | Finish the OAuth flow started by `auth_login` and save tokens |
| `auth_status` | Show current authentication status |
| `auth_logout` | Remove saved tokens from keychain |
| `get_user_info` | Get authenticated user information |
| `get_unread_counts` | Get unread counts for all feeds |
| `get_subscriptions` | List all RSS subscriptions |
| `get_folders_and_tags` | List folders and tags |
| `get_articles` | Get articles from feeds (with filters) |
| `get_starred_articles` | Get starred/saved articles |
| `add_subscription` | Subscribe to a new RSS feed |
| `remove_subscription` | Unsubscribe from a feed |
| `add_subscription_to_folder` | Add a subscription to a folder |
| `remove_subscription_from_folder` | Remove a subscription from a folder |
| `rename_subscription` | Rename a subscription (change its title) |
| `mark_as_read` | Mark articles as read |
| `mark_as_unread` | Mark articles as unread |
| `star_article` | Star/save an article |
| `unstar_article` | Remove star from article |
| `add_tag_to_article` | Add custom tag to article |
| `remove_tag_from_article` | Remove tag from article |

## Example Interactions

Once configured in your MCP client, you can ask:

- "Show me my unread articles"
- "What are my RSS subscriptions?"
- "Subscribe to https://example.com/feed.xml"
- "Mark all articles in my Tech folder as read"
- "Star the first article about AI"
- "How many unread articles do I have?"

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and testing commands, PR title
conventions, the squash merge policy, versioning rules, and release procedures.

The draft [MCP specification](docs/specification.md) defines the public contract
and pending design decisions. See [specification-to-test coverage](docs/test_coverage.md)
for tested scenarios and remaining gaps.

Maintainers: see [Repository Administration](docs/repository_administration.md)
for the release GitHub App setup and required PR title check settings.

## Troubleshooting

### "Keychain is not available"

**Linux**: Install libsecret-tools:
```bash
sudo apt install libsecret-tools
```

### "Token expired" errors

Run `bunx github:seiji/inoreader-mcp-server auth login` to re-authenticate.

## Disclaimer

This project is an unofficial, community-developed tool and is not affiliated with, endorsed by, or sponsored by Inoreader. "Inoreader" is a trademark of Innologica Ltd.

To use this MCP server, you must:
- Have your own [Inoreader Pro](https://www.inoreader.com/pricing) subscription (API access requires Pro)
- Register your own application at the [Inoreader Developer Portal](https://www.inoreader.com/developers/)
- Comply with Inoreader's [Terms of Service](https://www.inoreader.com/tos)

This project does not include any API keys or tokens. Each user must obtain their own credentials.

## License

MIT
