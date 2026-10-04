# MCP Server specification

Status: draft, based on the current main implementation and intended safety requirements.
This is a behavioral contract, not a claim that every requirement is implemented.

- **Baseline** describes the existing public behavior selected for compatibility.
- **Required** describes safety/correctness behavior, including known implementation gaps.
- **Decision pending** is a proposal requiring maintainer approval before becoming a
  new compatibility guarantee. Existing tests do not by themselves approve proposals.

Normative IDs below are mapped to evidence in [test coverage](test-coverage.md).
SDK-generated descriptions, exact human-readable messages, JSON indentation, and
object key order are not compatibility guarantees. Protocol/server version policy
is a decision pending; the current server advertises a version different from
`package.json`, so tests do not freeze the hard-coded value.

## Transport and responses

- **MCP-001 — Baseline:** The server uses MCP stdio, completes initialization, and
  exposes the 21 tools listed below with object input schemas. Clients use the
  installed MCP SDK's protocol negotiation; a specific protocol revision is not
  fixed by this draft.
- **MCP-002 — Required:** stdout contains MCP messages only. Diagnostics belong on
  stderr. Auth tools must not emit human-readable output to stdout. CLI auth
  commands are a separate interface and may print human-readable output.
- **ERROR-001 — Baseline:** Application-handled failures return `isError: true`
  with one text content block containing JSON `{ "error": string }`. Successful
  application responses have one JSON text block and do not set `isError: true`.
  Failed upstream operations must not be reported as successful mutations.
- **ERROR-002 — Baseline:** A read without an environment or stored token returns
  an authentication tool error without making an API request.
- **INPUT-001 — Baseline:** Missing required arguments, wrong types, and values
  outside declared schema limits are rejected before API effects. SDK validation
  errors are distinct from application errors: they may have non-JSON error text.
  Unknown tool calls are protocol-level errors. Exact SDK error wording is not fixed.

## Public tool inventory

Types below describe the current schema. A string is not implicitly a non-empty
string or a validated URL. Extra-argument handling is delegated to the SDK/schema;
strict rejection of unknown properties is not specified here.

| Tool | Arguments | Successful JSON payload |
| --- | --- | --- |
| `auth_login` | none | `{ authUrl: string, message: string }` |
| `auth_complete` | none | `{ success: true, message: string }` |
| `auth_status` | none | authentication status described below |
| `auth_logout` | none | `{ success: true, message: string }` |
| `get_user_info` | none | upstream user information (`UserInfo` in `src/types.ts`) |
| `get_unread_counts` | none | `{ max: number, counts: [{ id: string, count: number }] }` |
| `get_subscriptions` | none | `{ count: number, subscriptions: [{ id, title, url, categories: string[] }] }` |
| `get_folders_and_tags` | none | `{ folders: string[], tags: string[] }` |
| `get_articles` | `stream_id?: string`, `count?: number` (1–100, default 20), `unread_only?: boolean` (default true), `continuation?: string` | article page |
| `get_starred_articles` | `count?: number` (1–100, default 20), `continuation?: string` | article page |
| `add_subscription` | `feed_url: string`, `title?: string` | `{ success: true, result: upstream result }` |
| `remove_subscription` | `subscription_id: string` | `{ success: true, message: string }` |
| `mark_as_read` | `item_ids?: string[]`, `stream_id?: string`, `older_than?: nonnegative integer` | `{ success: true, message: string }` |
| `mark_as_unread` | `item_ids: string[]` | `{ success: true, message: string }` |
| `star_article` / `unstar_article` | `item_id: string` | `{ success: true, message: string }` |
| `add_tag_to_article` / `remove_tag_from_article` | `item_id: string`, `tag_name: string` | `{ success: true, message: string }` |
| `add_subscription_to_folder` / `remove_subscription_from_folder` | `subscription_id: string`, `folder_name: string` | `{ success: true, message: string }` |
| `rename_subscription` | `subscription_id: string`, `title: string` | `{ success: true, message: string }` |

### Reads

- **READ-001 — Baseline:** User information is returned as upstream JSON. Unread
  counts omit entries with count zero. Subscription categories are projected to
  label strings and `count` is the number returned. The current folder/tag view
  projects `/label/` IDs to names, excludes `/state/com.google/` IDs, and preserves
  other tag IDs. Semantically distinguishing folders from article labels is pending.
- **READ-002 — Baseline:** Without `stream_id`, `get_articles` reads the reading
  list. An explicit stream selects that stream. `unread_only: true` excludes the
  read state; false does not request that exclusion. Starred retrieval selects
  the starred stream and includes read items. Continuation is opaque and is
  forwarded unchanged; it is not an offset or a total-page count.
- **READ-003 — Baseline:** An article page contains `{ count, articles,
  continuation? }`. `count` is the returned array length. Each article contains
  `id`, `title`, `url`, `author`, `published`, `isRead`, and `isStarred`. URL priority
  is first canonical href, then first alternate href, then empty string. Missing
  author/published default to `""`/`0`. Read/starred flags reflect category membership.
  Origin adds `feedTitle`. A non-empty summary adds `summary`; content longer than
  500 JavaScript string code units is truncated to 500 plus `...`. HTML is not
  stripped. No guarantee of a full article body is made.
