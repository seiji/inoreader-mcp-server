# Specification-to-test coverage

This matrix refers to the draft [specification](specification.md). It measures
behavioral evidence, not line coverage. A test that mentions an ID does not imply
all its branches are covered.

- **Partial / Green:** tested scenarios pass; listed scenarios remain untested.
- **Partial / Red:** some intended requirements are exercised and fail; remaining
  scenarios are still untested. Red is not verified conformance.
- **Provisional:** expected behavior depends on a decision pending.

## Evidence matrix

`contract` means `tests/mcp-contract.test.ts`; `regression` means
`tests/auth-client.test.ts`. Contract cases carry IDs in their names. Regression
cases are mapped by their existing descriptive names below.

| ID | Evidence | Status | Remaining scenarios |
| --- | --- | --- | --- |
| MCP-001 | contract: initializes over stdio and lists all public tools | Partial / Green | Schema details for every argument, protocol compatibility revisions |
| MCP-002 | regression: starting auth / logout stdout assertions | Partial / Red | Raw stdout validation, auth tool calls through stdio, non-console writes |
| ERROR-001 | contract: API failure + successful read/mutation payloads | Partial / Green | Error propagation for every mutation, malformed upstream data, storage errors |
| ERROR-002 | contract: unauthenticated read has no API call | Partial / Green | Other read/mutation tools, revoked credentials |
| INPUT-001 | contract: article counts 0/101 rejected, fixture detects API access | Partial / Green | Wrong types, missing required args, count 1/100 for both article tools, unknown tools |
| READ-001 | contract: all four metadata JSON shapes | Partial / Green | Empty metadata, multiple subscriptions/tags, malformed data |
| READ-002 | contract: default unread, explicit folder with read inclusion, all reading list, starred continuation; regression: unread pagination | Partial / Green | Explicit unread stream, counts 1/100, special stream IDs, multiple-page lifecycle |
| READ-003 | contract: article fixture checks canonical/alternate/missing URL, defaults, flags, feed and summary | Partial / Green | Summary lengths 0/500, independent read/star flags, absent items data |
| READ-004 | contract: empty page and absent continuation | Partial / Green | Empty starred page, terminal page after continuation |
| WRITE-001 | contract: four invalid combinations with API forbidden; valid ID and timestamp paths | Partial / Green | Negative/fractional timestamps, stream-only and empty-array+stream, pending D-001/D-002 |
| WRITE-002 | contract: success response for all mutation tools; regression: batch IDs | Partial / Green | Exact upstream request/effect for each mutation, failure/partial batch behavior; success fixtures alone do not prove effects |
| API-001 | regression: add/remove folders with ASCII/space/Japanese/percent names | Partial / Red | API contract through MCP, slash-containing names and real provider behavior |
| TIME-001 | regression: timestamps 0 and positive | Provisional / Red | Approve D-001, omitted timestamp, upper range, upstream timestamp semantics |
| AUTH-001 | contract: environment status has no credentials | Partial / Green | Keychain/unavailable/expired/unknown-expiry status |
| AUTH-002 | contract: complete without login | Partial / Green | Login/complete success over MCP, cache invalidation, logout, concurrent auth calls (D-004) |
| AUTH-003 | regression: environment priority, missing/valid/expired tokens | Partial / Green | Five-minute boundary, refresh-token fallback, refresh/network/storage failure |
| AUTH-004 | regression: valid callback, state missing/mismatch, provider denial | Partial / Red | Invalid state followed by valid callback, unique state, timeout/cancel/missing-code, unhandled rejection prevention |
| API-002 | regression: single 401, second 401, concurrent 401 | Partial / Red | POST preservation, failed shared refresh, independent successive requests |
| API-003 | regression: JSON reads and text mutations; contract: 500 response | Partial / Green | 403/429/other 5xx, empty/204/205, invalid JSON, transport errors |

No ID is claimed fully covered. Draft decisions D-001 through D-006 are not
included in a conformance percentage. Do not count them as passed merely because
current code exhibits a particular behavior.

## Test layers and isolation

1. **Offline stdio contracts:** start the real `src/index.ts` in a fresh subprocess
   for each case, connect the real SDK client over stdio, and invoke public tools.
   The preload replaces only API fetch and credential storage, and blocks callback
   listening ports. It does not replace tool registration or handlers. Every
   subprocess is closed after its test. Forbidden-API cases emit a stderr sentinel
   so accidental API effects cannot masquerade as successful input rejection.
2. **Auth/client regression tests:** invoke real internal logic with controlled
   callback/fetch/storage boundaries. Shared parent-process mocks require sequential
   execution. They test mechanisms, not the complete MCP contract.
3. **Live integration:** not implemented. Provider OAuth/account effects, actual
   callback binding, browser launching, and OS credential stores remain unverified.

The stdio fixtures permit successful mutation endpoints without checking every
body field; this is deliberate response-contract coverage, not mutation-effect
coverage. Strengthen adapter request tests before claiming WRITE-002 is complete.

## Measurement

```bash
# Public MCP contract cases only
bun test tests/mcp-contract.test.ts

# All tests, including known Red regressions
bun run test

# In-process execution coverage
bun run test --coverage
```

Bun coverage counts executed code even in failing tests and only tracks loaded
modules. The parent runner does not aggregate coverage from the MCP subprocesses;
`src/index.ts` may therefore be absent from its coverage report despite being
exercised by contract tests. Mocked credential-store implementation is also absent.
Use this matrix alongside line/function coverage rather than a misleading whole-
repository percentage. SDK validation text is not required to be application JSON.
