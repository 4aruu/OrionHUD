# orionhud-bridge

Lets coding agents (Claude Code, Cursor, any MCP client) read and update the task tree in the [OrionHUD](../README.md) Chrome extension. One dependency-free Node file that is both a stdio MCP server and a Chrome native-messaging host.

Setup steps: [../README.md#agent-bridge-claude-code-cursor](../README.md#agent-bridge-claude-code-cursor). Security: [../docs/bridge-threat-model.md](../docs/bridge-threat-model.md).

```
orionhud-bridge install --extension-id <id>   register the native-messaging host (per user, no admin)
orionhud-bridge uninstall                     remove everything install created
orionhud-bridge status                        what's installed; is Chrome connected
orionhud-bridge mcp                           MCP server on stdio (your agent runs this)
orionhud-bridge native-host                   started by Chrome, not by you
```

Tools: `get_current_task`, `list_open_subtasks`, `add_subtask`, `complete_task`, `log_decision`.

Built from the repo root with `npm run build` into `dist/orion-bridge.mjs`. Marked `private` so it can't be published by accident; until the project publishes it, run it with `npx --package=./bridge orionhud-bridge …` from the repo, never `npx orionhud-bridge` from the registry.