- **READ-004 — Baseline:** Empty pages return `{ count: 0, articles: [] }`; a missing
  upstream continuation is omitted, not converted to an empty string or null.

### Mutations

- **WRITE-001 — Baseline:** `mark_as_read` requires a non-empty `item_ids` array or
  a truthy `stream_id`. `older_than` requires a stream and cannot be combined with
  non-empty `item_ids`. Rejected combinations return an application error before
  authentication/client creation or API effects. Negative/fractional timestamps
  are schema errors. Whether item IDs and a stream without a timestamp should be
  mutually exclusive is a decision pending (current implementation prioritizes IDs).
- **WRITE-002 — Baseline:** Valid mutations call the upstream operation and report
  success only after it succeeds. Batch IDs must all be retained. Article tags
  use `user/-/label/<name>`. Folder add/remove and rename affect the specified
  subscription. Messages are informational, not evidence of a transactional API
  guarantee; the server does not read back upstream state.
- **API-001 — Required:** Folder names, including spaces, non-ASCII characters,
  and `%`, survive one form decode unchanged. Encoding is applied at the HTTP
  serialization boundary, not twice.
- **TIME-001 — Required:** An accepted explicit timestamp must not be silently
  dropped. The policy for zero is pending below. A rejected value must have no
  API effect. Omitting `older_than` intentionally requests stream-wide read marking.

## Authentication

- **AUTH-001 — Baseline:** Status never exposes access/refresh tokens. With an
  environment token it returns `{ authenticated: true, keychainAvailable,
  source: "environment" }`. With no saved tokens: `{ authenticated: false,
  keychainAvailable, source: null }`. Stored tokens add `source: "keychain"`,
  `expiresInMinutes: number | null`, and `expired: boolean`. `authenticated` here
  means credentials exist, not that the provider just validated them.
- **AUTH-002 — Baseline:** Completing without a pending flow returns a JSON tool
  error. Login returns a browser authorization URL without opening a browser from
  the MCP tool. Complete waits for token exchange/storage; success clears the
  pending flow and cached API client. Logout deletes saved tokens and clears the
  cached client; it cannot remove an environment-provided token.
- **AUTH-003 — Baseline:** Environment tokens take precedence. Stored tokens with
  expiry before now plus five minutes are refreshed when a refresh token exists.
  Successful refresh saves the new access token/expiry and preserves the old
  refresh token if the provider omits a replacement. Missing credentials and
  refresh failures produce authentication errors.
- **AUTH-004 — Required:** Each OAuth flow has a fresh, unpredictable state.
  Missing/mismatched state must not exchange or save tokens. It must not consume
  the legitimate pending flow. Successful callbacks, provider denial, missing
  code, cancellation, and timeout must settle and clean up the flow; rejection
  must be observed even if `auth_complete` has not been called. Timeout is five minutes.
- **API-002 — Required:** An API 401 can trigger at most one auth retry per request.
  Retrying preserves the original operation. Concurrent requests on one client
  wait for a shared refresh and use the resulting token, rather than treating
  another request's retry as their own failure. Refresh failure is reported to
  every waiter. A second 401 terminates with an authentication error.
- **API-003 — Baseline:** Upstream JSON is parsed as JSON, text mutation responses
  are accepted, and other non-success statuses become errors. HTTP 403 currently
  maps to an authentication error; 429/5xx are not automatically retried. Error
  classification and retry/backoff changes require a separate decision.

### Auth state outline

```text
idle --auth_login--> pending
pending --auth_complete waits--> exchanging/storing --> idle (success/error)
pending --provider denial/cancel/timeout--> settled error
idle --auth_complete--> tool error
```

The implementation may save tokens as soon as the callback arrives, before
`auth_complete` is invoked. Restarting login currently cancels the previous flow;
concurrent login/complete/logout semantics are not yet a stable contract.

## Decisions pending

| ID | Proposal / unresolved question | Current evidence |
| --- | --- | --- |
| D-001 | For `older_than: 0`, preserve the accepted value; alternatively reject zero explicitly. Never silently broaden the operation. | Existing Red test selects preservation provisionally, not as an approved policy. |
| D-002 | Reject simultaneous non-empty item IDs and stream even without a timestamp? | Current code selects IDs; no new rejection test until decided. |
| D-003 | Require integer article counts, non-empty IDs/names and valid feed URLs? | Current schemas permit fractional counts, empty strings, and arbitrary URL strings. |
| D-004 | On logout, cancel a pending login and prevent late token saves? How should concurrent auth calls behave? | Current logout does not cancel the pending flow. |
| D-005 | Publish version from package.json and pin supported protocol revisions? | Current advertised version is hard-coded; SDK negotiates protocol. |
| D-006 | Separate folders from article tags using provider metadata? | Current label-based projection may classify article labels as folders. |

## Scope and exclusions

CLI browser commands, OS credential-store integration, provider rate limits,
network timeouts, and real account effects require separate integration evidence.
Offline MCP tests prove the server/SDK contract against controlled upstream
responses, not Inoreader's real behavior. See the coverage matrix for explicit gaps.
