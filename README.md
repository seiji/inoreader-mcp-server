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
bunx github:seiji/inoreader-mcp-server#v0.1.0   # specific version
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
bun run src/index.ts auth login
```

Tokens are securely stored in your system keychain:
- **macOS**: Keychain Access
- **Linux**: GNOME Keyring / KDE Wallet (via libsecret)

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

### Claude Desktop Configuration

Add to your Claude Desktop config (`claude_desktop_config.json`):

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

**Note**: Before running the auth command, ensure `INOREADER_APP_ID` and `INOREADER_APP_KEY` are set in your shell environment (see **2. Set Environment Variables** above). After configuring, run `bunx github:seiji/inoreader-mcp-server auth login` once to authenticate. Tokens are stored in keychain and automatically refreshed.

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development commands, PR title
conventions, the squash merge policy, versioning rules, and release procedures.

## Repository Administration

### Maintainer setup

Create a private GitHub App with **Contents**, **Issues**, and **Pull requests**
repository permissions set to **Read and write**. Disable webhooks; no server or
OAuth callback is required. Install the App on this account and grant access
only to this repository.

Under **Settings → Secrets and variables → Actions**, add:

- Repository variable `RELEASE_APP_CLIENT_ID`: the App's Client ID.
- Repository secret `RELEASE_APP_PRIVATE_KEY`: the complete PEM private key,
  including its BEGIN/END lines, generated in the App's settings.

The workflow generates an installation access token scoped to this repository
for each run. The token expires after one hour and is revoked when the job ends.
No personal access token is required. Keep the private key out of the repository
and rotate it periodically.

Using the App token allows release PRs to trigger the existing `pull_request`
CI workflow. PRs and tags created with the default `GITHUB_TOKEN` do not trigger
other Actions workflows.

### Required PR title check

PR title conventions and the merge policy are documented in
[CONTRIBUTING.md](CONTRIBUTING.md#pull-requests).

The **Validate PR title** check runs when a PR is opened, reopened, edited,
updated with commits, or marked ready for review. It uses `pull_request_target`
to support fork PRs, reads only PR metadata, and never checks out or executes PR
code. The workflow must be merged into the default branch before it can run.

To enforce this check before merging:

1. Under **Settings → General → Pull Requests**, allow only squash merging and
   set the default squash commit message to **Pull request title**.
2. Under **Settings → Rules → Rulesets**, create or edit an active branch ruleset
   targeting `main`.
3. Enable **Require a pull request before merging** and **Require status checks
   to pass**. Add **Validate PR title** as a required check, selecting GitHub
   Actions as its expected source. If the check is not listed, run it on a PR
   after the workflow has been merged, then return to the settings.
4. Limit bypass permissions so that the rule applies to everyone who merges PRs.

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
