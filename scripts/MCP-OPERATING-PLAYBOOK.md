# MCP Operating Playbook (Cursor + DIVE V3)

## What MCP Is (Plain English)

MCP (Model Context Protocol) is how an AI chat can use real tools instead of only text reasoning.

- Without MCP: the model can only read your prompt/files and guess.
- With MCP: the model can call tools (GitHub, Vault, Keycloak, MongoDB, etc.) and return live results.

Think of MCP as a toolbelt attached to an AI session.

## Who Can Use MCP in Cursor

MCP is available to the chat/agent runtime that supports tool execution and is connected to your MCP config.

- Cursor agent/chat with MCP enabled: can use MCP tools.
- Third-party plugin chats in Cursor (for example external Codex/Claude plugin paths): may not have MCP tool access unless that integration explicitly supports Cursor MCP runtime.

Rule of thumb: if that chat cannot run tools, it cannot use MCP.

## Does MCP Trigger Automatically?

Not by keyword alone.

Mentioning "Keycloak" does **not** guarantee the model will call Keycloak MCP tools.

Best practice:

1. Name the MCP server explicitly.
2. Ask for a concrete tool action.
3. Ask for returned data and a summary.

Example:

`Use the keycloak-admin MCP to list realms and report any disabled realm.`

## Best Prompt Pattern

Use this format for reliable tool calls:

1. Scope: `Use <server-name> MCP`
2. Action: `run <operation>`
3. Output format: `return raw result + brief summary`
4. Safety: `read-only` or `no writes`

Example:

`Use GitHub MCP (read-only) to list failed workflows on this repo in the last 24h. Return job URLs and a 5-bullet summary.`

## Recommended Team Workflow

1. Verify MCP status (green/connected) in Cursor.
2. Start with read-only prompts.
3. Move to write actions only with explicit confirmation.
4. Ask the agent to state which MCP server/tools it used.
5. Save key outputs in PR comments or docs.

## Security Guardrails

1. Use least-privilege tokens.
2. Prefer read-only modes by default.
3. Rotate tokens regularly.
4. Never commit secrets into repo config.
5. Keep production write tools separate from dev/test where possible.

## Quick Troubleshooting

If MCP seems ignored:

1. Confirm you are in a Cursor mode that supports tools.
2. Confirm MCP server is connected.
3. Use an explicit prompt: `Use <server> MCP to ...`
4. Check token/env values in `.cursor/mcp.json`.
5. Restart Cursor after MCP config changes.

## DIVE V3 MCP Checklist

For this repo, validate these before use:

1. `github`: PAT configured.
2. `vault`: `VAULT_ADDR` + `VAULT_TOKEN` valid.
3. `terraform`: `TFE_TOKEN` set if using HCP/TFE operations.
4. `mongodb`: connection string set.
5. `redis`: host/port/password set.
6. `cloudflare`: Wrangler auth available if required by chosen server mode.
7. `postgres`: URI points to expected DB.

## One-Line Operator Prompt

`Use available MCP tools where relevant; if tool access is unavailable, say so explicitly and continue with file-based analysis.`
