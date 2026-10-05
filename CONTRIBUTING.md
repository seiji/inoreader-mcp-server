# Contributing

## Development

Install [Bun](https://bun.sh/) and clone the repository, then run:

```bash
# Install dependencies
bun install

# Run in development mode (with watch)
bun run dev

# Run tests
bun run test

# Type check
bun run typecheck

# Lint
bun run lint

# Format
bun run format
```

Before opening a PR, run the tests, type checker, and linter. For API credentials
and authentication, see the [README](README.md#authentication). Never commit
credentials or tokens.

### Testing

Use Bun's test runner (`bun run test`). Test files live in `tests/` and are also
included in type checking, linting, and formatting.

Start from the draft [MCP specification](docs/specification.md), not the current
implementation alone. Keep [specification-to-test coverage](docs/test_coverage.md)
updated when adding behavior or tests. Public contract tests reference specification
IDs; document unresolved decisions before treating a new expectation as a stable
contract. Passing response tests do not by themselves prove upstream side effects.

For bug fixes, first add a regression test that reproduces the problem, then
fix the implementation and verify that the test passes. Assert intended behavior;
do not skip tests or weaken expectations to accommodate existing bugs.

Keep the default test suite independent of external services: mock API requests
and OS credential storage, and do not use real credentials, launch browsers, or
open listening ports. Restore global mocks and environment variables, and clean
up pending promises and timers. Any future live integration tests should be
explicitly opt-in and separate from the default suite.

See [tests/README.md](tests/README.md) for coverage, mock isolation requirements,
unverified integration behavior, and the current test status. When introducing
regression tests, report expected Red tests separately from unrelated failures.
The test-first Red stage is temporary, not permission to bypass checks or merge
failing changes.

Both CI and the release workflow run tests, type checking, and linting. Test
failures fail the check jobs and prevent the dependent Release Please job from
running. All tests must pass before merging or releasing.

## Pull Requests

Keep each PR focused on one concern. PR titles must follow
[Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>[optional scope][!]: <description>
```

Examples:

```text
feat: add article search
fix(auth): handle expired tokens
refactor!: change the authentication interface
ci: configure Release Please
chore(main): release 0.4.0
```

Allowed types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, and `revert`. Scopes are optional. Use `!` before the
colon to indicate a breaking change in a PR title.

The **Validate PR title** check validates the title when the PR is opened,
reopened, edited, updated with commits, or marked ready for review. Do not
skip validation for release PRs; their generated titles follow this convention.

### Merge policy

Use **Squash and merge**, with the PR title as the squash commit message.
Individual commits within the PR do not need to follow Conventional Commits;
Release Please reads the resulting commits on `main`.

Review the PR and wait for required checks to pass before merging. Keep the
squash commit message consistent with the validated PR title: title validation
does not prevent manual changes to the message in the merge dialog.

For repository settings that enforce this policy, see
[Required PR title check](docs/repository_administration.md#required-pr-title-check).

## Versioning

[Release Please](https://github.com/googleapis/release-please) determines the next
version from the squash commits merged since the previous release.

| Change | Before 1.0.0 | From 1.0.0 onward |
|--------|--------------|------------------|
| `fix: ...` | Patch (`0.3.0` → `0.3.1`) | Patch (`1.2.3` → `1.2.4`) |
| `feat: ...` | Minor (`0.3.0` → `0.4.0`) | Minor (`1.2.3` → `1.3.0`) |
| Breaking change, such as `feat!: ...` | Minor (`0.3.0` → `0.4.0`) | Major (`1.2.3` → `2.0.0`) |

The pre-1.0 behavior is configured with `bump-minor-pre-major: true` in
`release-please-config.json`. A breaking change can also be indicated by a
`BREAKING CHANGE:` footer in the squash commit message.

Non-breaking `chore:`, `ci:`, `docs:`, `refactor:`, and other non-release changes
alone normally do not trigger a release PR. Passing title validation does not
necessarily mean that a PR triggers a version bump.

Version bumps are not counted per PR. Release Please applies the largest bump
required by the accumulated changes once: two fixes and one feature after
`0.3.0` produce `0.4.0`, not a separate increment for each PR.

Before 1.0.0, breaking changes do not automatically promote the project to
1.0.0. Maintainers must explicitly request that version, for example with a
`Release-As: 1.0.0` footer in a release-triggering squash commit message.

## Releases

Do not manually bump `package.json`, edit `.release-please-manifest.json`, or
create release tags during normal development.

1. Merge feature and fix PRs into `main` using the merge policy above.
2. After tests, type checking, and linting pass, Release Please creates or updates a
   release PR containing the next version in `package.json` and
   `.release-please-manifest.json`, plus `CHANGELOG.md`.
3. Review the version and changelog, wait for required checks to pass, and merge
   the release PR when ready to release. Several development PRs can be grouped
   into one release.
4. On the resulting push to `main`, the release workflow runs tests, type checking,
   and linting again. If they pass, Release Please creates the matching `v<version>`
   tag and GitHub Release.

This setup publishes GitHub Releases only; it does not publish to npm. The
migration starts from the existing `v0.3.0` release, with subsequent commits used
for the first automated changelog.

For GitHub App credentials, see [Maintainer setup](docs/repository_administration.md#maintainer-setup).
