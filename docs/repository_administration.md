# Repository Administration

## Maintainer setup

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

## Required PR title check

PR title conventions and the merge policy are documented in
[CONTRIBUTING.md](../CONTRIBUTING.md#pull-requests).

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
