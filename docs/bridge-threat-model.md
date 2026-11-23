# Agent bridge threat model

Date: 2026-11-23 · Applies to: OrionHUD 0.3 agent bridge (`bridge/`, `src/background/bridge.ts`, `src/shared/bridge*.ts`) · Design: [specs/2026-11-23-agent-bridge-design.md](superpowers/specs/2026-11-23-agent-bridge-design.md)

## What we protect

1. **The task tree** (titles, notes, decisions, save points with tab URLs). It's private work context.
2. **Integrity of the plan.** An agent or a local attacker shouldn't be able to wipe or rewrite it.
3. **The browser.** The bridge must not become a way to drive Chrome or read other extension data.

## Trust boundaries

```
[agent process] ─stdio─▶ [mcp process] ─socket+token─▶ [native host] ─Chrome pipe─▶ [service worker] ─▶ IndexedDB
   untrusted input         same user                      launched by Chrome          single writer
```

| Boundary | Who can cross it | Control |
|---|---|---|
| Agent → MCP server | Whatever runs the agent (and the model's output, which may be prompt-injected) | 5 fixed tools; strict argument parsers (unknown keys, control characters, oversized or multi-line titles, malformed ids are rejected); tool errors instead of crashes |
| MCP server → host socket | Any process that can open the pipe/socket | Per-user location (unix socket in a `0700` dir; Windows pipe named per user profile); **32-byte random token** in a user-only file, checked with a constant-time compare; 3 s to authenticate; requests re-parsed; 16 KB frame cap checked from the header before buffering; 8 in-flight per client, 64 total |
| Host ↔ Chrome | Only Chrome can start the host | Host manifest `allowed_origins` is exactly `chrome-extension://<your id>/`; the host also re-checks the origin argument against its installed config and exits otherwise |
| Host → service worker | The host Chrome started | `nativeMessaging` is optional and off until the user turns it on; every message is re-parsed (`parseHostMessage`); unknown or malformed messages are dropped |
| Service worker → storage | Bridge requests | Only through `workflowActions` (same validation as the UI); **scoped to the active task's subtree**; no delete, no cascade-complete, no access to other workflows, inbox, settings, save points or tabs; responses are formatted text, never raw records; internal errors are replaced with a generic message |

## Threats and mitigations

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| T1 | **Prompt injection**: a web page or repo file tells the agent to mark everything done or log fake decisions | Scope limited to the active task subtree; nothing can be deleted; decisions are append-only and visible in the panel; complete refuses tasks with open children | An injected agent can still check off or add subtasks in the current task. The user sees it in the panel and can reopen (`Space`) or delete. |
| T2 | Another local process (same user) talks to the socket | Token in a user-only file; wrong token → disconnect, nothing forwarded (tested) | A process running **as the same user** can read the token file. Same-user code execution already owns the browser profile; out of scope. |
| T3 | Another OS user, or a remote machine, connects to the pipe | Unix: socket inside a `0700` directory. Windows: token file lives in the user's `%LOCALAPPDATA%` (ACL'd to that user); without it the host disconnects the client. | Windows named pipes get Node's default DACL; the token is the control. |
| T4 | A different extension or website launches the host | Chrome enforces `allowed_origins`; the host double-checks the origin; websites can't call `connectNative` | None known. |
| T5 | Malformed or huge frames (DoS, parser bugs) | Length checked from the 4-byte header before reading the body; invalid UTF-8/JSON drops the connection; MCP lines capped at 1 MB | A local flood can occupy the host; it only affects the bridge, not the extension. |
| T6 | Data exfiltration through responses | Only the brief, the open-subtask list and short confirmations are returned; no URLs beyond what the brief already contains (same as **Copy brief**) | The brief contains task titles, decisions and saved links: that is the point. It reaches the agent's model provider, as a pasted brief would. |
| T7 | Malicious bridge binary (supply chain) | No runtime dependencies (hand-written MCP + framing; about 1,000 lines including comments, readable in one sitting); `install` copies the bundle to a stable per-user folder so the npx cache isn't trusted later; package marked `private` so it isn't published by accident | The README tells users to run it from this repository. **Don't run `npx orionhud-bridge` from the registry until the owner publishes that name**: until then anyone could claim it. |
| T8 | Install-time injection (paths with quotes/`%` on Windows, spaces on posix) | `execFile` without a shell for `reg`; posix launcher single-quote escaped; Windows launcher refuses paths containing `" % ^ & \| < >` | None known. |
| T9 | Worker kept alive indefinitely | Expected: an open native port keeps the MV3 worker alive while the bridge is on. Turning the bridge off disconnects the port. | Small memory cost while on. |
| T10 | Stale or competing hosts (extension reload, two Chrome profiles) | Fresh token per host start; the MCP server re-reads it on every call; a second host waits ~2 s then exits with a clear error | With two profiles, only the first one serves agents. |

## Not in scope

- Malware running as the same OS user (can read the profile, the token, and IndexedDB directly).
- The agent's own permissions on your machine (file edits, shell). OrionHUD only grants it the five tools above.

## Verification

- `test/bridgeProtocol.test.ts`: parser rejection cases at every hop.
- `bridge/test/framing.test.ts`: split/packed frames, oversize header, invalid UTF-8/JSON.
- `test/bridgeService.test.ts`: scope rules, no cascade, limits, no internal error leakage.
- `bridge/test/e2e.test.ts`: real socket, wrong-token rejection, oversized-frame drop, full tool → action → storage path.
- `bridge/test/install.test.ts`: `allowed_origins`, launcher quoting, registry call arguments.
