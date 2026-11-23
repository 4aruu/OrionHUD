# v0.3 agent bridge: design

Date: 2026-11-23 · Status: implemented · Threat model: [docs/bridge-threat-model.md](../../bridge-threat-model.md)

## Goal

Coding agents (Claude Code, Cursor) read and update the same task tree the side panel shows, through five small MCP tools. The extension stays the single writer of IndexedDB. Without the bridge, nothing changes.

## Shape

```
Claude Code ──stdio JSON-RPC──▶ orion-bridge mcp ──local socket, framed, token──▶ orion-bridge native-host ──stdio, framed──▶ service worker
 (spawns it)                     (one per agent)     (named pipe / unix socket)     (spawned by Chrome)       connectNative      handleBridgeRequest
                                                                                                                                  └▶ workflowActions ▶ IndexedDB
```

Two processes are needed because Chrome spawns the native host and the agent spawns the MCP server; neither can start the other. They meet on a per-user socket and authenticate with a random token the host writes to a user-only file.

One Node file (`bridge/dist/orion-bridge.mjs`, no runtime dependencies) plays every role:

| Command | Started by | Job |
|---|---|---|
| `install --extension-id <id>` | the user, once | copies itself to a stable per-user folder, writes the launcher + host manifest (`allowed_origins` = that one extension), registers it (Windows: `HKCU` registry key) |
| `uninstall` | the user | removes all of the above |
| `status` | the user | shows what is installed and whether a host is running |
| `native-host` | Chrome (`connectNative`) | relays framed requests between agents and the extension |
| `mcp` | the agent | stdio MCP server with 5 tools |

## Tools (deliberately few)

| Tool | Args | Effect |
|---|---|---|
| `get_current_task` | none | `buildBrief()` Markdown for the active task: the brief format is the contract |
| `list_open_subtasks` | none | open descendants of the active task, with ids |
| `add_subtask` | `title`, `parent_id?` | `addTask` under the active task or one of its descendants |
| `complete_task` | `task_id` | `completeTask` (no cascade: open children are an error) |
| `log_decision` | `text`, `task_id?` | `addNote(kind: "decision")` |

Writes are scoped to the active task's subtree. An agent can't touch other branches or workflows, or delete anything.

## Wire protocol

Every hop uses the same codec: 4-byte native-endian length prefix + UTF-8 JSON (Chrome's native messaging framing). Shared parsers live in `src/shared/bridgeProtocol.ts` and run at every hop (MCP server, host, worker).

- host → extension: `{v:1, type:"hello", version}` once, then `{v:1, type:"request", id, method, params}`
- extension → host: `{v:1, type:"response", id, ok:true, text}` or `{..., ok:false, code, message}`
- agent → host socket: `{v:1, type:"auth", token}` first, then requests; the host re-numbers ids so agents can't collide.

Responses are formatted text only. No raw storage objects cross the boundary.

## Extension side

- `nativeMessaging` is an **optional** permission, requested from Settings → Agent bridge.
- `src/background/bridge.ts` calls `connectNative` when the worker starts and when the permission is granted. An open native port keeps the MV3 worker alive (Chrome 105+), which is what lets it answer. The only thing held in memory is the port handle; status goes to `chrome.storage.session` for the panel.
- Host missing → status "not installed", no retries. A live connection that drops → one retry alarm a minute later.
- Every successful write broadcasts `ORION_STATE_CHANGED` (`reason: "bridge"`), so an open panel reloads.

## Edge cases

- No active task: tools answer "No task is active…" as a tool error, so the agent can tell the user.
- Task switched between the agent's two calls: ids are checked against the subtree at execution time; an out-of-scope id is rejected.
- Agent completes the active task itself: same as in the panel (no task active afterwards).
- Two Chrome profiles: the second host finds the socket taken, waits ~2 s, then exits; the panel shows the error.
- Host restarts (extension reload): a new token is written; the MCP server reads it on every call.
- Oversized or malformed frames: the connection is dropped before the body is buffered.

## Files

New: `src/shared/bridgeProtocol.ts`, `src/shared/bridgeService.ts`, `src/background/bridge.ts`, `bridge/**`, `docs/bridge-threat-model.md`.
Changed: `manifest.json` (optional permission, 0.3.0), `package.json` (build/typecheck include the bridge), `src/shared/messages.ts` (`bridge` reason, `ORION_BRIDGE_CONNECT`), `src/background/index.ts`, `Settings.tsx`, `dev/chromeShim.ts`, `README.md`, `PRIVACY.md`.

## Verification

`npm run typecheck && npm test && npm run build`, plus the manual checklist in the README (Claude Code connects, completes a subtask, panel updates).
