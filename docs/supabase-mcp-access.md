# Supabase MCP across organizations

Checked 1 November 2026, after the owner requested future access to Artie's Projects and SoleVault.

## Observed connection

- The connected ChatGPT Supabase app works and lists **Artie's Projects** only. Its existing scope was not changed.
- The official hosted MCP endpoint responds with HTTP 401 without authentication, which confirms reachability rather than a service outage.
- The local Codex MCP configuration and `codex mcp list` have no separate Supabase server. No existing local Supabase credential was inspected, created or copied.
- A project `.mcp.json` is absent. That is not the cause of the ChatGPT connector's organization limit, and creating a Claude-specific configuration file would not change Codex's connection.

Supabase's [maintainer explanation](https://github.com/supabase/mcp/issues/304) confirms hosted OAuth grants are scoped to one organization. Reauthorizing the same ChatGPT integration with SoleVault would replace the working Artie's Projects scope again.

## Supported separate connection

Supabase now supports [scoped personal access tokens across multiple selected organizations](https://supabase.com/blog/scope-your-personal-access-tokens), usable with its [official MCP endpoint](https://supabase.com/docs/guides/ai-tools/mcp). Codex's installed CLI supports an HTTP MCP server whose bearer token comes from an environment variable.

Use a **separate** local connection named `supabase-multi-org`, preserving the ChatGPT app connection. A safe initial configuration is read-only discovery across the two owner-selected organizations:

```sh
codex mcp add supabase-multi-org \
  --url 'https://mcp.supabase.com/mcp?read_only=true' \
  --bearer-token-env-var SUPABASE_MCP_ACCESS_TOKEN
```

This command was verified against installed `codex mcp add --help`; it has **not** been executed because no scoped token is configured. Adding an unusable connection would only create an authentication error at startup.

The owner must create the token in Supabase's [Access Tokens](https://supabase.com/dashboard/account/tokens) screen and make it available securely to the Codex process on the Mac mini. Do not paste it into chat, a tracked file, a CLI argument, or screenshots. Use the No access preset, select only the intended resources, add discovery/database read permissions, and set an expiry. Supabase warns that the broad Read-only preset includes secrets, so do not use it indiscriminately. For later implementation work, grant the necessary database/migration write permissions only for the target project in a separate scoped connection; retain read-only access elsewhere.

A shell variable set in Terminal is not automatically inherited by an already-running desktop app. After secure configuration and any required Codex restart/reload, verify with the actual MCP tools:

1. `list_organizations` returns both intended organizations.
2. `list_projects` returns the expected projects without opening application rows.
3. A bounded metadata query works against each selected target.
4. Record the configured scope and expiry without recording the token.

Until those checks pass, **multi-organization access is prepared, not active**. Never request a project secret/service-role key for this purpose: project data keys do not authorize organization management.
