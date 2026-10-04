# Inoreader MCP Server

## Development Commands

```bash
# Install dependencies
bun install

# Run tests
bun run test

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

## Contribution Workflow

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before preparing changes or PRs. It is
  the source of truth for contribution, versioning, and release policies.
- Keep changes focused on one concern and run the relevant tests, type checker,
  and linter. See [tests/README.md](tests/README.md) for coverage, mock isolation,
  and the current test-first status.
- Read [docs/specification.md](docs/specification.md) for public contracts and
  pending decisions. Maintain [docs/test-coverage.md](docs/test-coverage.md) and
  reference specification IDs in public contract tests; do not infer full coverage
  from line percentages or approve unresolved policies implicitly.
- For bug fixes, add a failing regression test before changing the implementation.
  Do not skip tests or weaken expectations to accommodate bugs. Distinguish known
  Red tests from new failures when reporting validation results.
- Keep default tests offline and isolated from real credential stores; restore
  global mocks and environment variables, and clean up promises and timers.
- CI and release workflows run `bun run test`, type checking, and linting. Do not
  bypass failing tests with `continue-on-error` or equivalent settings.
- Use Conventional Commit PR titles: `<type>[optional scope][!]: <description>`.
  Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `build`, `ci`, `chore`, and `revert`. For example, `fix(auth): handle expired
  tokens`. Use `!` for breaking changes.
- Use squash merging with the validated PR title as the squash commit message.
  Individual commits within a PR do not need to follow Conventional Commits.
- Wait for required checks, including **Validate PR title**, to pass before merging.
- Release Please manages version bumps, release tags, and GitHub Releases. Do
  not manually update `package.json` versions or `.release-please-manifest.json`,
  or create release tags, unless explicitly performing a release migration or
  recovery.

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
- Subscription folder management (add/remove from folders, rename)
- All MCP tools return JSON responses

### Environment Variables
- `INOREADER_APP_ID` - Inoreader App ID (required for auth)
- `INOREADER_APP_KEY` - Inoreader App Key (required for auth)
- `INOREADER_ACCESS_TOKEN` - Override keychain token (optional)
