# Review regression tests

Run with Bun (validated with 1.3.6):

```bash
bun run test
bun run typecheck
bun run lint
```

The known review regressions have been fixed and the current suite is Green.
Assertions describe intended behavior; do not skip tests or change expectations
to accommodate bugs. Passing tests do not imply complete specification coverage.

## Specification and contract tests

The draft [MCP specification](../docs/specification.md) distinguishes baseline
behavior, required safety properties, and unresolved decisions. The
[coverage matrix](../docs/test-coverage.md) maps requirements to tests and lists
missing cases. In particular, the zero-timestamp expectation remains provisional
until its policy is approved; never silently broaden an accepted operation.

`mcp-contract.test.ts` starts the real server in an isolated subprocess and uses
the real MCP SDK client over stdio. `fixtures/server-preload.ts` mocks upstream
fetch and credential storage and blocks callback listening ports. Public tool
handlers remain real. Tests validate tool discovery, metadata/article payloads,
selection/defaults/pagination, input rejection without API effects, mutation
success envelopes, and application errors. They do not yet verify every mutation's
upstream body or the full OAuth lifecycle. Each test closes its server process.

Run these separately with `bun test tests/mcp-contract.test.ts`.

## Regression coverage

`auth-client.test.ts` tests the real authentication and API client logic with mocked external boundaries:

- OS credential storage is replaced with in-memory mocks. No real tokens are loaded, saved, or deleted.
- `fetch` is replaced; unexpected requests fail instead of accessing the network.
- `Bun.serve` is replaced to capture and invoke the OAuth callback handler without opening a port.
- No browser is launched. Environment variables and global spies are restored after each test.
- Auth promises are observed and cancelled during cleanup to avoid unhandled rejections or leftover timers.
- The concurrent 401 test uses a controlled refresh promise, not timing-based sleeps.

The tests cover token selection and refresh, OAuth success and denial, missing/incorrect OAuth state, stdout logging, pagination, batch item IDs, timestamp boundaries, folder encoding, and single/concurrent 401 retries, including shared failure, late 401 responses,
recovery after a failed refresh, and POST preservation.

These tests share process-wide mocks and must not run concurrently. Bun module mocks persist after `mock.restore()`; other test files that need the real credential-store module should run in a separate process or adopt a shared mocking strategy.

## Not yet verified

- Real Inoreader API responses and OAuth provider behavior.
- Real macOS Keychain / Linux libsecret integration.
- Auth login/complete over MCP and strict raw stdout validation. Offline stdio
  initialization, discovery, logout, and read/mutation calls are tested, and SDK
  transport parsing errors are checked. Internal stdout regressions also assert
  calls to `console.log`; this is not a complete raw-stream conformance test.
- Browser launching, actual callback-server binding, and the five-minute timeout.

The current main branch has matching README and implementation redirect URIs (`http://localhost:19812/callback`). The earlier mismatch finding applied only to `support-windows`.

Both `.github/workflows/ci.yaml` and `.github/workflows/release.yaml` run `bun run test` alongside lint and type checking. Failures are not ignored: any failing regression causes its check job to fail
and prevents the dependent Release Please job from running. Do not bypass failures.

Bun coverage in the parent test runner does not aggregate execution in contract-
test subprocesses. Use the specification coverage matrix to track those cases;
a missing `src/index.ts` in the coverage table does not mean it was never exercised.

For contribution and release policies, see [CONTRIBUTING.md](../CONTRIBUTING.md#testing).
